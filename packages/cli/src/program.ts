import {
  type NotifyClient,
  randomSalt,
  saltFromHex,
  subscriberCommitment,
  toHex,
} from "@notify/sdk";
import { Command } from "commander";
import { DEFAULT_IDENTITY } from "./identity.js";

export type Publisher = Pick<
  NotifyClient,
  | "createChannel"
  | "publish"
  | "addPublisher"
  | "removePublisher"
  | "getChannel"
  | "approveSubscriber"
  | "removeSubscriber"
>;

export interface Deps {
  /** Builds a client signing as the keystore identity `alias`, plus that identity's address. */
  connect(alias: string): Promise<{ client: Publisher; address: string }>;
  readStdin(): Promise<string>;
  out(line: string): void;
  /** Secrets such as the channel salt come from here, never from argv. */
  env: Record<string, string | undefined>;
}

function parseChannelId(raw: string): bigint {
  if (!/^\d+$/.test(raw)) throw new Error(`invalid channel id "${raw}"`);
  return BigInt(raw);
}

export function buildProgram(deps: Deps): Command {
  const program = new Command("notify")
    .description("Stellar Notify publisher CLI")
    .option("--identity <alias>", "Stellar CLI keystore identity that signs", DEFAULT_IDENTITY);
  const session = () => deps.connect(program.opts<{ identity: string }>().identity);

  const channel = program.command("channel").description("Manage channels");
  channel
    .command("create")
    .description("Create a channel; the signing identity becomes its first admin")
    .option("--restricted", "approve subscribers manually")
    .action(async (opts: { restricted?: boolean }) => {
      const { client, address } = await session();
      const id = await client.createChannel(address, opts.restricted ? "restricted" : "open");
      deps.out(id.toString());
    });
  channel
    .command("show <channelId>")
    .description("Show a channel's admins, kind and threshold")
    .action(async (channelId: string) => {
      const { client } = await session();
      deps.out(JSON.stringify(await client.getChannel(parseChannelId(channelId)), null, 2));
    });

  channel
    .command("salt")
    .description("Generate a random salt for a restricted channel (keep it secret, never on-chain)")
    .action(() => {
      deps.out(toHex(randomSalt()));
    });

  program
    .command("publish <channelId> <message>")
    .description('Publish a message to a channel ("-" reads it from stdin)')
    .action(async (channelId: string, message: string) => {
      const id = parseChannelId(channelId);
      const text = message === "-" ? (await deps.readStdin()).trimEnd() : message;
      const { client, address } = await session();
      await client.publish(id, address, text);
      deps.out(`published to channel ${id}`);
    });

  const publisher = program.command("publisher").description("Manage a channel's publishers");
  for (const action of ["add", "remove"] as const) {
    publisher
      .command(`${action} <channelId> <address>`)
      .description(`${action === "add" ? "Grant" : "Revoke"} publish rights (admin only)`)
      .action(async (channelId: string, publisherAddress: string) => {
        const id = parseChannelId(channelId);
        const { client, address } = await session();
        if (action === "add") await client.addPublisher(id, address, publisherAddress);
        else await client.removePublisher(id, address, publisherAddress);
        deps.out(`publisher ${action === "add" ? "added to" : "removed from"} channel ${id}`);
      });
  }

  const subscriber = program
    .command("subscriber")
    .description("Approve or remove subscribers of a restricted channel (admin only)");
  for (const action of ["approve", "remove"] as const) {
    subscriber
      .command(`${action} <channelId> <wallet>`)
      .description(
        `${action === "approve" ? "Approve" : "Remove"} a wallet; the salt is read from NOTIFY_CHANNEL_SALT`,
      )
      .action(async (channelId: string, wallet: string) => {
        const id = parseChannelId(channelId);
        const salt = deps.env.NOTIFY_CHANNEL_SALT;
        if (!salt) throw new Error("NOTIFY_CHANNEL_SALT is not set (see `notify channel salt`)");
        const commitment = subscriberCommitment(id, saltFromHex(salt), wallet);
        const { client, address } = await session();
        if (action === "approve") await client.approveSubscriber(id, address, commitment);
        else await client.removeSubscriber(id, address, commitment);
        deps.out(
          `subscriber ${action === "approve" ? "approved on" : "removed from"} channel ${id}`,
        );
      });
  }

  return program;
}
