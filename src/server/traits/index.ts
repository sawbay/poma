import { z } from "zod";
import { PriceProviderRegistry, type PriceProvider } from "./providers";

export type TraitType = "AMOUNT" | "UNIT" | "PRICE_FEED";

export type AssetRecord = {
  id: string;
  assetType: string;
  meta?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
};

export type TraitRecord<TProps = unknown> = {
  id: string;
  assetId: string;
  traitType: TraitType;
  traitProps: TProps;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type TraitHandlerContext = {
  now?: Date;
  historyLimit?: number;
  providers?: PriceProviderRegistry;
};

export interface TraitHandler<TProps = unknown> {
  validate(trait: TraitRecord<TProps>): void;
  process?(trait: TraitRecord<TProps>, ctx: TraitHandlerContext): Promise<TraitRecord<TProps>> | TraitRecord<TProps>;
}

export class TraitRegistry {
  private readonly handlers = new Map<TraitType, TraitHandler>();

  register<TProps>(traitType: TraitType, handler: TraitHandler<TProps>): void {
    this.handlers.set(traitType, handler as TraitHandler);
  }

  get(traitType: TraitType): TraitHandler | undefined {
    return this.handlers.get(traitType);
  }
}

export type AmountTraitProps = {
  value: number;
};

export type UnitTraitProps = {
  unit: string;
};

const QuoteStatusSchema = z.enum(["ok", "error", "stale"]);

export type QuoteStatus = z.infer<typeof QuoteStatusSchema>;

export type PriceSourceConfig = {
  provider_key: string;
  series_key: string;
  quote_currency: string;
  refresh_interval_sec?: number;
  stale_after_sec?: number;
};

export type PriceQuoteSnapshot = {
  price: number;
  currency: string;
  as_of: string;
  status: QuoteStatus;
  meta?: Record<string, unknown>;
};

export type PriceFeedTraitProps = {
  source: PriceSourceConfig;
  latest?: PriceQuoteSnapshot;
  history?: PriceQuoteSnapshot[];
};

const AmountSchema = z.object({
  value: z.number()
});

const UnitSchema = z.object({
  unit: z.string().min(1)
});

const PriceQuoteSchema = z.object({
  price: z.number(),
  currency: z.string(),
  as_of: z.string(),
  status: QuoteStatusSchema,
  meta: z.record(z.unknown()).optional()
});

const PriceFeedPropsSchema = z.object({
  source: z.object({
    provider_key: z.string().min(1),
    series_key: z.string().min(1),
    quote_currency: z.string().min(1),
    refresh_interval_sec: z.number().int().positive().optional(),
    stale_after_sec: z.number().int().positive().optional()
  }),
  latest: PriceQuoteSchema.optional(),
  history: z.array(PriceQuoteSchema).optional()
});

class PassthroughTraitHandler<TProps> implements TraitHandler<TProps> {
  constructor(private readonly schema: z.ZodSchema<TProps>) {}

  validate(trait: TraitRecord<TProps>): void {
    this.schema.parse(trait.traitProps);
  }
}

class PriceFeedTraitHandler implements TraitHandler<PriceFeedTraitProps> {
  constructor(private readonly providers: PriceProviderRegistry) {}

  validate(trait: TraitRecord<PriceFeedTraitProps>): void {
    PriceFeedPropsSchema.parse(trait.traitProps);
  }

  async process(
    trait: TraitRecord<PriceFeedTraitProps>,
    ctx: TraitHandlerContext
  ): Promise<TraitRecord<PriceFeedTraitProps>> {
    const parsed = PriceFeedPropsSchema.parse(trait.traitProps);
    let provider: PriceProvider;
    try {
      provider = this.providers.require(parsed.source.provider_key);
    } catch (error) {
      return this.toErrorTrait(trait, parsed, error, ctx);
    }
    const now = ctx.now ?? new Date();

    let latest: PriceQuoteSnapshot;
    const previousLatest = parsed.latest;

    try {
      const quote = await provider.getQuote({
        seriesKey: parsed.source.series_key,
        quoteCurrency: parsed.source.quote_currency,
        asOf: now.toISOString()
      });

      const asOf = quote.asOf ?? now.toISOString();
      const status = this.computeStatus(
        asOf,
        parsed.source.stale_after_sec,
        now
      );

      latest = {
        price: quote.price,
        currency: quote.currency,
        as_of: asOf,
        status,
        meta: quote.meta ?? {}
      };
    } catch (error) {
      return this.toErrorTrait(trait, parsed, error, ctx);
    }

    const history = this.updateHistory(
      parsed.history ?? [],
      previousLatest,
      ctx.historyLimit ?? 10
    );

    return {
      ...trait,
      traitProps: {
        ...parsed,
        latest,
        history
      }
    };
  }

  private computeStatus(
    asOf: string,
    staleAfterSec: number | undefined,
    now: Date
  ): QuoteStatus {
    if (!staleAfterSec) {
      return "ok";
    }

    const asOfDate = new Date(asOf);
    const diffMs = now.getTime() - asOfDate.getTime();
    if (Number.isNaN(diffMs)) {
      return "error";
    }

    return diffMs > staleAfterSec * 1000 ? "stale" : "ok";
  }

  private updateHistory(
    history: PriceQuoteSnapshot[],
    previousLatest: PriceQuoteSnapshot | undefined,
    limit: number
  ): PriceQuoteSnapshot[] {
    if (!previousLatest) {
      return history.slice(0, limit);
    }

    const nextHistory = [previousLatest, ...history];
    return nextHistory.slice(0, Math.max(limit, 0));
  }

  private toErrorTrait(
    trait: TraitRecord<PriceFeedTraitProps>,
    parsed: PriceFeedTraitProps,
    error: unknown,
    ctx: TraitHandlerContext
  ): TraitRecord<PriceFeedTraitProps> {
    const now = ctx.now ?? new Date();
    const previousLatest = parsed.latest;
    const message = error instanceof Error ? error.message : String(error);
    const previousMeta = previousLatest?.meta ?? {};

    const latest: PriceQuoteSnapshot = {
      price: previousLatest?.price ?? 0,
      currency: parsed.source.quote_currency,
      as_of: now.toISOString(),
      status: "error",
      meta: { ...previousMeta, error: message }
    };

    const history = this.updateHistory(
      parsed.history ?? [],
      previousLatest,
      ctx.historyLimit ?? 10
    );

    return {
      ...trait,
      traitProps: {
        ...parsed,
        latest,
        history
      }
    };
  }
}

export function createDefaultTraitRegistry(
  providers: PriceProviderRegistry
): TraitRegistry {
  const registry = new TraitRegistry();
  registry.register("AMOUNT", new PassthroughTraitHandler<AmountTraitProps>(AmountSchema));
  registry.register("UNIT", new PassthroughTraitHandler<UnitTraitProps>(UnitSchema));
  registry.register("PRICE_FEED", new PriceFeedTraitHandler(providers));
  return registry;
}

export async function processAssetTraits(
  traits: TraitRecord[],
  registry: TraitRegistry,
  ctx: TraitHandlerContext
): Promise<TraitRecord[]> {
  const updated: TraitRecord[] = [];
  for (const trait of traits) {
    const handler = registry.get(trait.traitType);
    if (!handler) {
      updated.push(trait);
      continue;
    }

    handler.validate(trait);
    if (handler.process) {
      const next = await handler.process(trait as never, ctx);
      updated.push(next);
    } else {
      updated.push(trait);
    }
  }

  return updated;
}

export { PriceProviderRegistry, type PriceProvider };
