import { z } from "zod";
import type { AITool } from "agents/ai-react";
import { BalanceInputSchema, PortfolioReadInputSchema, PortfolioWriteInputSchema, PricesQuoteInputSchema } from "./schema";

const clientToolMetadata: Record<string, { description: string; inputSchema: z.ZodTypeAny }> = {
  portfolioRead: {
    description: "Fetch the current canonical portfolio snapshot for a user.",
    inputSchema: PortfolioReadInputSchema
  },
  portfolioWrite: {
    description:
      "Persist portfolio mutations (add/update/remove assets). Requires human approval before execution.",
    inputSchema: PortfolioWriteInputSchema
  },
  bitcoinBalance: {
    description: "Fetch live Bitcoin balance for a wallet address.",
    inputSchema: BalanceInputSchema
  },
  ethereumBalance: {
    description: "Fetch live Ethereum balance for a wallet address.",
    inputSchema: BalanceInputSchema
  },
  solanaBalance: {
    description: "Fetch live Solana balance for a wallet address.",
    inputSchema: BalanceInputSchema
  },
  "tool.prices.quote": {
    description:
      "Fetch latest USD quotes for requested symbols (BTC, ETH, SOL, GOLD, USD). Returns 0 when unavailable.",
    inputSchema: PricesQuoteInputSchema
  }
};

export const clientTools: Record<string, AITool> = Object.fromEntries(
  Object.entries(clientToolMetadata).map(([name, meta]) => [
    name,
    {
      description: meta.description,
      inputSchema: meta.inputSchema
    } as AITool
  ])
);
