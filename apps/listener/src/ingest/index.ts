import type { MessageEvent } from "@notify/protocol-types";

/** Polls Soroban RPC `getEvents` for the channels contract from the stored cursor. */
export interface EventSource {
  poll(fromLedger: number): AsyncIterable<MessageEvent>;
}
