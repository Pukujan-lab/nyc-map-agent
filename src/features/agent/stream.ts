import { streamEvent, type AgentRequest, type StreamEvent } from "./schema";

/** Parse an NDJSON body into validated events; bad lines are dropped. */
export async function* readEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<StreamEvent> {
  const reader = body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (value) buf += value;
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      try {
        const ev = streamEvent.safeParse(JSON.parse(line));
        if (ev.success) yield ev.data;
      } catch {
        /* partial or junk line */
      }
    }
    if (done) return;
  }
}

export async function* askAgent(req: AgentRequest, signal?: AbortSignal): AsyncGenerator<StreamEvent> {
  const base = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");
  const res = await fetch(`${base}/api/agent`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(req), signal });
  if (!res.ok || !res.body) {
    yield { type: "error", message: `The assistant returned ${res.status}.` };
    return;
  }
  yield* readEvents(res.body);
}
