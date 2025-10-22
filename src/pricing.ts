import { PriceSnapshot } from "./types";

const PRICE_CACHE_KEY = "price:latest";
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export type PriceMap = Record<string, number>;

export async function getCachedPrices(kv: KVNamespace): Promise<PriceMap> {
	const cached = await kv.get<PriceSnapshot>(PRICE_CACHE_KEY, "json");
	const now = Date.now();

	if (cached && now - cached.timestamp < ONE_DAY_MS) {
		return cached.prices;
	}

	const prices = await fetchFreshPrices();
	const snapshot: PriceSnapshot = {
		timestamp: now,
		prices,
	};
	await kv.put(PRICE_CACHE_KEY, JSON.stringify(snapshot));
	return prices;
}

async function fetchFreshPrices(): Promise<PriceMap> {
	const [crypto, gold] = await Promise.allSettled([getCryptoPrices(), getGoldPrice()]);

	const prices: PriceMap = {
		BTC: 0,
		ETH: 0,
		SOL: 0,
		GOLD: 0,
		USD: 1,
	};

	if (crypto.status === "fulfilled") {
		Object.assign(prices, crypto.value);
	}

	if (gold.status === "fulfilled") {
		prices.GOLD = gold.value;
	}

	return prices;
}

async function getCryptoPrices(): Promise<PriceMap> {
	const url =
		"https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd";
	const resp = await fetch(url, { cf: { cacheEverything: true, cacheTtl: 3600 } });
	if (!resp.ok) {
		throw new Error(`Failed to load crypto prices (${resp.status})`);
	}

	const data = (await resp.json()) as Record<string, { usd?: number }>;
	return {
		BTC: data.bitcoin?.usd ?? 0,
		ETH: data.ethereum?.usd ?? 0,
		SOL: data.solana?.usd ?? 0,
	};
}

async function getGoldPrice(): Promise<number> {
	const resp = await fetch("https://data-asg.goldprice.org/dbXRates/USD", {
		cf: { cacheEverything: true, cacheTtl: 3600 },
	});
	if (!resp.ok) {
		throw new Error(`Failed to load gold price (${resp.status})`);
	}

	const data = (await resp.json()) as { items?: Array<Record<string, number>> };
	const price = data.items?.[0]?.xauPrice ?? data.items?.[0]?.xauPriceGram24k;
	if (!price) {
		throw new Error("Unexpected gold price payload");
	}

	return price;
}
