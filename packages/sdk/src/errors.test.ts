import { describe, expect, it } from "vitest";
import {
  NotifyContractError,
  contractErrorFromCode,
  contractErrorFromName,
  contractErrorFromText,
} from "./errors.js";

describe("contract errors", () => {
  it("maps a code to the ABI name", () => {
    const e = contractErrorFromCode(3);
    expect(e).toBeInstanceOf(NotifyContractError);
    expect([e.code, e.contractError]).toEqual([3, "Unauthorized"]);
  });
  it("maps a name back to its code", () => {
    expect(contractErrorFromName("PayloadTooLarge").code).toBe(6);
  });
  it("parses the code out of a simulation failure", () => {
    const e = contractErrorFromText("HostError: Error(Contract, #5)\nEvent log ...");
    expect(e?.contractError).toBe("ChannelClosed");
  });
  it("ignores text without a contract error", () => {
    expect(contractErrorFromText("network down")).toBeUndefined();
  });
  it("keeps unknown codes distinguishable", () => {
    expect(contractErrorFromCode(99).contractError).toBe("Unknown");
  });
});
