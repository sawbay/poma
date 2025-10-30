
import { tool } from "ai";
import { PricesQuoteInputSchema } from "./schema";

async function fetchPrices(symbols: string[], vsCurrency: string) {
  const upperSymbols = symbols.map((symbol) => symbol.toUpperCase());
  const result: Record<string, number> = {};

  const wantsCrypto = ["BTC", "ETH", "SOL"].filter((symbol) =>
    upperSymbols.includes(symbol)
  );

  if (wantsCrypto.length) {
    try {
      const response = await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd",
        { cf: { cacheEverything: true, cacheTtl: 900 } }
      );
      if (response.ok) {
        const payload = (await response.json()) as Record<string, { usd?: number }>;
        if (upperSymbols.includes("BTC")) {
          result.BTC = payload.bitcoin?.usd ?? 0;
        }
        if (upperSymbols.includes("ETH")) {
          result.ETH = payload.ethereum?.usd ?? 0;
        }
        if (upperSymbols.includes("SOL")) {
          result.SOL = payload.solana?.usd ?? 0;
        }
      }
    } catch (error) {
      console.warn("Failed to fetch crypto prices", error);
    }
  }

  if (upperSymbols.includes("GOLD")) {
    try {
      const response = await fetch("https://data-asg.goldprice.org/dbXRates/USD", {
        cf: { cacheEverything: true, cacheTtl: 1800 }
      });
      if (response.ok) {
        const payload = (await response.json()) as {
          items?: Array<{ xauPrice?: number; xauPriceGram24k?: number }>;
        };
        result.GOLD = payload.items?.[0]?.xauPrice ?? payload.items?.[0]?.xauPriceGram24k ?? 0;
      }
    } catch (error) {
      console.warn("Failed to fetch gold price", error);
    }
  }

  if (upperSymbols.includes("USD")) {
    result.USD = 1;
  }

  for (const symbol of upperSymbols) {
    if (!(symbol in result)) {
      result[symbol] = 0;
    }
  }

  return {
    timestamp: Date.now(),
    vsCurrency: vsCurrency.toUpperCase(),
    prices: result
  };
}

export const pricesQuote = tool({
  description:
    "Fetch latest USD quotes for requested symbols (BTC, ETH, SOL, GOLD, USD). Returns 0 when unavailable.",
  inputSchema: PricesQuoteInputSchema,
  execute: async ({ symbols, vsCurrency }) =>
    fetchPrices(symbols, vsCurrency)
});
