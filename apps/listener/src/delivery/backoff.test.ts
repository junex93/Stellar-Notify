import { describe, expect, it } from "vitest";
import { backoffMs } from "./worker.js";

describe("backoffMs", () => {
  it("doubles from the base and caps", () => {
    expect([1, 2, 3, 4].map((n) => backoffMs(n, 1000, 3500))).toEqual([1000, 2000, 3500, 3500]);
  });
});
