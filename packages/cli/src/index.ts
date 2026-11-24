#!/usr/bin/env node
import { Command } from "commander";

const program = new Command("notify").description("Stellar Notify publisher CLI");

const channel = program.command("channel").description("Manage channels");
channel
  .command("create")
  .option("--restricted", "approve subscribers manually")
  .action(() => {
    throw new Error("not implemented");
  });

program
  .command("publish <channelId> <message>")
  .description("Publish a message to a channel")
  .action(() => {
    throw new Error("not implemented");
  });

await program.parseAsync();
