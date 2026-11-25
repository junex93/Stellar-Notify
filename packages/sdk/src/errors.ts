import { Error as ContractErrors } from "./generated/channels/index.js";

/** A contract call rejected by the channels contract; `code` is the public ABI number. */
export class NotifyContractError extends Error {
  constructor(
    readonly code: number,
    readonly contractError: string,
  ) {
    super(`${contractError} (contract error #${code})`);
    this.name = "NotifyContractError";
  }
}

const byCode = ContractErrors as Record<number, { message: string } | undefined>;

export function contractErrorFromCode(code: number): NotifyContractError {
  return new NotifyContractError(code, byCode[code]?.message ?? "Unknown");
}

/** Simulation failures surface the contract error only as text: `Error(Contract, #3)`. */
export function contractErrorFromText(text: string): NotifyContractError | undefined {
  const code = /Error\(Contract, #(\d+)\)/.exec(text)?.[1];
  return code === undefined ? undefined : contractErrorFromCode(Number(code));
}

export function contractErrorFromName(name: string): NotifyContractError {
  const code = Object.entries(byCode).find(([, e]) => e?.message === name)?.[0];
  return new NotifyContractError(code === undefined ? 0 : Number(code), name);
}
