import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findEvent, readPage, readableUrl, webSearch } from "./webLookup";

const ok = (body: unknown) => (() => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))) as unknown as typeof fetch;

describe("event lookup through TinyFish", () => {
  beforeEach(() => { vi.stubEnv("TAVILY_API_KEY", ""); });
  afterEach(() => { vi.unstubAllEnvs(); });

  it("says it is unavailable without a key instead of guessing", async () => {
    vi.stubEnv("TINYFISH_API_KEY", "");
    expect(await webSearch("3 Percent Club event")).toMatchObject({ unavailable: true });
    expect(await readPage("https://lu.ma/x")).toMatchObject({ unavailable: true });
  });

  it("returns search results and a page's text", async () => {
    vi.stubEnv("TINYFISH_API_KEY", "test-key");
    const s = await webSearch("3 Percent Club event New York", ok({ results: [{ title: "3% Club NYC", url: "https://lu.ma/3pc", snippet: "Join us", date: "Oct 24", site_name: "Luma" }] }));
    expect(s).toEqual({ results: [{ title: "3% Club NYC", url: "https://lu.ma/3pc", snippet: "Join us", date: "Oct 24", site: "Luma" }] });
    const p = await readPage("https://lu.ma/3pc", ok({ results: [{ url: "https://lu.ma/3pc", final_url: "https://lu.ma/3pc", title: "3% Club NYC", description: "Meetup", text: "Venue  123 Example St,\n New York" }] }));
    expect(p).toMatchObject({ title: "3% Club NYC", text: "Venue 123 Example St, New York" });
  });

  it("only reads public web pages", () => {
    expect(readableUrl("https://lu.ma/3pc")).toBe(true);
    expect(readableUrl("http://localhost:3000/")).toBe(false);
    expect(readableUrl("http://192.168.1.10/")).toBe(false);
    expect(readableUrl("file:///etc/passwd")).toBe(false);
  });
});

describe("event lookup through Tavily first", () => {
  afterEach(() => { vi.unstubAllEnvs(); });

  it("uses Tavily when it has results and never calls TinyFish", async () => {
    vi.stubEnv("TAVILY_API_KEY", "tv");
    vi.stubEnv("TINYFISH_API_KEY", "tf");
    const calls: string[] = [];
    const f = ((url: string) => { calls.push(url); return Promise.resolve(new Response(JSON.stringify({ results: [{ title: "3% Club", url: "https://lu.ma/3pc", content: "At 123 Example St" }] }))); }) as unknown as typeof fetch;
    expect(await webSearch("3 Percent Club", f)).toEqual({ results: [{ title: "3% Club", url: "https://lu.ma/3pc", snippet: "At 123 Example St", date: null, site: "lu.ma" }] });
    expect(calls).toEqual(["https://api.tavily.com/search"]);
  });

  it("falls back to TinyFish when Tavily fails", async () => {
    vi.stubEnv("TAVILY_API_KEY", "tv");
    vi.stubEnv("TINYFISH_API_KEY", "tf");
    const f = ((url: string) => Promise.resolve(url.includes("tavily") ? new Response("no", { status: 500 }) : new Response(JSON.stringify({ results: [{ title: "From TinyFish", url: "https://x.org" }] })))) as unknown as typeof fetch;
    const s = await webSearch("3 Percent Club", f);
    expect("results" in s && s.results[0].title).toBe("From TinyFish");
  });

  it("searches wider when the first try finds nothing", async () => {
    vi.stubEnv("TAVILY_API_KEY", "tv");
    vi.stubEnv("TINYFISH_API_KEY", "");
    const queries: string[] = [];
    const f = ((_: string, init: RequestInit) => {
      const q = (JSON.parse(init.body as string) as { query: string }).query;
      queries.push(q);
      return Promise.resolve(new Response(JSON.stringify({ results: queries.length === 2 ? [{ title: "Found", url: "https://lu.ma/a" }] : [] })));
    }) as unknown as typeof fetch;
    const s = await findEvent("Hack Night", f);
    expect("results" in s && s.results[0].title).toBe("Found");
    expect(queries[0]).toBe("Hack Night New York");
    expect(queries).toHaveLength(2);
  });
});

// Answers each provider's endpoint with its own handler and records the order they were called in.
function route(handlers: { tavily?: () => Promise<Response>; tinyfish?: () => Promise<Response> }) {
  const calls: string[] = [];
  const impl = ((input: string | URL) => {
    const url = String(input);
    const which = url.startsWith("https://api.tavily.com") ? "tavily" : url.startsWith("https://api.search.tinyfish.ai") ? "tinyfish" : "other";
    calls.push(which);
    const h = handlers[which as "tavily" | "tinyfish"];
    return h ? h() : Promise.reject(new Error(`unexpected ${url}`));
  }) as unknown as typeof fetch;
  return { impl, calls };
}
const json = (body: unknown, status = 200) => () => Promise.resolve(new Response(JSON.stringify(body), { status }));
const tavilyHit = json({ results: [{ title: "Bryant Park Movie Nights", url: "https://bryantpark.org/events", content: "Free outdoor film on the lawn", published_date: "2026-10-25" }] });
const tinyfishHit = json({ results: [{ title: "Bryant Park events", url: "https://example.com/bp", snippet: "This week", site_name: "Example" }] });
const timeout = () => Promise.reject(Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" }));

describe("web search fallback, edge cases", () => {
  afterEach(() => { vi.unstubAllEnvs(); });
  const bothKeys = () => { vi.stubEnv("TAVILY_API_KEY", "t-key"); vi.stubEnv("TINYFISH_API_KEY", "f-key"); };

  it.each([
    ["times out", timeout],
    ["returns nothing", json({ results: [] })],
    ["network fails", () => Promise.reject(new TypeError("fetch failed"))],
  ])("falls back to TinyFish when Tavily %s", async (_, tavilyAnswer) => {
    bothKeys();
    const { impl, calls } = route({ tavily: tavilyAnswer, tinyfish: tinyfishHit });
    const s = await webSearch("Bryant Park tomorrow", impl);
    expect(calls).toEqual(["tavily", "tinyfish"]);
    expect(s).toMatchObject({ results: [{ title: "Bryant Park events", site: "Example" }] });
  });

  it("sends the Tavily key as a bearer token, not in the URL", async () => {
    bothKeys();
    const impl = vi.fn(tavilyHit) as unknown as typeof fetch;
    await webSearch("Bryant Park", impl);
    const [url, init] = (impl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).not.toContain("t-key");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer t-key");
  });

  it("goes straight to TinyFish when only its key is set", async () => {
    vi.stubEnv("TAVILY_API_KEY", "");
    vi.stubEnv("TINYFISH_API_KEY", "f-key");
    const { impl, calls } = route({ tavily: tavilyHit, tinyfish: tinyfishHit });
    await webSearch("Bryant Park", impl);
    expect(calls).toEqual(["tinyfish"]);
  });

  it("returns an honest empty list when both answer but find nothing", async () => {
    bothKeys();
    const { impl, calls } = route({ tavily: json({ results: [] }), tinyfish: json({ results: [] }) });
    expect(await webSearch("no such event", impl)).toEqual({ results: [] });
    expect(calls).toEqual(["tavily", "tinyfish"]);
  });
});
