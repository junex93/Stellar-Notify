import type { DeliveryEnvelope } from "@notify/protocol-types";
import { rpc, xdr } from "@stellar/stellar-sdk";
import { loadCursor, saveCursor } from "../db/cursor.js";
import type { Db } from "../db/index.js";
import { toEnvelope } from "../delivery/envelope.js";
import { log } from "../log.js";
import { route } from "../router/index.js";
import { type RawEvent, TOPIC_NAMES, decodeEvent } from "./decode.js";

export interface FetchResult {
  events: RawEvent[];
  /** Ledger to resume from next time (inclusive); replays are deduplicated downstream. */
  nextLedger: number;
}

/** Polls Soroban RPC `getEvents` for the channels contract. */
export interface EventSource {
  /** Ledger to start from when no cursor is stored yet (the current tip). */
  tip(): Promise<number>;
  fetch(fromLedger: number): Promise<FetchResult>;
}

/** The RPC allows at most 5 topic patterns per filter. */
const TOPICS_PER_FILTER = 5;
const PAGE_LIMIT = 200;

type RpcLike = Pick<rpc.Server, "getEvents" | "getHealth" | "getLatestLedger">;

/** Event cursors are `<TOID>-<index>`; a TOID's high 32 bits are the ledger. */
export function cursorLedger(cursor: string): number {
  return Number(BigInt(cursor.split("-")[0] ?? "0") >> 32n);
}

export class RpcEventSource implements EventSource {
  private readonly server: RpcLike;

  constructor(
    rpcUrl: string,
    private readonly contractId: string,
    server?: RpcLike,
  ) {
    this.server = server ?? new rpc.Server(rpcUrl, { allowHttp: rpcUrl.startsWith("http://") });
  }

  async tip() {
    return (await this.server.getLatestLedger()).sequence;
  }

  private filters() {
    const patterns = TOPIC_NAMES.map((name) => [xdr.ScVal.scvSymbol(name).toXDR("base64"), "*"]);
    const filters: rpc.Api.EventFilter[] = [];
    for (let i = 0; i < patterns.length; i += TOPICS_PER_FILTER) {
      filters.push({
        type: "contract",
        contractIds: [this.contractId],
        topics: patterns.slice(i, i + TOPICS_PER_FILTER),
      });
    }
    return filters;
  }

  async fetch(fromLedger: number): Promise<FetchResult> {
    const health = await this.server.getHealth();
    let start = fromLedger;
    if (health.oldestLedger && start < health.oldestLedger) {
      log("warn", "cursor older than RPC retention; events were missed", {
        wanted: fromLedger,
        oldest: health.oldestLedger,
      });
      start = health.oldestLedger;
    }
    const events: RawEvent[] = [];
    let page = await this.firstPage(start);
    let latest = page.latestLedger;
    // The RPC scans a bounded ledger window per call and may return an empty
    // page with an advancing cursor, so a short page does not mean "done":
    // keep going until the cursor has reached the latest ledger.
    for (;;) {
      events.push(...page.events);
      const reached = cursorLedger(page.cursor) >= page.latestLedger - 1;
      if (page.events.length < PAGE_LIMIT && reached) break;
      const previous = page.cursor;
      page = await this.server.getEvents({
        filters: this.filters(),
        cursor: page.cursor,
        limit: PAGE_LIMIT,
      });
      latest = page.latestLedger;
      if (page.cursor === previous && page.events.length === 0) break;
    }
    return { events, nextLedger: Math.max(latest, start) };
  }

  /**
   * The retention window keeps moving, so `start` can fall out of range between
   * the health check and this call. The error names the new range: retry once
   * from its lower bound.
   */
  private async firstPage(start: number) {
    const request = (startLedger: number) =>
      this.server.getEvents({ filters: this.filters(), startLedger, limit: PAGE_LIMIT });
    try {
      return await request(start);
    } catch (err) {
      const match = /ledger range: (\d+) - (\d+)/.exec(
        (err as { message?: string })?.message ?? "",
      );
      const oldest = match ? Number(match[1]) : undefined;
      if (oldest === undefined || oldest <= start) throw err;
      log("warn", "retention moved while polling; restarting from oldest ledger", { oldest });
      return request(oldest);
    }
  }

  /** Re-loads one event for a retry; message content is never kept in the DB. */
  async loadEvent(ledger: number, eventId: string): Promise<RawEvent | null> {
    const page = await this.server.getEvents({
      filters: this.filters(),
      startLedger: ledger,
      endLedger: ledger + 1,
      limit: PAGE_LIMIT,
    });
    return page.events.find((e) => e.id === eventId) ?? null;
  }
}

/** Resolves an event to its delivery envelope, from memory or RPC. */
export class EnvelopeLoader {
  private readonly cache = new Map<string, DeliveryEnvelope>();

  constructor(
    private readonly source: Pick<RpcEventSource, "loadEvent">,
    private readonly maxCached = 1000,
  ) {}

  remember(envelope: DeliveryEnvelope) {
    this.cache.set(envelope.eventId, envelope);
    if (this.cache.size > this.maxCached) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
  }

  async load(ledger: number, eventId: string): Promise<DeliveryEnvelope | null> {
    const hit = this.cache.get(eventId);
    if (hit) return hit;
    const raw = await this.source.loadEvent(ledger, eventId);
    const decoded = raw && decodeEvent(raw);
    return decoded ? toEnvelope(decoded) : null;
  }
}

export interface IngestDeps {
  db: Db;
  source: EventSource;
  contractId: string;
  loader: EnvelopeLoader;
  /** Used when no cursor is stored; defaults to the current tip. */
  startLedger?: number;
}

/**
 * One poll: decode, route and only then advance the cursor, so a crash
 * replays from the stored ledger rather than skipping events.
 */
export async function ingestOnce(deps: IngestDeps): Promise<{ events: number; queued: number }> {
  const { db, source, contractId } = deps;
  const stored = await loadCursor(db, contractId);
  const from = stored ?? deps.startLedger ?? (await source.tip());
  const { events, nextLedger } = await source.fetch(from);
  let queued = 0;
  let forwarded = 0;
  for (const raw of events) {
    const event = decodeEvent(raw);
    if (!event) continue;
    forwarded++;
    deps.loader.remember(toEnvelope(event));
    queued += await route(db, event);
  }
  await saveCursor(db, contractId, nextLedger);
  return { events: forwarded, queued };
}
