import { existsSync } from "node:fs";

export interface NetworkConfig {
  rpcUrl: string;
  networkPassphrase: string;
  contractId: string;
}

const REQUIRED = {
  rpcUrl: "STELLAR_RPC_URL",
  networkPassphrase: "STELLAR_NETWORK_PASSPHRASE",
  contractId: "NOTIFY_CHANNELS_CONTRACT_ID",
} as const;

/** Reads `.env` from the working directory when present, then requires the network settings. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): NetworkConfig {
  if (env === process.env && existsSync(".env")) process.loadEnvFile(".env");
  const config = {} as NetworkConfig;
  for (const [key, name] of Object.entries(REQUIRED)) {
    const value = env[name];
    if (!value) {
      const hint = name === "NOTIFY_CHANNELS_CONTRACT_ID" ? " (written by `ctg sync-env`)" : "";
      throw new Error(`${name} is not set${hint}`);
    }
    config[key as keyof NetworkConfig] = value;
  }
  return config;
}
