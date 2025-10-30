import { z } from "zod";

const DEFAULT_USER_ID = "single-user";

const ChainSchema = z.enum(["bitcoin", "ethereum", "solana"]);
const AssetCategorySchema = z.enum(["blockchain", "physical", "stock"]);
const CustodySchema = z.enum(["self_custody", "exchange", "unknown"]).optional();

export const BaseAssetSchema = z.object({
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

export const StoredAssetSchema = BaseAssetSchema.extend({
  id: z.string()
});

export const PortfolioStateSchema = z.object({
  userId: z.string(),
  updatedAt: z.string(),
  assets: z.array(StoredAssetSchema),
  metadata: z.record(z.unknown()).optional()
});

export const PortfolioReadInputSchema = z.object({
  userId: z.string().default(DEFAULT_USER_ID)
});

export const AddAssetSchema = BaseAssetSchema.extend({
  category: AssetCategorySchema,
  label: z.string()
});

export const UpdatePatchSchema = BaseAssetSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "Update patch must include at least one field"
);

export const PortfolioWriteOperationSchema = z.discriminatedUnion("type", [
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

export const PricesQuoteInputSchema = z.object({
  symbols: z.array(z.string()).min(1),
  vsCurrency: z.string().default("USD")
});

export const BalanceInputSchema = z.object({
  address: z.string().min(1, "Wallet address is required")
});

export const AgentStateSchema = z.object({
  portfolios: z.record(PortfolioStateSchema).default({})
});
