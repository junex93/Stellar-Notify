import { defineConfig } from "@caatinga/core";

export default defineConfig({
  project: "stellar-notify",
  defaultNetwork: "testnet",
  contracts: {
    channels: {
      path: "./contracts/channels",
      wasm: "./contracts/channels/target/wasm32v1-none/release/channels.wasm",
      // D9: the deploying identity is the sole upgrader in v1.
      deployArgs: { upgrader: process.env.CAATINGA_SOURCE ?? "notify-dev" },
    },
  },
  networks: {
    testnet: {
      rpcUrl: "https://soroban-testnet.stellar.org",
      networkPassphrase: "Test SDF Network ; September 2015",
    },
    mainnet: {
      rpcUrl: "https://mainnet.sorobanrpc.com",
      networkPassphrase: "Public Global Stellar Network ; September 2015",
    },
  },
});
