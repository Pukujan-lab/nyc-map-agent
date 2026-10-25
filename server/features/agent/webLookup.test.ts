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
