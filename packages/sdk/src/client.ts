import type { ChannelId, ChannelKind } from "@notify/protocol-types";
import type { Keypair } from "@stellar/stellar-sdk";
import type { AssembledTransaction, Result } from "@stellar/stellar-sdk/contract";
import { fromContractKind, toContractKind, toPayload } from "./convert.js";
import { NotifyContractError, contractErrorFromName, contractErrorFromText } from "./errors.js";
import { Client, type Channel as ContractChannel } from "./generated/channels/index.js";

export interface NotifyClientOptions {
  rpcUrl: string;
  networkPassphrase: string;
  /** Read from caatinga.artifacts.json / `ctg sync-env`; never hard-coded. */
  contractId: string;
  /** Source account and default signer. Omit for read-only use. */
  keypair?: Keypair;
  /** Co-signers for threshold actions, keyed by public key. Only needed for multi-admin channels. */
  coSigners?: Keypair[];
}

export interface ChannelInfo {
  admins: string[];
  kind: ChannelKind;
  threshold: number;
  closed: boolean;
}

type ContractResult<T> = Result<T, { message: string }>;

/** Typed publisher-side client over the Caatinga-generated `channels` bindings. */
export class NotifyClient {
  private readonly client: Client;
  private readonly coSigners: Map<string, Keypair>;

  constructor(readonly options: NotifyClientOptions) {
    const { keypair } = options;
    this.client = new Client({
      rpcUrl: options.rpcUrl,
      networkPassphrase: options.networkPassphrase,
      contractId: options.contractId,
      ...(keypair && {
        publicKey: keypair.publicKey(),
        signTransaction: keypair,
        signAuthEntry: keypair,
      }),
    });
    this.coSigners = new Map((options.coSigners ?? []).map((k) => [k.publicKey(), k]));
  }

  async createChannel(creator: string, kind: ChannelKind): Promise<ChannelId> {
    return this.send(await this.client.create_channel({ creator, kind: toContractKind(kind) }));
  }

  /** 1 admin or 1 publisher. `signer` must be the configured keypair's address. */
  async publish(channelId: ChannelId, signer: string, payload: Uint8Array | string): Promise<void> {
    const bytes = toPayload(payload);
    await this.send(await this.client.publish({ channel_id: channelId, signer, payload: bytes }));
  }

  async addPublisher(channelId: ChannelId, admin: string, publisher: string): Promise<void> {
    await this.send(await this.client.add_publisher({ channel_id: channelId, admin, publisher }));
  }

  async removePublisher(channelId: ChannelId, admin: string, publisher: string): Promise<void> {
    await this.send(
      await this.client.remove_publisher({ channel_id: channelId, admin, publisher }),
    );
  }

  async addAdmin(channelId: ChannelId, signers: string[], newAdmin: string): Promise<void> {
    await this.send(
      await this.client.add_admin({ channel_id: channelId, signers, new_admin: newAdmin }),
    );
  }

  async removeAdmin(channelId: ChannelId, signers: string[], admin: string): Promise<void> {
    await this.send(await this.client.remove_admin({ channel_id: channelId, signers, admin }));
  }

  async setThreshold(channelId: ChannelId, signers: string[], threshold: number): Promise<void> {
    await this.send(await this.client.set_threshold({ channel_id: channelId, signers, threshold }));
  }

  async transferChannel(
    channelId: ChannelId,
    signers: string[],
    newAdmins: string[],
    newThreshold: number,
  ): Promise<void> {
    await this.send(
      await this.client.transfer_channel({
        channel_id: channelId,
        signers,
        new_admins: newAdmins,
        new_threshold: newThreshold,
      }),
    );
  }

  async closeChannel(channelId: ChannelId, signers: string[]): Promise<void> {
    await this.send(await this.client.close_channel({ channel_id: channelId, signers }));
  }

  /** 1 admin, restricted channels only. `id` is a {@link subscriberCommitment}, never a wallet. */
  async approveSubscriber(channelId: ChannelId, admin: string, id: Uint8Array): Promise<void> {
    await this.send(await this.client.approve_subscriber({ channel_id: channelId, admin, id }));
  }

  async removeSubscriber(channelId: ChannelId, admin: string, id: Uint8Array): Promise<void> {
    await this.send(await this.client.remove_subscriber({ channel_id: channelId, admin, id }));
  }

  /** Read-only: whether the commitment is an approved subscriber of the channel. */
  async isApproved(channelId: ChannelId, id: Uint8Array): Promise<boolean> {
    const tx = await this.simulated(() => this.client.is_approved({ channel_id: channelId, id }));
    return tx.result;
  }

  /** Read-only: simulated, never signed or submitted. */
  async getChannel(channelId: ChannelId): Promise<ChannelInfo> {
    const tx = await this.simulated(() => this.client.get_channel({ channel_id: channelId }));
    return toChannelInfo(unwrap(tx.result));
  }

  private async simulated<T>(build: () => Promise<AssembledTransaction<T>>) {
    try {
      return await build();
    } catch (e) {
      throw asContractError(e) ?? e;
    }
  }

  /**
   * Signs the other signers' auth entries, submits, and unwraps the contract `Result`.
   * Addresses that are the source account authorize through the transaction signature.
   */
  private async send<T>(tx: AssembledTransaction<ContractResult<T>>): Promise<T> {
    try {
      for (const address of tx.needsNonInvokerSigningBy()) {
        const keypair = this.coSigners.get(address);
        if (!keypair) throw new Error(`no key for required signer ${address}`);
        await tx.signAuthEntries({ address, signAuthEntry: keypair });
      }
      const sent = await tx.signAndSend();
      return unwrap(sent.result);
    } catch (e) {
      throw asContractError(e) ?? e;
    }
  }
}

function unwrap<T>(result: ContractResult<T>): T {
  if (result.isOk()) return result.unwrap();
  throw contractErrorFromName(result.unwrapErr().message);
}

function asContractError(e: unknown): NotifyContractError | undefined {
  if (e instanceof NotifyContractError) return e;
  return e instanceof Error ? contractErrorFromText(e.message) : undefined;
}

function toChannelInfo(c: ContractChannel): ChannelInfo {
  return {
    admins: c.admins,
    kind: fromContractKind(c.kind),
    threshold: c.threshold,
    closed: c.closed,
  };
}
