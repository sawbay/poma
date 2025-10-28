import { tool } from "ai";
import type { AITool } from "agents/ai-react";
import { z } from "zod";

const DEFAULT_USER_ID = "single-user";
const PORTFOLIO_KEY_PREFIX = "portfolio:";
const IMPORT_SESSION_KEY_PREFIX = "import-session:";

const ChainSchema = z.enum(["bitcoin", "ethereum", "solana"]);
const AssetCategorySchema = z.enum(["blockchain", "physical", "stock"]);
const CustodySchema = z.enum(["self_custody", "exchange", "unknown"]).optional();

const BaseAssetSchema = z.object({
  id: z.string().optional(),
  label: z.string(),
  category: AssetCategorySchema,
  quantity: z.number().optional(),
  chain: ChainSchema.optional(),
  address: z.string().optional(),
  symbol: z.string().optional(),
  ticker: z.string().optional(),
  unit: z.string().optional(),
  custody: CustodySchema,
  notes: z.string().optional(),
  metadata: z.record(z.unknown()).optional()
});

const StoredAssetSchema = BaseAssetSchema.extend({
  id: z.string()
});

const PortfolioStateSchema = z.object({
  userId: z.string(),
  updatedAt: z.string(),
  assets: z.array(StoredAssetSchema),
  metadata: z.record(z.unknown()).optional()
});

const PortfolioReadInputSchema = z.object({
  userId: z.string().default(DEFAULT_USER_ID)
});

const AddAssetSchema = BaseAssetSchema.extend({
  category: AssetCategorySchema,
  label: z.string()
});

const UpdatePatchSchema = BaseAssetSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "Update patch must include at least one field"
);

const PortfolioWriteOperationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("add"),
    asset: AddAssetSchema
  }),
  z.object({
    type: z.literal("update"),
    assetId: z.string(),
    patch: UpdatePatchSchema
  }),
  z.object({
    type: z.literal("remove"),
    assetId: z.string()
  })
]);

export const PortfolioWriteInputSchema = z.object({
  userId: z.string().default(DEFAULT_USER_ID),
  operations: z.array(PortfolioWriteOperationSchema).min(1),
  reason: z.string().optional(),
  sessionId: z.string().optional(),
  approvedBy: z.string().optional()
});

const StagedAssetSchema = BaseAssetSchema.extend({
  id: z.string().optional(),
  provisionalId: z.string().optional(),
  status: z.enum(["pending", "ready", "committed", "rejected"]).default("pending"),
  requiresApproval: z.boolean().default(true),
  pendingQuestions: z.array(z.string()).default([]),
  source: z.string().optional(),
  confidence: z.number().min(0).max(1).optional()
});

const ImportSessionStatusSchema = z.enum([
  "open",
  "awaiting_approval",
  "approved",
  "rejected",
  "committed",
  "discarded"
]);

const ImportSessionSchema = z.object({
  sessionId: z.string(),
  status: ImportSessionStatusSchema,
  staged: z.array(StagedAssetSchema),
  pendingQuestions: z.array(z.string()),
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.string(),
  updatedAt: z.string()
});

const ImportSessionReadInputSchema = z.object({
  sessionId: z.string()
});

const ImportSessionWriteInputSchema = z.object({
  sessionId: z.string(),
  action: z
    .enum(["upsert", "replace", "append", "clear", "update-status"])
    .default("upsert"),
  session: ImportSessionSchema.partial().omit({ sessionId: true }).optional(),
  staged: z.array(StagedAssetSchema).optional(),
  pendingQuestions: z.array(z.string()).optional(),
  status: ImportSessionStatusSchema.optional(),
  metadata: z.record(z.unknown()).optional()
});

const PricesQuoteInputSchema = z.object({
  symbols: z.array(z.string()).min(1),
  vsCurrency: z.string().default("USD")
});

const BalanceInputSchema = z.object({
  address: z.string().min(1, "Wallet address is required")
});

type PortfolioState = z.infer<typeof PortfolioStateSchema>;
type PortfolioWriteInput = z.infer<typeof PortfolioWriteInputSchema>;
type ImportSession = z.infer<typeof ImportSessionSchema>;
type ImportSessionWriteInput = z.infer<typeof ImportSessionWriteInputSchema>;

function portfolioKey(userId: string) {
  return `${PORTFOLIO_KEY_PREFIX}${userId}`;
}

