import type { NtaBoundary } from "@/lib/api/nta";
import type { AggregateResult } from "@/lib/geo/types";
import type { LayerId } from "@/lib/layers";
import type { WindowId } from "@/lib/windows";
import { HttpAgentClient } from "./httpAgent";
import { MockAgentClient } from "./mockAgent";
import type { AgentToolCall } from "./tools";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/** Everything an agent may read. It never invents numbers outside of this. */
export interface AgentContext {
  layer: LayerId;
  windowId: WindowId;
  windowLabel: string;
  boundaries: NtaBoundary[] | null;
  noise: AggregateResult | null;
  crashes: AggregateResult | null;
}

export interface AgentReply {
  text: string;
  toolCalls: AgentToolCall[];
  /** Optional short version for text-to-speech. Falls back to `text`. */
  spoken?: string;
}

/**
 * The one interface the real model layer has to satisfy. `sources` are produced
 * by `executeToolCalls`, never by the agent, so "show query" can't be faked.
 */
export interface AgentClient {
  send(messages: ChatTurn[], context: AgentContext): Promise<AgentReply>;
}

export function createAgentClient(): AgentClient {
  return import.meta.env.VITE_AGENT_MODE === "http"
    ? new HttpAgentClient()
    : new MockAgentClient();
}
