import { octoQuery } from "./_lib/octo";

/**
 * GET /api/city-tiles: the citywide 3D-city PMTiles, published through Octo
 * files to R2 (core.published_assets). PMTiles reads it with HTTP Range
 * requests; this endpoint answers them same-origin (Octo's public bucket sends
 * no CORS headers) and stitches ranges across the upload parts. Only the few
 * KB a view needs are fetched upstream, never the whole file.
 */
interface Part {
  url: string;
  bytes: number;
}
interface Asset {
  total: number;
  etag: string;
  parts: Part[];
}

const cached = new Map<string, { asset: Asset; at: number }>();
const MANIFEST_TTL_MS = 10 * 60 * 1000;

async function manifest(name: string): Promise<Asset | null> {
  const hit = cached.get(name);
  if (hit && Date.now() - hit.at < MANIFEST_TTL_MS) return hit.asset;
  const { rows } = await octoQuery<{ total_bytes: string; etag: string; parts: unknown }>(
    "SELECT total_bytes, etag, parts FROM core.published_assets WHERE name = $1",
    [name],
  );
  if (!rows[0]) return null;
  const parts = (typeof rows[0].parts === "string" ? JSON.parse(rows[0].parts) : rows[0].parts) as Part[];
  const asset = { total: Number(rows[0].total_bytes), etag: rows[0].etag, parts };
  cached.set(name, { asset, at: Date.now() });
  return asset;
}

/** Parses a single `bytes=a-b` / `bytes=a-` / `bytes=-n` range. */
export function parseRange(header: string | null, total: number): [number, number] | null {
  const m = header?.match(/^bytes=(\d*)-(\d*)$/);
  if (!m || (m[1] === "" && m[2] === "")) return null;
  if (m[1] === "") return [Math.max(0, total - Number(m[2])), total - 1];
  const start = Number(m[1]);
  const end = m[2] === "" ? total - 1 : Math.min(Number(m[2]), total - 1);
  return start <= end && start < total ? [start, end] : null;
}

/** Which byte ranges of which parts cover [start, end] of the whole file. */
export function partSlices(parts: Part[], start: number, end: number): Array<{ url: string; from: number; to: number }> {
  const out: Array<{ url: string; from: number; to: number }> = [];
  let base = 0;
  for (const part of parts) {
    const last = base + part.bytes - 1;
    if (end >= base && start <= last) {
      out.push({ url: part.url, from: Math.max(start, base) - base, to: Math.min(end, last) - base });
    }
    base += part.bytes;
  }
  return out;
}

/** A same-origin Range endpoint for one published PMTiles asset (also /api/block-tiles). */
export function pmtilesProxy(name: string): (request: Request) => Promise<Response> {
  return (request) => serve(name, request);
}

export const GET = pmtilesProxy("nyc-city.pmtiles");

async function serve(name: string, request: Request): Promise<Response> {
  const asset = await manifest(name).catch(() => null);
  if (!asset) return new Response(`${name} not published`, { status: 404 });
  const common = {
    "accept-ranges": "bytes",
    etag: `"${asset.etag}"`,
    // The URL stays the same across publishes, so a long max-age kept old
    // ranges (blocky trees, props in the road) in browsers for a day after a
    // rebuild. Five minutes bounds that; PMTiles' own etag check catches the rest.
    "cache-control": "public, max-age=300",
    "content-type": "application/vnd.pmtiles",
    // Same-origin in the app; open to other origins so a separately hosted
    // frontend can point VITE_CITY_TILES_URL here too.
    "access-control-allow-origin": "*",
    "access-control-expose-headers": "content-range, content-length, etag, accept-ranges",
  };
  const ifMatch = request.headers.get("if-match");
  if (ifMatch && ifMatch.replace(/"/g, "") !== asset.etag) return new Response(null, { status: 412, headers: common });
  const rangeHeader = request.headers.get("range");
  const range = rangeHeader ? parseRange(rangeHeader, asset.total) : [0, asset.total - 1] as [number, number];
  if (!range) {
    return new Response(null, { status: 416, headers: { ...common, "content-range": `bytes */${asset.total}` } });
  }
  const [start, end] = range;
  const chunks = await Promise.all(
    partSlices(asset.parts, start, end).map(async ({ url, from, to }) => {
      const res = await fetch(url, { headers: { range: `bytes=${from}-${to}` } });
      if (res.status !== 206 && res.status !== 200) throw new Error(`upstream ${res.status}`);
      const buf = new Uint8Array(await res.arrayBuffer());
      // A 200 means the upstream ignored Range; cut the slice ourselves.
      return res.status === 200 ? buf.subarray(from, to + 1) : buf;
    }),
  ).catch(() => null);
  if (!chunks) return new Response("upstream error", { status: 502 });
  const body = new Uint8Array(end - start + 1);
  let at = 0;
  for (const c of chunks) {
    body.set(c, at);
    at += c.length;
  }
  return new Response(body, {
    status: rangeHeader ? 206 : 200,
    headers: {
      ...common,
      "content-length": String(body.length),
      ...(rangeHeader ? { "content-range": `bytes ${start}-${end}/${asset.total}` } : {}),
    },
  });
}
