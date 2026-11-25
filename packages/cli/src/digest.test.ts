import { describe, expect, it } from "vitest";
import { MAX_DIGEST_BYTES, buildDigest, parseFeed } from "./digest.js";

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel><title>T</title>
<item><title>First</title><link>https://a.test/1</link></item>
<item><title><![CDATA[Second & more]]></title><link>https://a.test/2</link></item>
<item><title>No link</title></item>
<item><title>Third</title><link>https://a.test/3</link></item>
</channel></rss>`;

const ATOM = `<feed xmlns="http://www.w3.org/2005/Atom"><title>T</title>
<entry><title type="text">Atom one</title><link href="https://b.test/1" rel="alternate"/></entry>
</feed>`;

describe("parseFeed", () => {
  it("reads RSS items and skips entries without a link", () => {
    expect(parseFeed(RSS, 10).map((i) => i.title)).toEqual(["First", "Second & more", "Third"]);
  });
  it("honours the per-feed limit", () => {
    expect(parseFeed(RSS, 2)).toHaveLength(2);
  });
  it("reads Atom entries with href links", () => {
    expect(parseFeed(ATOM, 5)).toEqual([{ title: "Atom one", link: "https://b.test/1" }]);
  });
  it("returns nothing for a single-item feed that is not a feed", () => {
    expect(parseFeed("<html></html>", 5)).toEqual([]);
  });
  it("handles a single RSS item (parsed as an object, not an array)", () => {
    const one =
      "<rss><channel><item><title>Only</title><link>https://c.test</link></item></channel></rss>";
    expect(parseFeed(one, 5)).toEqual([{ title: "Only", link: "https://c.test" }]);
  });
});

describe("buildDigest", () => {
  const now = new Date("2026-11-25T12:00:00Z");
  it("formats a header and one block per item", () => {
    expect(buildDigest([{ title: "A", link: "https://x.test" }], now)).toBe(
      "News digest 2026-11-25 12:00 UTC\n• A\nhttps://x.test",
    );
  });
  it("drops whole items that would exceed the byte budget", () => {
    const items = Array.from({ length: 500 }, (_, i) => ({
      title: `héadline ${i}`,
      link: `https://x.test/${i}`,
    }));
    const digest = buildDigest(items, now);
    expect(Buffer.byteLength(digest)).toBeLessThanOrEqual(MAX_DIGEST_BYTES);
    expect(digest.split("\n").length).toBeGreaterThan(10);
    expect(digest.split("\n").at(-1)).toMatch(/^https:\/\/x\.test\/\d+$/);
  });
});
