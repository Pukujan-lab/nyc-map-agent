/**
 * Typed client for the app's own API. Types are generated from openapi.json
 * (`pnpm openapi:types` -> schema.d.ts, checked in CI), so a renamed route or
 * query parameter breaks `tsc` instead of failing at runtime.
 */
import createClient from "openapi-fetch";
import type { paths } from "./schema";

const API_BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");

export const api = createClient<paths>({ baseUrl: API_BASE });

/** Unwrap an openapi-fetch result: the body on 2xx, an Error naming the route otherwise. */
export function unwrap<T>(route: string, r: { data?: T; error?: unknown; response: Response }): T {
  if (!r.response.ok || r.data === undefined) throw new Error(`API ${route} failed (${r.response.status})`);
  return r.data;
}
