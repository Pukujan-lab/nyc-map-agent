import { afterEach, describe, expect, it, vi } from "vitest";
import { readPage, readableUrl, webSearch } from "./webLookup";

const ok = (body: unknown) => (() => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))) as unknown as typeof fetch;

describe("event lookup through TinyFish", () => {
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
