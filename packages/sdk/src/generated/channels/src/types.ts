

    /**
 * Invariants: 1 <= threshold <= admins.len() <= MAX_ADMINS; never zero admins.
 */
export interface Channel {
  admins: Array<string>;
  closed: boolean;
  kind: ChannelKind;
  /**
   * Signatures required for sensitive actions (D4). Default 1.
   */
  threshold: number;
}

/**
 * Union: DataKey
 */
 export type DataKey =
  /**
   * Sole address allowed to upgrade the contract code (D9, v1).
   */
  { tag: "Upgrader"; values: void } |
  { tag: "NextId"; values: void } |
  { tag: "Channel"; values: readonly [bigint] } |
  { tag: "Publisher"; values: readonly [bigint, string] };

/**
 * Open: anyone subscribes. Restricted: admins approve subscribers.
 * Subscriptions are never stored on-chain (principle 2 / D6).
 */
 export type ChannelKind =
  { tag: "Open"; values: void } |
  { tag: "Restricted"; values: void };

/**
 * Error codes are public ABI: never renumber, only append.
 */
export const Error = {
  1 : { message: "NotImplemented" },
  2 : { message: "ChannelNotFound" },
  3 : { message: "Unauthorized" },
  4 : { message: "InvalidThreshold" },
  5 : { message: "ChannelClosed" },
  6 : { message: "PayloadTooLarge" },
  7 : { message: "TooManyAdmins" },
  8 : { message: "DuplicateSigner" },
  9 : { message: "NotAdmin" },
  10 : { message: "LastAdmin" },
  11 : { message: "InvalidPayload" }
}

export interface Error {
  message: string;
}

/**
 * Admin-set changes are announced to subscribers (README principle 3).
 */
export interface AdminAddedEvent {
  name: "AdminAdded";
  data: {
    channel_id: bigint;
    admin?: string;
  };
}

/**
 * Event: AdminRemoved
 */
export interface AdminRemovedEvent {
  name: "AdminRemoved";
  data: {
    channel_id: bigint;
    admin?: string;
  };
}

/**
 * Event: ChannelClosed
 */
export interface ChannelClosedEvent {
  name: "ChannelClosed";
  data: {
    channel_id: bigint;
  };
}

/**
 * Event: ChannelCreated
 */
export interface ChannelCreatedEvent {
  name: "ChannelCreated";
  data: {
    channel_id: bigint;
    admin?: string;
  };
}

/**
 * Event: PublisherAdded
 */
export interface PublisherAddedEvent {
  name: "PublisherAdded";
  data: {
    channel_id: bigint;
    publisher?: string;
  };
}

/**
 * Topics: ("msg", channel_id). Payload is opaque; private content must be
 * encrypted by the sender.
 */
export interface MessagePublishedEvent {
  name: "MessagePublished";
  data: {
    channel_id: bigint;
    publisher?: string;
    payload?: Uint8Array;
  };
}

/**
 * Event: PublisherRemoved
 */
export interface PublisherRemovedEvent {
  name: "PublisherRemoved";
  data: {
    channel_id: bigint;
    publisher?: string;
  };
}

/**
 * Event: ThresholdChanged
 */
export interface ThresholdChangedEvent {
  name: "ThresholdChanged";
  data: {
    channel_id: bigint;
    threshold?: number;
  };
}

/**
 * Event: ChannelTransferred
 */
export interface ChannelTransferredEvent {
  name: "ChannelTransferred";
  data: {
    channel_id: bigint;
  };
}
    export type ContractEvent = AdminAddedEvent | AdminRemovedEvent | ChannelClosedEvent | ChannelCreatedEvent | PublisherAddedEvent | MessagePublishedEvent | PublisherRemovedEvent | ThresholdChangedEvent | ChannelTransferredEvent;
    