import type { LogLine, Run, Status } from "./types";

export type ApiErrorKind =
  | "unauthorized"
  | "busy"
  | "rate-limited"
  | "http"
  | "network"
  | "unexpected";

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number | null;

  constructor(kind: ApiErrorKind, status: number | null = null, message?: string) {
    super(message ?? kind);
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
  }
}

const API_BASE = "/deploy/api";

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      // The session is an HttpOnly cookie; it must ride along on every call.
      credentials: "include",
      headers: {
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...((init.headers as Record<string, string> | undefined) ?? {}),
      },
    });
  } catch {
    throw new ApiError("network", null, "Could not reach the deploy server.");
  }

  if (response.status === 401) throw new ApiError("unauthorized", 401);
  if (response.status === 409) throw new ApiError("busy", 409);
  if (response.status === 429) throw new ApiError("rate-limited", 429);
  if (!response.ok) {
    throw new ApiError("http", response.status, `HTTP ${response.status}`);
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiError(
      "unexpected",
      response.status,
      "Unexpected response from the deploy server.",
    );
  }
}

export async function getStatus(): Promise<Status> {
  return request<Status>("/status");
}

export async function getDeploy(id: string): Promise<Run> {
  return request<Run>(`/deploys/${encodeURIComponent(id)}`);
}

export async function postDeploy(sha?: string): Promise<{ id: string }> {
  return request<{ id: string }>("/deploy", {
    method: "POST",
    body: JSON.stringify(sha ? { sha } : {}),
  });
}

export async function postRollback(): Promise<{ id: string }> {
  return request<{ id: string }>("/rollback", { method: "POST" });
}

export async function postLogin(password: string): Promise<{ ok: true }> {
  return request<{ ok: true }>("/login", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
}

export async function postLogout(): Promise<{ ok: true }> {
  return request<{ ok: true }>("/logout", { method: "POST" });
}

export interface LogHandlers {
  onLine: (line: LogLine) => void;
  onDone: () => void;
  onError: () => void;
}

/**
 * Streams a run's log from the beginning, then follows it live.
 * Returns an unsubscribe function that closes the underlying stream.
 */
export function subscribeToLog(runId: string, handlers: LogHandlers): () => void {
  const source = new EventSource(
    `${API_BASE}/deploys/${encodeURIComponent(runId)}/log`,
    { withCredentials: true },
  );
  let settled = false;

  source.onmessage = (event: MessageEvent<string>) => {
    try {
      const payload = JSON.parse(event.data) as { line?: unknown; at?: unknown };
      if (typeof payload.line === "string") {
        handlers.onLine({
          line: payload.line,
          at: typeof payload.at === "string" ? payload.at : new Date().toISOString(),
        });
      }
    } catch {
      // Ignore frames we cannot parse rather than dropping the whole stream.
    }
  };

  source.addEventListener("done", () => {
    settled = true;
    source.close();
    handlers.onDone();
  });

  source.onerror = () => {
    if (settled) return;
    settled = true;
    source.close();
    handlers.onError();
  };

  return () => {
    settled = true;
    source.close();
  };
}
