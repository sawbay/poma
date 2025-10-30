import { z } from "zod";
import { AddAssetSchema, PortfolioReadInputSchema, PortfolioStateSchema, PortfolioWriteInputSchema, StoredAssetSchema } from "./schema";
import { tool } from "ai";

const DEFAULT_USER_ID = "single-user";

const AgentStateSchema = z.object({
  portfolios: z.record(PortfolioStateSchema).default({})
});

type AgentStateManager = {
  state: PortfolioAgentState | undefined;
  setState(state: PortfolioAgentState): void;
};

export type PortfolioState = z.infer<typeof PortfolioStateSchema>;
export type PortfolioWriteInput = z.infer<typeof PortfolioWriteInputSchema>;
export type PortfolioAgentState = z.infer<typeof AgentStateSchema>;

export function createDefaultAgentState(): PortfolioAgentState {
  return { portfolios: {} };
}

function createEmptyPortfolio(userId: string): PortfolioState {
  return {
    userId,
    updatedAt: new Date(0).toISOString(),
    assets: [],
    metadata: {}
  };
}

function getAgentState(manager: AgentStateManager): PortfolioAgentState {
  return AgentStateSchema.parse(manager.state ?? createDefaultAgentState());
}

async function readPortfolio(manager: AgentStateManager, userId: string): Promise<PortfolioState> {
  const state = getAgentState(manager);
  const stored = state.portfolios[userId];
  if (!stored) {
    return createEmptyPortfolio(userId);
  }
  const parsed = PortfolioStateSchema.parse({
    ...stored,
    userId: stored.userId ?? userId
  });
  const assetsWithSummary = parsed.assets.map((asset) => ({
    ...asset,
    metadata: {
      ...(asset.metadata ?? {}),
      summary: createHoldingSummary(asset)
    }
  }));
  return {
    ...parsed,
    assets: assetsWithSummary
  };
}

async function writePortfolio(
  manager: AgentStateManager,
  userId: string,
  next: PortfolioState
): Promise<void> {
  const state = getAgentState(manager);
  const nextState: PortfolioAgentState = {
    ...state,
    portfolios: {
      ...state.portfolios,
      [userId]: PortfolioStateSchema.parse(next)
    }
  };
  manager.setState(nextState);
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

function createHoldingSummary(asset: z.infer<typeof StoredAssetSchema>) {
  const quantityText =
    asset.quantity !== undefined ? String(asset.quantity) : "unknown";
  const displayUnit = asset.symbol ?? asset.unit ?? "";
  const unitText = displayUnit ? ` ${displayUnit}` : "";
  const chainText = asset.chain ? ` on ${asset.chain}` : "";
  const addressText = asset.address ?? "unknown";
  return `${asset.label} (${asset.category}) - quantity: ${quantityText}${unitText}${chainText}. Address: ${addressText}`;
}


async function applyPortfolioWrite(
  manager: AgentStateManager,
  input: PortfolioWriteInput
): Promise<{ message: string; portfolio: PortfolioState }> {
  const payload = PortfolioWriteInputSchema.parse(input);
  const { userId } = payload;
  const state = await readPortfolio(manager, userId);
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

  await writePortfolio(manager, userId, nextState);

  const enriched = await readPortfolio(manager, userId);

  return {
    message: `Portfolio updated: ${summarizeCounters(counters)}.`,
    portfolio: enriched
  };
}

export function createPortfolioTools(agent: AgentStateManager) {
  return {
    portfolioRead: tool({
      description: "Fetch the current canonical portfolio snapshot for a user.",
      inputSchema: PortfolioReadInputSchema,
      execute: async (input) =>
        readPortfolio(agent, (input as z.infer<typeof PortfolioReadInputSchema>).userId)
    }),
    portfolioWrite: tool({
      description:
        "Persist portfolio mutations (add/update/remove assets). Requires human approval before execution.",
      inputSchema: PortfolioWriteInputSchema
    })
  };
}

export async function executePortfolioWrite(
  manager: AgentStateManager,
  input: unknown
): Promise<string> {
  try {
    const { message } = await applyPortfolioWrite(manager, input as PortfolioWriteInput);
    return message;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update portfolio.";
    return `Portfolio update failed: ${message}`;
  }
}
