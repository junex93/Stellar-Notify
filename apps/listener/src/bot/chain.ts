import { NotifyClient, NotifyContractError } from "@notify/sdk";

export interface ChainChannel {
  kind: "open" | "restricted";
  closed: boolean;
}

/** The two contract reads the bot needs; a seam so tests do not touch the network. */
export interface ChainReader {
  /** Undefined when the channel does not exist. */
  getChannel(channelId: bigint): Promise<ChainChannel | undefined>;
  isApproved(channelId: bigint, commitment: Uint8Array): Promise<boolean>;
}

export function createChainReader(options: {
  rpcUrl: string;
  networkPassphrase: string;
  contractId: string;
}): ChainReader {
  const client = new NotifyClient(options);
  return {
    async getChannel(channelId) {
      try {
        const { kind, closed } = await client.getChannel(channelId);
        return { kind, closed };
      } catch (e) {
        if (e instanceof NotifyContractError && e.contractError === "ChannelNotFound")
          return undefined;
        throw e;
      }
    },
    isApproved: (channelId, commitment) => client.isApproved(channelId, commitment),
  };
}
