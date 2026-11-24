import type { ChannelId, ChannelKind } from "@notify/protocol-types";

export interface NotifyClientOptions {
  rpcUrl: string;
  networkPassphrase: string;
  /** Read from caatinga.artifacts.json / `ctg sync-env`; never hard-coded. */
  contractId: string;
}

/** Skeleton: wraps the Caatinga-generated `channels` bindings once available. */
export class NotifyClient {
  constructor(readonly options: NotifyClientOptions) {}

  createChannel(_creator: string, _kind: ChannelKind): Promise<ChannelId> {
    throw new Error("not implemented");
  }

  publish(_channelId: ChannelId, _signer: string, _payload: Uint8Array): Promise<void> {
    throw new Error("not implemented");
  }
}