function importSessionKey(sessionId: string) {
  return `${IMPORT_SESSION_KEY_PREFIX}${sessionId}`;
}

function createEmptyPortfolio(userId: string): PortfolioState {
  return {
    userId,
    updatedAt: new Date(0).toISOString(),
    assets: [],
    metadata: {}
  };
}

function createEmptyImportSession(sessionId: string): ImportSession {
  const now = new Date(0).toISOString();
  return {
    sessionId,
    status: "open",
    staged: [],
    pendingQuestions: [],
    metadata: {},
    createdAt: now,
    updatedAt: now
  };
}

async function readPortfolio(env: Env, userId: string): Promise<PortfolioState> {
  const stored = await env.POMA_KV.get<PortfolioState>(portfolioKey(userId), "json");
  if (!stored) {
    return createEmptyPortfolio(userId);
  }
  return PortfolioStateSchema.parse({
    ...stored,
    userId: stored.userId ?? userId
  });
}

async function writePortfolio(
  env: Env,
  userId: string,
  next: PortfolioState
): Promise<void> {
  await env.POMA_KV.put(portfolioKey(userId), JSON.stringify(next));
}

async function readImportSession(
  env: Env,
  sessionId: string
): Promise<ImportSession> {
  const stored = await env.POMA_KV.get<ImportSession>(
    importSessionKey(sessionId),
    "json"
  );
  if (!stored) {
    return createEmptyImportSession(sessionId);
  }
  return ImportSessionSchema.parse(stored);
}

async function writeImportSession(
  env: Env,
  sessionId: string,
  session: ImportSession
): Promise<void> {
  await env.POMA_KV.put(importSessionKey(sessionId), JSON.stringify(session));
}

async function deleteImportSession(env: Env, sessionId: string): Promise<void> {
  await env.POMA_KV.delete(importSessionKey(sessionId));
}

function summarizeCounters(counters: {
  added: number;
  updated: number;
  removed: number;
}) {
  const parts = [];
  if (counters.added) {
    parts.push(`added ${counters.added}`);
  }
  if (counters.updated) {
    parts.push(`updated ${counters.updated}`);
  }
  if (counters.removed) {
    parts.push(`removed ${counters.removed}`);
  }
  return parts.length ? parts.join(", ") : "no changes";
}

function toStoredAsset(asset: z.infer<typeof AddAssetSchema>): z.infer<typeof StoredAssetSchema> {
  return {
    ...asset,
    id: asset.id ?? crypto.randomUUID(),
    quantity: asset.quantity ?? 0,
    metadata: asset.metadata ?? {}
  };
}

async function applyPortfolioWrite(
  env: Env,
  input: PortfolioWriteInput
): Promise<{ message: string; portfolio: PortfolioState }> {
  const payload = PortfolioWriteInputSchema.parse(input);
  const { userId } = payload;
  const state = await readPortfolio(env, userId);
  const nextAssets = [...state.assets];
  const counters = { added: 0, updated: 0, removed: 0 };

  const findAssetIndex = (assetId: string) =>
    nextAssets.findIndex((asset) => asset.id === assetId);

  for (const operation of payload.operations) {
    switch (operation.type) {
      case "add": {
        const asset = toStoredAsset(operation.asset);
        if (nextAssets.some((existing) => existing.id === asset.id)) {
          throw new Error(`Asset with id ${asset.id} already exists.`);
        }
        nextAssets.push(asset);
        counters.added += 1;
        break;
      }
      case "update": {
        const index = findAssetIndex(operation.assetId);
        if (index === -1) {
          throw new Error(`Asset with id ${operation.assetId} not found.`);
        }
        nextAssets[index] = {
          ...nextAssets[index],
          ...operation.patch,
          id: nextAssets[index].id // ensure ID stays intact
        };
        counters.updated += 1;
        break;
      }
      case "remove": {
        const index = findAssetIndex(operation.assetId);
        if (index === -1) {
          throw new Error(`Asset with id ${operation.assetId} not found.`);
        }
        nextAssets.splice(index, 1);
        counters.removed += 1;
        break;
      }
    }
  }

  const now = new Date().toISOString();
  const metadata = {
    ...(state.metadata ?? {}),
    ...(payload.reason ? { lastReason: payload.reason } : {}),
    ...(payload.sessionId ? { sessionId: payload.sessionId } : {}),
    ...(payload.approvedBy ? { approvedBy: payload.approvedBy } : {})
  };

  const nextState: PortfolioState = {
    userId,
    updatedAt: now,
    assets: nextAssets,
    metadata
  };

  await writePortfolio(env, userId, nextState);

  return {
    message: `Portfolio updated: ${summarizeCounters(counters)}.`,
    portfolio: nextState
  };
}

