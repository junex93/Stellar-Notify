#!/usr/bin/env node
import { buildDigest, parseFeed } from "./digest.js";
import { DEFAULT_IDENTITY } from "./identity.js";
import { runtime } from "./runtime.js";

/**
 * Demo: publishes a digest of RSS/Atom feeds to a personal channel. Run it every 6 hours.
 * NEWS_FEEDS=url1,url2  NEWS_CHANNEL_ID=<id>  [NEWS_ITEMS_PER_FEED=5]  [--dry-run]
 */
const feeds = (process.env.NEWS_FEEDS ?? "")
  .split(",")
  .map((u) => u.trim())
  .filter(Boolean);
const perFeed = Number(process.env.NEWS_ITEMS_PER_FEED ?? 5);
const dryRun = process.argv.includes("--dry-run");

try {
  if (feeds.length === 0) throw new Error("NEWS_FEEDS is not set");
  const channelId = process.env.NEWS_CHANNEL_ID;
  if (!dryRun && !channelId?.match(/^\d+$/)) throw new Error("NEWS_CHANNEL_ID is not set");

  const items = (
    await Promise.all(
      feeds.map(async (url) => {
        const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
        if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
        return parseFeed(await res.text(), perFeed);
      }),
    )
  ).flat();
  if (items.length === 0) throw new Error("no items found in the configured feeds");

  const digest = buildDigest(items, new Date());
  if (dryRun) {
    console.log(digest);
  } else {
    const { client, address } = await runtime.connect(DEFAULT_IDENTITY);
    await client.publish(BigInt(channelId as string), address, digest);
    console.log(`published ${items.length} items (${Buffer.byteLength(digest)} bytes)`);
  }
} catch (e) {
  console.error(`error: ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
}
