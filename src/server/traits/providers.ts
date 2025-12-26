export type PriceQuoteRequest = {
  seriesKey: string;
  quoteCurrency: string;
  asOf?: string;
};

export type PriceQuoteResponse = {
  price: number;
  currency: string;
  asOf?: string;
  meta?: Record<string, unknown>;
};

export interface PriceProvider {
  getQuote(request: PriceQuoteRequest): Promise<PriceQuoteResponse>;
}

export class PriceProviderRegistry {
  private readonly providers = new Map<string, PriceProvider>();

  register(key: string, provider: PriceProvider): void {
    this.providers.set(key, provider);
  }

  has(key: string): boolean {
    return this.providers.has(key);
  }

  get(key: string): PriceProvider | undefined {
    return this.providers.get(key);
  }

  require(key: string): PriceProvider {
    const provider = this.get(key);
    if (!provider) {
      throw new Error(`Provider not found for key: ${key}`);
    }
    return provider;
  }
}
