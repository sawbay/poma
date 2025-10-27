import type { PriceSnapshot } from "./types";

export type PriceMap = Record<string, number>;

const PRICE_CACHE_KEY = "prices:latest";
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export async function getCachedPrices(kv: KVNamespace): Promise<PriceMap> {
	const cached = await kv.get<PriceSnapshot>(PRICE_CACHE_KEY, "json");
	const now = Date.now();

	if (cached && now - cached.timestamp < ONE_DAY_MS) {
		return cached.prices;
	}

	return refreshPrices(kv);
}

export async function refreshPrices(kv: KVNamespace): Promise<PriceMap> {
	const prices = await fetchFreshPrices();
	const snapshot: PriceSnapshot = {
		timestamp: Date.now(),
		prices,
	};
	await kv.put(PRICE_CACHE_KEY, JSON.stringify(snapshot));
	return prices;
}

async function fetchFreshPrices(): Promise<PriceMap> {
	const [cryptoResult, goldResult] = await Promise.allSettled([
		getCryptoPrices(),
		getGoldPrice(),
	]);

	const prices: PriceMap = {
		BTC: 0,
		ETH: 0,
		SOL: 0,
		GOLD: 0,
		USD: 1,
	};

	if (cryptoResult.status === "fulfilled") {
		Object.assign(prices, cryptoResult.value);
	}

	if (goldResult.status === "fulfilled") {
		prices.GOLD = goldResult.value;
	}

	return prices;
}

async function getCryptoPrices(): Promise<PriceMap> {
	const url =
		"https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd";
	const response = await fetch(url, { cf: { cacheEverything: true, cacheTtl: 1800 } });
	if (!response.ok) {
		throw new Error(`Failed to fetch crypto prices (${response.status})`);
	}

	const payload = (await response.json()) as Record<string, { usd?: number }>;
	return {
		BTC: payload.bitcoin?.usd ?? 0,
		ETH: payload.ethereum?.usd ?? 0,
		SOL: payload.solana?.usd ?? 0,
	};
}

async function getGoldPrice(): Promise<number> {
	const response = await fetch("https://data-asg.goldprice.org/dbXRates/USD", {
		cf: { cacheEverything: true, cacheTtl: 1800 },
	});
	if (!response.ok) {
		throw new Error(`Failed to fetch gold price (${response.status})`);
	}

	const payload = (await response.json()) as { items?: Array<Record<string, number>> };
	const price = payload.items?.[0]?.xauPrice ?? payload.items?.[0]?.xauPriceGram24k;
	if (!price) {
		throw new Error("Unexpected gold price response");
	}
	return price;
}
