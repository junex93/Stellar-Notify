import { describe, expect, it, vi } from "vitest";
import { type Deps, type Publisher, buildProgram } from "./program.js";

const ME = "GME";

function setup(stdin = "") {
  const client = {
    createChannel: vi.fn(async () => 7n),
    publish: vi.fn(async () => {}),
    addPublisher: vi.fn(async () => {}),
    removePublisher: vi.fn(async () => {}),
    getChannel: vi.fn(async () => ({
      admins: [ME],
      kind: "open" as const,
      threshold: 1,
      closed: false,
    })),
  } satisfies Publisher;
  const out: string[] = [];
  const connect = vi.fn(async (_alias: string) => ({ client, address: ME }));
  const deps: Deps = { connect, readStdin: async () => stdin, out: (l) => out.push(l) };
  const run = (...args: string[]) => buildProgram(deps).parseAsync(args, { from: "user" });
  return { client, out, connect, run };
}

describe("notify CLI", () => {
  it("creates an open channel by default and prints its id", async () => {
    const { client, out, run } = setup();
    await run("channel", "create");
    expect(client.createChannel).toHaveBeenCalledWith(ME, "open");
    expect(out).toEqual(["7"]);
  });

  it("creates a restricted channel with --restricted", async () => {
    const { client, run } = setup();
    await run("channel", "create", "--restricted");
    expect(client.createChannel).toHaveBeenCalledWith(ME, "restricted");
  });

  it("publishes the message as the signing identity", async () => {
    const { client, run } = setup();
    await run("publish", "7", "hello");
    expect(client.publish).toHaveBeenCalledWith(7n, ME, "hello");
  });

  it('reads the message from stdin for "-" and trims the trailing newline', async () => {
    const { client, run } = setup("digest line\n");
    await run("publish", "7", "-");
    expect(client.publish).toHaveBeenCalledWith(7n, ME, "digest line");
  });

  it("adds and removes publishers", async () => {
    const { client, run } = setup();
    await run("publisher", "add", "7", "GPUB");
    await run("publisher", "remove", "7", "GPUB");
    expect(client.addPublisher).toHaveBeenCalledWith(7n, ME, "GPUB");
    expect(client.removePublisher).toHaveBeenCalledWith(7n, ME, "GPUB");
  });

  it("shows a channel as JSON", async () => {
    const { out, run } = setup();
    await run("channel", "show", "7");
    expect(JSON.parse(out[0] ?? "")).toMatchObject({ admins: [ME], threshold: 1 });
  });

  it("uses --identity as the keystore alias", async () => {
    const { connect, run } = setup();
    await run("--identity", "alice", "publish", "7", "x");
    expect(connect).toHaveBeenCalledWith("alice");
  });

  it("rejects a non-numeric channel id before connecting", async () => {
    const { connect, run } = setup();
    await expect(run("publish", "abc", "x")).rejects.toThrow('invalid channel id "abc"');
    expect(connect).not.toHaveBeenCalled();
  });
});
