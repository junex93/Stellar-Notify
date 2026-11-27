const EXPLORER = "https://stellar.expert/explorer";

const NETWORKS: Record<string, string> = {
  "Test SDF Network ; September 2015": "testnet",
  "Public Global Stellar Network ; September 2015": "public",
};

/** Transaction URL builder for the network named by the passphrase; undefined if unknown. */
export function explorerTxUrl(passphrase: string): ((txHash: string) => string) | undefined {
  const network = NETWORKS[passphrase];
  if (!network) return undefined;
  return (txHash) => `${EXPLORER}/${network}/tx/${txHash}`;
}
