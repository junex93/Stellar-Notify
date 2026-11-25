import type { NotifyClient } from "@notify/sdk";
import { Command } from "commander";
import { DEFAULT_IDENTITY } from "./identity.js";

export type Publisher = Pick<
  NotifyClient,
  "createChannel" | "publish" | "addPublisher" | "removePublisher" | "getChannel"
>;

export interface Deps {
  /** Builds a client signing as the keystore identity `alias`, plus that identity's address. */
  connect(alias: string): Promise<{ client: Publisher; address: string }>;
  readStdin(): Promise<string>;
  out(line: string): void;
}

function parsebigint(raw: string): bigint {
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
      deps.out(JSON.stringify(await client.getChannel(parsebigint(channelId)), null, 2));
    });

  program
    .command("publish <channelId> <message>")
    .description('Publish a message to a channel ("-" reads it from stdin)')
    .action(async (channelId: string, message: string) => {
      const id = parsebigint(channelId);
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
        const id = parsebigint(channelId);
        const { client, address } = await session();
        if (action === "add") await client.addPublisher(id, address, publisherAddress);
        else await client.removePublisher(id, address, publisherAddress);
        deps.out(`publisher ${action === "add" ? "added to" : "removed from"} channel ${id}`);
      });
  }

  return program;
}
