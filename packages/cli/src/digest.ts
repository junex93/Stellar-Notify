import { XMLParser } from "fast-xml-parser";

export interface NewsItem {
  title: string;
  link: string;
}

/** Listener adapters display at most ~4000 bytes (apps/listener/src/delivery/text.ts). */
export const MAX_DIGEST_BYTES = 4000;

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

const asArray = <T>(v: T | T[] | undefined): T[] => (v === undefined ? [] : ([v].flat() as T[]));

const text = (v: unknown): string => {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v);
  if (v && typeof v === "object" && "#text" in v)
    return text((v as Record<string, unknown>)["#text"]);
  return "";
};

/** RSS 2.0 `<item>` or Atom `<entry>`; entries without a title or link are skipped. */
export function parseFeed(xml: string, limit: number): NewsItem[] {
  const doc = parser.parse(xml);
  const rss = asArray<Record<string, unknown>>(doc?.rss?.channel?.item);
  const atom = asArray<Record<string, unknown>>(doc?.feed?.entry);
  const items: NewsItem[] = [];
  for (const entry of [...rss, ...atom]) {
    const title = text(entry.title);
    const linkField = asArray<unknown>(entry.link as unknown)[0];
    const link =
      linkField && typeof linkField === "object" && "@_href" in linkField
        ? text((linkField as Record<string, unknown>)["@_href"])
        : text(linkField);
    if (title && link) items.push({ title, link });
    if (items.length === limit) break;
  }
  return items;
}

/** Whole lines only: an item that would push the digest past the byte budget is dropped. */
export function buildDigest(items: NewsItem[], now: Date, maxBytes = MAX_DIGEST_BYTES): string {
  const lines = [`News digest ${now.toISOString().slice(0, 16).replace("T", " ")} UTC`];
  let size = Buffer.byteLength(lines[0] ?? "");
  for (const { title, link } of items) {
    const line = `• ${title}\n${link}`;
    const next = size + 1 + Buffer.byteLength(line);
    if (next > maxBytes) break;
    lines.push(line);
    size = next;
  }
  return lines.join("\n");
}
