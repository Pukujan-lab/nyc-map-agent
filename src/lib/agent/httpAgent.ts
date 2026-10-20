import { z } from "zod";
import type { AgentClient, AgentContext, AgentReply, ChatTurn } from "./client";
import { TOOL_DEFINITIONS, agentToolCallSchema } from "./tools";

/**
 * POST /api/chat — the contract the real model layer has to satisfy.
 *
 * Request body
 * {
 *   messages: [{ role: "user" | "assistant", content: string }],
 *   tools:    [...TOOL_DEFINITIONS],
 *   context:  {
 *     layer: "noise" | "crashes" | "combined",
 *     window: "90d" | "12mo",
 *     windowLabel: string,
 *     neighborhoods: [{ code, name, borough }],
 *     summary: { noise, crashes }   // borough totals + top neighborhoods
 *   }
 * }
 *
 * Response body (validated with zod below)
 * {
 *   text: string,
 *   toolCalls: [{ name: "query_data" | "fly_to" | "set_layer" | "highlight", args }],
 *   spoken?: string
 * }
 *
 * Rules the server must uphold:
 * - INFERHUB_API_KEY stays server-side; never echo it.
 * - Every number in `text` must come from `query_data` against the provided
 *   context. The client shows "show query" from executed tool calls only, so a
 *   fabricated figure is immediately visible.
 * - Always emit at least one of `fly_to`, `set_layer`, `highlight`.
 *
 * Selected with VITE_AGENT_MODE=http.
 */

const replySchema = z.object({
  text: z.string().min(1),
  toolCalls: z.array(agentToolCallSchema).default([]),
  spoken: z.string().optional(),
});

function summarize(result: AgentContext["noise"]): unknown {
  if (!result) return null;
  const top = [...result.ntas]
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .map((nta) => ({
      ntaCode: nta.ntaCode,
      count: nta.count,
      nightCount: nta.nightCount,
      injured: nta.injured,
      killed: nta.killed,
      cyclists: nta.cyclists,
      topTypes: nta.topTypes,
    }));
  return {
    totalRows: result.totalRows,
    unassignedCount: result.unassignedCount,
    boroughs: result.boroughs.map((borough) => ({
      borough: borough.borough,
      count: borough.count,
      injured: borough.injured,
      killed: borough.killed,
      cyclists: borough.cyclists,
      factors: borough.factors.slice(0, 5),
    })),
    topNeighborhoods: top,
  };
}

export class HttpAgentClient implements AgentClient {
  async send(messages: ChatTurn[], context: AgentContext): Promise<AgentReply> {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages,
        tools: TOOL_DEFINITIONS,
        context: {
          layer: context.layer,
          window: context.windowId,
          windowLabel: context.windowLabel,
          neighborhoods: (context.boundaries ?? []).map((boundary) => ({
            code: boundary.ntaCode,
            name: boundary.ntaName,
            borough: boundary.borough,
          })),
          summary: {
            noise: summarize(context.noise),
            crashes: summarize(context.crashes),
          },
        },
      }),
    });

    if (!response.ok) {
      throw new Error(
        `The model endpoint responded ${response.status}. Check that /api/chat is deployed and INFERHUB_API_KEY is set.`,
      );
    }

    const parsed = replySchema.safeParse(await response.json());
    if (!parsed.success) {
      throw new Error(
        "The model endpoint returned a payload that does not match the contract.",
      );
    }
    return parsed.data;
  }
}