async function applyImportSessionWrite(
  env: Env,
  input: ImportSessionWriteInput
): Promise<ImportSession | { sessionId: string; cleared: true }> {
  const payload = ImportSessionWriteInputSchema.parse(input);
  const current = await readImportSession(env, payload.sessionId);

  if (payload.action === "clear") {
    await deleteImportSession(env, payload.sessionId);
    return { sessionId: payload.sessionId, cleared: true as const };
  }

  const now = new Date().toISOString();
  let updated: ImportSession = {
    ...current,
    updatedAt: now
  };

  if (payload.action === "replace") {
    const session = payload.session ?? {};
    updated = ImportSessionSchema.parse({
      sessionId: payload.sessionId,
      staged: session.staged ?? payload.staged ?? [],
      pendingQuestions: session.pendingQuestions ?? payload.pendingQuestions ?? [],
      status: session.status ?? payload.status ?? current.status,
      metadata: session.metadata ?? payload.metadata ?? current.metadata ?? {},
      createdAt: current.createdAt ?? now,
      updatedAt: now
    });
  } else {
    if (payload.staged?.length) {
      const staged = payload.action === "append"
        ? [...updated.staged, ...payload.staged]
        : payload.staged;
      updated = {
        ...updated,
        staged
      };
    }

    if (payload.pendingQuestions) {
      updated = {
        ...updated,
        pendingQuestions:
          payload.action === "append"
            ? [...updated.pendingQuestions, ...payload.pendingQuestions]
            : payload.pendingQuestions
      };
    }

    if (payload.metadata) {
      updated = {
        ...updated,
        metadata: {
          ...(updated.metadata ?? {}),
          ...payload.metadata
        }
      };
    }

    if (payload.status || payload.action === "update-status") {
      updated = {
        ...updated,
        status: payload.status ?? updated.status
      };
    }

    if (payload.session) {
      const sessionPatch = payload.session;
      updated = {
        ...updated,
        staged: sessionPatch.staged ?? updated.staged,
        pendingQuestions: sessionPatch.pendingQuestions ?? updated.pendingQuestions,
        metadata: sessionPatch.metadata
          ? { ...(updated.metadata ?? {}), ...sessionPatch.metadata }
          : updated.metadata,
        status: sessionPatch.status ?? updated.status
      };
    }
  }

  await writeImportSession(env, payload.sessionId, updated);
  return updated;
}

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
  const response = await fetch("https://cloudflare-eth.com", {
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

function bigIntToFloat(value: bigint, decimals: number): number {
  if (value === 0n) {
    return 0;
  }
  const negative = value < 0;
  const absValue = negative ? -value : value;
  const base = 10n ** BigInt(decimals);
  const integerPart = absValue / base;
  const fractionalPart = absValue % base;
  const fractionalStr = fractionalPart
    .toString()
    .padStart(decimals, "0")
    .replace(/0+$/, "");
  const integerStr = integerPart.toString();
  const combined = fractionalStr.length ? `${integerStr}.${fractionalStr}` : integerStr;
  const result = Number(combined);
  return negative ? -result : result;
}

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

export async function executePortfolioWrite(
  env: Env,
  input: unknown
): Promise<string> {
  try {
    const { message } = await applyPortfolioWrite(env, input as PortfolioWriteInput);
    return message;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update portfolio.";
    return `Portfolio update failed: ${message}`;
  }
}

export function createServerTools(env: Env) {
  const portfolioRead = tool({
    description: "Fetch the current canonical portfolio snapshot for a user.",
    inputSchema: PortfolioReadInputSchema,
    execute: async ({ userId = DEFAULT_USER_ID }) =>
      readPortfolio(env, userId)
  });

  const portfolioWrite = tool({
    description:
      "Persist portfolio mutations (add/update/remove assets). Requires human approval before execution.",
    inputSchema: PortfolioWriteInputSchema
    // no execute: enforced via human-in-the-loop confirmation
  });

  const importSessionRead = tool({
    description: "Load the current import session state for a given session ID.",
    inputSchema: ImportSessionReadInputSchema,
    execute: async ({ sessionId }) => readImportSession(env, sessionId)
  });

  const importSessionWrite = tool({
    description:
      "Upsert the import session state with staged assets, pending questions, or status updates.",
    inputSchema: ImportSessionWriteInputSchema,
    execute: async (input) => applyImportSessionWrite(env, input)
  });

  const bitcoinBalance = tool({
    description: "Fetch live Bitcoin balance for a wallet address.",
    inputSchema: BalanceInputSchema,
    execute: async ({ address }) => {
      try {
        const quantity = await fetchBitcoinBalance(address);
        return {
          chain: "bitcoin",
          symbol: "BTC",
          quantity,
          status: "ok",
          fetchedAt: new Date().toISOString()
        };
      } catch (error) {
        return {
          chain: "bitcoin",
          symbol: "BTC",
          quantity: 0,
          status: "error",
          message: error instanceof Error ? error.message : "Failed to fetch balance"
        };
      }
    }
  });

  const ethereumBalance = tool({
    description: "Fetch live Ethereum balance for a wallet address.",
    inputSchema: BalanceInputSchema,
    execute: async ({ address }) => {
      try {
        const quantity = await fetchEthereumBalance(address);
        return {
          chain: "ethereum",
          symbol: "ETH",
          quantity,
          status: "ok",
          fetchedAt: new Date().toISOString()
        };
      } catch (error) {
        return {
          chain: "ethereum",
          symbol: "ETH",
          quantity: 0,
          status: "error",
          message: error instanceof Error ? error.message : "Failed to fetch balance"
        };
      }
    }
  });

  const solanaBalance = tool({
    description: "Fetch live Solana balance for a wallet address.",
    inputSchema: BalanceInputSchema,
    execute: async ({ address }) => {
      try {
        const quantity = await fetchSolanaBalance(address);
        return {
          chain: "solana",
          symbol: "SOL",
          quantity,
          status: "ok",
          fetchedAt: new Date().toISOString()
        };
      } catch (error) {
        return {
          chain: "solana",
          symbol: "SOL",
          quantity: 0,
          status: "error",
          message: error instanceof Error ? error.message : "Failed to fetch balance"
        };
      }
    }
  });

  const pricesQuote = tool({
    description:
      "Fetch latest USD quotes for requested symbols (BTC, ETH, SOL, GOLD, USD). Returns 0 when unavailable.",
    inputSchema: PricesQuoteInputSchema,
    execute: async ({ symbols, vsCurrency }) =>
      fetchPrices(symbols, vsCurrency)
  });

  return {
    "tool.portfolio.read": portfolioRead,
    "tool.portfolio.write": portfolioWrite,
    "tool.import-session.read": importSessionRead,
    "tool.import-session.write": importSessionWrite,
    "tool.balance.bitcoin": bitcoinBalance,
    "tool.balance.ethereum": ethereumBalance,
    "tool.balance.solana": solanaBalance,
    "tool.prices.quote": pricesQuote
  };
}

const clientToolMetadata: Record<string, { description: string; inputSchema: z.ZodTypeAny }> = {
  "tool.portfolio.read": {
    description: "Fetch the current canonical portfolio snapshot for a user.",
    inputSchema: PortfolioReadInputSchema
  },
  "tool.portfolio.write": {
    description:
      "Persist portfolio mutations (add/update/remove assets). Requires human approval before execution.",
    inputSchema: PortfolioWriteInputSchema
  },
  "tool.import-session.read": {
    description: "Load the current import session state for a given session ID.",
    inputSchema: ImportSessionReadInputSchema
  },
  "tool.import-session.write": {
    description:
      "Upsert the import session state with staged assets, pending questions, or status updates.",
    inputSchema: ImportSessionWriteInputSchema
  },
  "tool.balance.bitcoin": {
    description: "Fetch live Bitcoin balance for a wallet address.",
    inputSchema: BalanceInputSchema
  },
  "tool.balance.ethereum": {
    description: "Fetch live Ethereum balance for a wallet address.",
    inputSchema: BalanceInputSchema
  },
  "tool.balance.solana": {
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

export type ServerToolSet = ReturnType<typeof createServerTools>;
