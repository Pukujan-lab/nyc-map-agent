/**
 * Thin, typed wrapper over the Socrata SODA REST API.
 *
 * - SoQL is always assembled with URLSearchParams (never string concatenation),
 *   so `%`, `'`, and spaces are encoded correctly.
 * - `X-App-Token` is optional: the app must work without it.
 * - Requests retry with exponential backoff on 429/5xx and honour AbortSignal.
 */

export const SOCRATA_BASE = "https://data.cityofnewyork.us/resource";

export type SocrataFormat = "json" | "csv" | "geojson";

export type SoqlParams = Record<string, string>;

export class SocrataError extends Error {
  readonly status: number | undefined;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "SocrataError";
    this.status = status;
  }
}

const MAX_ATTEMPTS = 4;

function requestHeaders(): HeadersInit {
  const token = import.meta.env.VITE_SOCRATA_APP_TOKEN;
  return token ? { "X-App-Token": token } : {};
}

export function buildSocrataUrl(
  dataset: string,
  format: SocrataFormat,
  params: SoqlParams,
): string {
  const search = new URLSearchParams(params).toString();
  return `${SOCRATA_BASE}/${dataset}.${format}?${search}`;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function socrataRequest(
  dataset: string,
  format: SocrataFormat,
  params: SoqlParams,
  signal?: AbortSignal,
): Promise<Response> {
  const url = buildSocrataUrl(dataset, format, params);
  let lastError: unknown = new SocrataError("Socrata request failed");

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    try {
      const response = await fetch(url, { headers: requestHeaders(), signal });
      if (response.ok) return response;

      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable) {
        throw new SocrataError(
          `Socrata rejected the query (HTTP ${response.status}).`,
          response.status,
        );
      }
      lastError = new SocrataError(
        `Socrata is busy (HTTP ${response.status}).`,
        response.status,
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      if (error instanceof SocrataError && error.status && error.status < 500) {
        throw error;
      }
      lastError = error;
    }
    await sleep(400 * 2 ** attempt, signal);
  }

  throw lastError instanceof Error
    ? lastError
    : new SocrataError("Socrata request failed");
}

export async function fetchSocrataJson<T>(
  dataset: string,
  params: SoqlParams,
  signal?: AbortSignal,
): Promise<T> {
  const response = await socrataRequest(dataset, "json", params, signal);
  return (await response.json()) as T;
}

export async function fetchSocrataCsv(
  dataset: string,
  params: SoqlParams,
  signal?: AbortSignal,
): Promise<string> {
  const response = await socrataRequest(dataset, "csv", params, signal);
  return response.text();
}

/** Exact row count for a filter, used for determinate progress and checks. */
export async function fetchSocrataCount(
  dataset: string,
  where: string,
  signal?: AbortSignal,
): Promise<number> {
  const rows = await fetchSocrataJson<Array<{ count: string }>>(
    dataset,
    { $select: "count(*)", $where: where },
    signal,
  );
  const raw = rows[0]?.count;
  const parsed = raw ? Number.parseInt(raw, 10) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

export type CsvTable = { header: string[]; rows: string[][] };

/** RFC4180-ish CSV parser: handles quoted fields, escaped quotes, CRLF. */
export function parseCsv(text: string): CsvTable {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const [header, ...body] = rows;
  return { header: header ?? [], rows: body };
}
