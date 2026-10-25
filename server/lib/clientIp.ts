/**
 * Best-effort client address for per-client limits.
 *
 * Production path (deploy/README.md): Cloudflare -> cloudflared tunnel ->
 * Caddy (deploy/Caddyfile, no trusted_proxies) -> this app. The origin binds
 * to loopback and the tunnel network only, so every request has passed
 * Cloudflare, which overwrites CF-Connecting-IP with the visitor's address.
 * Caddy passes that header through untouched but replaces X-Forwarded-For with
 * its own peer (the tunnel container), so X-Forwarded-For alone cannot tell
 * visitors apart there. It is still used as a fallback for other setups,
 * taking the rightmost entry (the one added by the nearest proxy), because the
 * leftmost entries are whatever the client chose to send.
 *
 * Without either header (local dev, tests) every caller shares one key.
 */
export function clientIp(headers: Headers): string {
  const cf = headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const last = xff.split(",").map((s) => s.trim()).filter(Boolean).pop();
    if (last) return last;
  }
  return "unknown";
}
