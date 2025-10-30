import { tool } from "ai";
import { bigIntToFloat } from "./utils";
import { z } from "zod";

const BalanceInputSchema = z.object({
  address: z.string().min(1, "Wallet address is required")
});

async function fetchBitcoinBalance(address: string): Promise<number> {
  const url = `https://blockchain.info/rawaddr/${encodeURIComponent(
    address
  )}?limit=0&cors=true`;
  const response = await fetch(url, { cf: { cacheTtl: 300 } });
  if (!response.ok) {
    throw new Error(`Failed to fetch bitcoin balance (${response.status})`);
  }
  const payload = (await response.json()) as { final_balance?: number };
  return (payload.final_balance ?? 0) / 1e8;
}

async function fetchEthereumBalance(address: string): Promise<number> {
  const response = await fetch("https://eth.llamarpc.com", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_getBalance",
      params: [address, "latest"]
    })
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ethereum balance (${response.status})`);
  }
  const payload = (await response.json()) as { result?: string; error?: { message?: string } };
  if (payload.error) {
    throw new Error(payload.error.message ?? "Ethereum RPC error");
  }
  const wei = payload.result ? BigInt(payload.result) : 0n;
  if (wei === 0n) return 0;
  return bigIntToFloat(wei, 18);
}

async function fetchSolanaBalance(address: string): Promise<number> {
  const response = await fetch("https://api.mainnet-beta.solana.com", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getBalance",
      params: [address]
    })
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch solana balance (${response.status})`);
  }
  const payload = (await response.json()) as { result?: { value?: number }; error?: { message?: string } };
  if (payload.error) {
    throw new Error(payload.error.message ?? "Solana RPC error");
  }
  const lamports = payload.result?.value ?? 0;
  return lamports / 1e9;
}

export const bitcoinBalance = tool({
  description: "Fetch live Bitcoin balance for a wallet address.",
  inputSchema: BalanceInputSchema,
  execute: async ({ address }) => {
    try {
      const quantity = await fetchBitcoinBalance(address);
      const summary = `Balance of ${address}: ${quantity} BTC`;
      return summary;
    } catch (error) {
      const summary = "Balance lookup failed";
      return summary;
    }
  }
});

export const ethereumBalance = tool({
  description: "Fetch live Ethereum balance for a wallet address.",
  inputSchema: BalanceInputSchema,
  execute: async ({ address }) => {
    try {
      const quantity = await fetchEthereumBalance(address);
      const summary = `Balance of ${address}: ${quantity} ETH`;
      return summary;
    } catch (error) {
      const summary = "Balance lookup failed";
      return summary;
    }
  }
});

export const solanaBalance = tool({
  description: "Fetch live Solana balance for a wallet address.",
  inputSchema: BalanceInputSchema,
  execute: async ({ address }) => {
    try {
      const quantity = await fetchSolanaBalance(address);
      const summary = `Balance of ${address}: ${quantity} SOL`;
      return summary;
    } catch (error) {
      const summary = "Balance lookup failed";
      return summary;
    }
  }
});