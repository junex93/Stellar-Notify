import {Channel, ChannelKind, ContractEvent} from './types.js';
import {Result, Spec, AssembledTransaction, Client as ContractClient, ClientOptions as ContractClientOptions, MethodOptions, ExternalExecutableRef} from '@stellar/stellar-sdk/contract';
import {Address, xdr} from '@stellar/stellar-sdk';

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- intentional: Client is both the typed interface and the ContractClient subclass that dispatches its methods via Proxy.
export interface Client {
  /**
   * 1 admin or 1 publisher. Rejects closed channels and payloads larger
   * than `MAX_PAYLOAD_BYTES`.
   */
  publish(args: { channel_id: bigint; signer: string | Address; payload: Uint8Array }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  /**
   * Replaces the contract code. Requires the stored upgrader's auth.
   */
  upgrade(args: { new_wasm_hash: Uint8Array }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  version(options?: MethodOptions): Promise<AssembledTransaction<number>>;
  upgrader(options?: MethodOptions): Promise<AssembledTransaction<string>>;
  /**
   * Channel threshold. At most `MAX_ADMINS` admins.
   */
  add_admin(args: { channel_id: bigint; signers: Array<string | Address>; new_admin: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  get_channel(args: { channel_id: bigint }, options?: MethodOptions): Promise<AssembledTransaction<Result<Channel, Error>>>;
  /**
   * Channel threshold. Must not remove the last admin or leave
   * `threshold > admins.len()`.
   */
  remove_admin(args: { channel_id: bigint; signers: Array<string | Address>; admin: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  /**
   * 1 admin.
   */
  add_publisher(args: { channel_id: bigint; admin: string | Address; publisher: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  /**
   * Channel threshold. Closed channels reject `publish`.
   */
  close_channel(args: { channel_id: bigint; signers: Array<string | Address> }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  /**
   * Channel threshold. `1 <= threshold <= admins.len()`.
   */
  set_threshold(args: { channel_id: bigint; signers: Array<string | Address>; threshold: number }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  /**
   * Creator becomes the first admin (threshold 1). Requires creator auth.
   */
  create_channel(args: { creator: string | Address; kind: ChannelKind }, options?: MethodOptions): Promise<AssembledTransaction<Result<bigint, Error>>>;
  /**
   * 1 admin.
   */
  remove_publisher(args: { channel_id: bigint; admin: string | Address; publisher: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  /**
   * Channel threshold. Replaces the admin set and threshold atomically.
   */
  transfer_channel(args: { channel_id: bigint; signers: Array<string | Address>; new_admins: Array<string | Address>; new_threshold: number }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- intentional: Client is both the typed interface and the ContractClient subclass that dispatches its methods via Proxy.
export class Client extends ContractClient {
  constructor(public readonly options: ContractClientOptions) {
    super(
      new Spec(["AAAAAAAAAF0xIGFkbWluIG9yIDEgcHVibGlzaGVyLiBSZWplY3RzIGNsb3NlZCBjaGFubmVscyBhbmQgcGF5bG9hZHMgbGFyZ2VyCnRoYW4gYE1BWF9QQVlMT0FEX0JZVEVTYC4AAAAAAAAHcHVibGlzaAAAAAADAAAAAAAAAApjaGFubmVsX2lkAAAAAAAGAAAAAAAAAAZzaWduZXIAAAAAABMAAAAAAAAAB3BheWxvYWQAAAAADgAAAAEAAAPpAAAAAgAAAAM=", "AAAAAAAAAEBSZXBsYWNlcyB0aGUgY29udHJhY3QgY29kZS4gUmVxdWlyZXMgdGhlIHN0b3JlZCB1cGdyYWRlcidzIGF1dGguAAAAB3VwZ3JhZGUAAAAAAQAAAAAAAAANbmV3X3dhc21faGFzaAAAAAAAA+4AAAAgAAAAAA==", "AAAAAAAAAAAAAAAHdmVyc2lvbgAAAAAAAAAAAQAAAAQ=", "AAAAAAAAAAAAAAAIdXBncmFkZXIAAAAAAAAAAQAAABM=", "AAAAAAAAAC9DaGFubmVsIHRocmVzaG9sZC4gQXQgbW9zdCBgTUFYX0FETUlOU2AgYWRtaW5zLgAAAAAJYWRkX2FkbWluAAAAAAAAAwAAAAAAAAAKY2hhbm5lbF9pZAAAAAAABgAAAAAAAAAHc2lnbmVycwAAAAPqAAAAEwAAAAAAAAAJbmV3X2FkbWluAAAAAAAAEwAAAAEAAAPpAAAAAgAAAAM=", "AAAAAAAAAAAAAAALZ2V0X2NoYW5uZWwAAAAAAQAAAAAAAAAKY2hhbm5lbF9pZAAAAAAABgAAAAEAAAPpAAAH0AAAAAdDaGFubmVsAAAAAAM=", "AAAAAAAAAFZDaGFubmVsIHRocmVzaG9sZC4gTXVzdCBub3QgcmVtb3ZlIHRoZSBsYXN0IGFkbWluIG9yIGxlYXZlCmB0aHJlc2hvbGQgPiBhZG1pbnMubGVuKClgLgAAAAAADHJlbW92ZV9hZG1pbgAAAAMAAAAAAAAACmNoYW5uZWxfaWQAAAAAAAYAAAAAAAAAB3NpZ25lcnMAAAAD6gAAABMAAAAAAAAABWFkbWluAAAAAAAAEwAAAAEAAAPpAAAAAgAAAAM=", "AAAAAAAAAMVEOSAodjEpOiBjb2RlIHVwZ3JhZGVzIGFyZSBhdXRob3Itb25seS4gYHVwZ3JhZGVyYCBpcyBmaXhlZCBhdCBkZXBsb3kKdGltZSBhbmQgY2FuIHNpZ24gYHVwZ3JhZGVgIGFsb25lLCB3aXRoIG5vIG5vdGljZSBwZXJpb2QuIE1vdmluZyB0byBhCm11bHRpc2lnIHBsdXMgbm90aWNlIHBlcmlvZCBpcyBhIGxhdGVyLCBhbm5vdW5jZWQgY2hhbmdlLgAAAAAAAA1fX2NvbnN0cnVjdG9yAAAAAAAAAQAAAAAAAAAIdXBncmFkZXIAAAATAAAAAA==", "AAAAAAAAAAgxIGFkbWluLgAAAA1hZGRfcHVibGlzaGVyAAAAAAAAAwAAAAAAAAAKY2hhbm5lbF9pZAAAAAAABgAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAlwdWJsaXNoZXIAAAAAAAATAAAAAQAAA+kAAAACAAAAAw==", "AAAAAAAAADRDaGFubmVsIHRocmVzaG9sZC4gQ2xvc2VkIGNoYW5uZWxzIHJlamVjdCBgcHVibGlzaGAuAAAADWNsb3NlX2NoYW5uZWwAAAAAAAACAAAAAAAAAApjaGFubmVsX2lkAAAAAAAGAAAAAAAAAAdzaWduZXJzAAAAA+oAAAATAAAAAQAAA+kAAAACAAAAAw==", "AAAAAAAAADRDaGFubmVsIHRocmVzaG9sZC4gYDEgPD0gdGhyZXNob2xkIDw9IGFkbWlucy5sZW4oKWAuAAAADXNldF90aHJlc2hvbGQAAAAAAAADAAAAAAAAAApjaGFubmVsX2lkAAAAAAAGAAAAAAAAAAdzaWduZXJzAAAAA+oAAAATAAAAAAAAAAl0aHJlc2hvbGQAAAAAAAAEAAAAAQAAA+kAAAACAAAAAw==", "AAAAAAAAAEVDcmVhdG9yIGJlY29tZXMgdGhlIGZpcnN0IGFkbWluICh0aHJlc2hvbGQgMSkuIFJlcXVpcmVzIGNyZWF0b3IgYXV0aC4AAAAAAAAOY3JlYXRlX2NoYW5uZWwAAAAAAAIAAAAAAAAAB2NyZWF0b3IAAAAAEwAAAAAAAAAEa2luZAAAB9AAAAALQ2hhbm5lbEtpbmQAAAAAAQAAA+kAAAAGAAAAAw==", "AAAAAAAAAAgxIGFkbWluLgAAABByZW1vdmVfcHVibGlzaGVyAAAAAwAAAAAAAAAKY2hhbm5lbF9pZAAAAAAABgAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAlwdWJsaXNoZXIAAAAAAAATAAAAAQAAA+kAAAACAAAAAw==", "AAAAAAAAAENDaGFubmVsIHRocmVzaG9sZC4gUmVwbGFjZXMgdGhlIGFkbWluIHNldCBhbmQgdGhyZXNob2xkIGF0b21pY2FsbHkuAAAAABB0cmFuc2Zlcl9jaGFubmVsAAAABAAAAAAAAAAKY2hhbm5lbF9pZAAAAAAABgAAAAAAAAAHc2lnbmVycwAAAAPqAAAAEwAAAAAAAAAKbmV3X2FkbWlucwAAAAAD6gAAABMAAAAAAAAADW5ld190aHJlc2hvbGQAAAAAAAAEAAAAAQAAA+kAAAACAAAAAw==", "AAAAAQAAAExJbnZhcmlhbnRzOiAxIDw9IHRocmVzaG9sZCA8PSBhZG1pbnMubGVuKCkgPD0gTUFYX0FETUlOUzsgbmV2ZXIgemVybyBhZG1pbnMuAAAAAAAAAAdDaGFubmVsAAAAAAQAAAAAAAAABmFkbWlucwAAAAAD6gAAABMAAAAAAAAABmNsb3NlZAAAAAAAAQAAAAAAAAAEa2luZAAAB9AAAAALQ2hhbm5lbEtpbmQAAAAAOlNpZ25hdHVyZXMgcmVxdWlyZWQgZm9yIHNlbnNpdGl2ZSBhY3Rpb25zIChENCkuIERlZmF1bHQgMS4AAAAAAAl0aHJlc2hvbGQAAAAAAAAE", "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAABAAAAAAAAAA7U29sZSBhZGRyZXNzIGFsbG93ZWQgdG8gdXBncmFkZSB0aGUgY29udHJhY3QgY29kZSAoRDksIHYxKS4AAAAACFVwZ3JhZGVyAAAAAAAAAAAAAAAGTmV4dElkAAAAAAABAAAAAAAAAAdDaGFubmVsAAAAAAEAAAAGAAAAAQAAAAAAAAAJUHVibGlzaGVyAAAAAAAAAgAAAAYAAAAT", "AAAAAgAAAHxPcGVuOiBhbnlvbmUgc3Vic2NyaWJlcy4gUmVzdHJpY3RlZDogYWRtaW5zIGFwcHJvdmUgc3Vic2NyaWJlcnMuClN1YnNjcmlwdGlvbnMgYXJlIG5ldmVyIHN0b3JlZCBvbi1jaGFpbiAocHJpbmNpcGxlIDIgLyBENikuAAAAAAAAAAtDaGFubmVsS2luZAAAAAACAAAAAAAAAAAAAAAET3BlbgAAAAAAAAAAAAAAClJlc3RyaWN0ZWQAAA==", "AAAABAAAADhFcnJvciBjb2RlcyBhcmUgcHVibGljIEFCSTogbmV2ZXIgcmVudW1iZXIsIG9ubHkgYXBwZW5kLgAAAAAAAAAFRXJyb3IAAAAAAAALAAAAAAAAAA5Ob3RJbXBsZW1lbnRlZAAAAAAAAQAAAAAAAAAPQ2hhbm5lbE5vdEZvdW5kAAAAAAIAAAAAAAAADFVuYXV0aG9yaXplZAAAAAMAAAAAAAAAEEludmFsaWRUaHJlc2hvbGQAAAAEAAAAAAAAAA1DaGFubmVsQ2xvc2VkAAAAAAAABQAAAAAAAAAPUGF5bG9hZFRvb0xhcmdlAAAAAAYAAAAAAAAADVRvb01hbnlBZG1pbnMAAAAAAAAHAAAAAAAAAA9EdXBsaWNhdGVTaWduZXIAAAAACAAAAAAAAAAITm90QWRtaW4AAAAJAAAAAAAAAAlMYXN0QWRtaW4AAAAAAAAKAAAAAAAAAA5JbnZhbGlkUGF5bG9hZAAAAAAACw==", "AAAABQAAAERBZG1pbi1zZXQgY2hhbmdlcyBhcmUgYW5ub3VuY2VkIHRvIHN1YnNjcmliZXJzIChSRUFETUUgcHJpbmNpcGxlIDMpLgAAAAAAAAAKQWRtaW5BZGRlZAAAAAAAAQAAAAlhZG1pbl9hZGQAAAAAAAACAAAAAAAAAApjaGFubmVsX2lkAAAAAAAGAAAAAQAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAI=", "AAAABQAAAAAAAAAAAAAADEFkbWluUmVtb3ZlZAAAAAEAAAAIYWRtaW5fcm0AAAACAAAAAAAAAApjaGFubmVsX2lkAAAAAAAGAAAAAQAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAI=", "AAAABQAAAAAAAAAAAAAADUNoYW5uZWxDbG9zZWQAAAAAAAABAAAABmNsb3NlZAAAAAAAAQAAAAAAAAAKY2hhbm5lbF9pZAAAAAAABgAAAAEAAAAC", "AAAABQAAAAAAAAAAAAAADkNoYW5uZWxDcmVhdGVkAAAAAAABAAAAB2NyZWF0ZWQAAAAAAgAAAAAAAAAKY2hhbm5lbF9pZAAAAAAABgAAAAEAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAAC", "AAAABQAAAAAAAAAAAAAADlB1Ymxpc2hlckFkZGVkAAAAAAABAAAAB3B1Yl9hZGQAAAAAAgAAAAAAAAAKY2hhbm5lbF9pZAAAAAAABgAAAAEAAAAAAAAACXB1Ymxpc2hlcgAAAAAAABMAAAAAAAAAAg==", "AAAABQAAAGBUb3BpY3M6ICgibXNnIiwgY2hhbm5lbF9pZCkuIFBheWxvYWQgaXMgb3BhcXVlOyBwcml2YXRlIGNvbnRlbnQgbXVzdCBiZQplbmNyeXB0ZWQgYnkgdGhlIHNlbmRlci4AAAAAAAAAEE1lc3NhZ2VQdWJsaXNoZWQAAAABAAAAA21zZwAAAAADAAAAAAAAAApjaGFubmVsX2lkAAAAAAAGAAAAAQAAAAAAAAAJcHVibGlzaGVyAAAAAAAAEwAAAAAAAAAAAAAAB3BheWxvYWQAAAAADgAAAAAAAAAC", "AAAABQAAAAAAAAAAAAAAEFB1Ymxpc2hlclJlbW92ZWQAAAABAAAABnB1Yl9ybQAAAAAAAgAAAAAAAAAKY2hhbm5lbF9pZAAAAAAABgAAAAEAAAAAAAAACXB1Ymxpc2hlcgAAAAAAABMAAAAAAAAAAg==", "AAAABQAAAAAAAAAAAAAAEFRocmVzaG9sZENoYW5nZWQAAAABAAAACXRocmVzaG9sZAAAAAAAAAIAAAAAAAAACmNoYW5uZWxfaWQAAAAAAAYAAAABAAAAAAAAAAl0aHJlc2hvbGQAAAAAAAAEAAAAAAAAAAI=", "AAAABQAAAAAAAAAAAAAAEkNoYW5uZWxUcmFuc2ZlcnJlZAAAAAAAAQAAAAt0cmFuc2ZlcnJlZAAAAAABAAAAAAAAAApjaGFubmVsX2lkAAAAAAAGAAAAAQAAAAI="]),
      options
    );
  }

   static deploy<T = Client>(args: { upgrader: string | Address }, options: MethodOptions & Omit<ContractClientOptions, 'contractId'> & { salt?: Uint8Array; address?: string; } & ({ wasmHash: Uint8Array | string; format?: "hex" | "base64"; externalRef?: never; } | { externalRef: ExternalExecutableRef; wasmHash?: never; format?: never; })): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy(args, options);
  }
  public readonly fromJson = {
    publish : this.txFromJson<Result<null, Error>>,  upgrade : this.txFromJson<void>,  version : this.txFromJson<number>,  upgrader : this.txFromJson<string>,  add_admin : this.txFromJson<Result<null, Error>>,  get_channel : this.txFromJson<Result<Channel, Error>>,  remove_admin : this.txFromJson<Result<null, Error>>,  add_publisher : this.txFromJson<Result<null, Error>>,  close_channel : this.txFromJson<Result<null, Error>>,  set_threshold : this.txFromJson<Result<null, Error>>,  create_channel : this.txFromJson<Result<bigint, Error>>,  remove_publisher : this.txFromJson<Result<null, Error>>,  transfer_channel : this.txFromJson<Result<null, Error>>
  };

  /** @deprecated Use fromJson instead. */
  public readonly fromJSON = this.fromJson;

  /**
   * Parse a raw contract event (topics + data) into a typed {@link ContractEvent}.
   */
  parseEvent(topics: xdr.ScVal[] | string[], data: xdr.ScVal | string): ContractEvent | undefined {
    return this.spec.parseEvent(topics, data) as ContractEvent | undefined;
  }
  /**
   * Build a topics filter row for the "AdminAdded" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  adminAddedEventFilter(topicValues?: { channel_id?: bigint }): string[] {
    return this.spec.eventTopicFilter("AdminAdded", topicValues);
  }
  /**
   * Build a topics filter row for the "AdminRemoved" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  adminRemovedEventFilter(topicValues?: { channel_id?: bigint }): string[] {
    return this.spec.eventTopicFilter("AdminRemoved", topicValues);
  }
  /**
   * Build a topics filter row for the "ChannelClosed" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  channelClosedEventFilter(topicValues?: { channel_id?: bigint }): string[] {
    return this.spec.eventTopicFilter("ChannelClosed", topicValues);
  }
  /**
   * Build a topics filter row for the "ChannelCreated" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  channelCreatedEventFilter(topicValues?: { channel_id?: bigint }): string[] {
    return this.spec.eventTopicFilter("ChannelCreated", topicValues);
  }
  /**
   * Build a topics filter row for the "PublisherAdded" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  publisherAddedEventFilter(topicValues?: { channel_id?: bigint }): string[] {
    return this.spec.eventTopicFilter("PublisherAdded", topicValues);
  }
  /**
   * Build a topics filter row for the "MessagePublished" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  messagePublishedEventFilter(topicValues?: { channel_id?: bigint }): string[] {
    return this.spec.eventTopicFilter("MessagePublished", topicValues);
  }
  /**
   * Build a topics filter row for the "PublisherRemoved" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  publisherRemovedEventFilter(topicValues?: { channel_id?: bigint }): string[] {
    return this.spec.eventTopicFilter("PublisherRemoved", topicValues);
  }
  /**
   * Build a topics filter row for the "ThresholdChanged" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  thresholdChangedEventFilter(topicValues?: { channel_id?: bigint }): string[] {
    return this.spec.eventTopicFilter("ThresholdChanged", topicValues);
  }
  /**
   * Build a topics filter row for the "ChannelTransferred" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  channelTransferredEventFilter(topicValues?: { channel_id?: bigint }): string[] {
    return this.spec.eventTopicFilter("ChannelTransferred", topicValues);
  }
}