import { getBlockchainBalance } from "./balances";
import { getCachedPrices } from "./pricing";
import { loadPortfolio } from "./portfolio";
import type { AssetView, PortfolioAsset, PortfolioSummary, TotalsBreakdown } from "./types";

export async function buildPortfolioSummary(kv: KVNamespace): Promise<PortfolioSummary> {
	const [portfolio, prices] = await Promise.all([loadPortfolio(kv), getCachedPrices(kv)]);

	const assets = await Promise.all(
		portfolio.assets.map(async (asset) => buildAssetView(asset, prices)),
	);
	const totals = computeTotals(assets);

	return {
		updatedAt: portfolio.updatedAt,
		assets,
		totals,
		prices,
	};
}

async function buildAssetView(
	asset: PortfolioAsset,
	prices: Record<string, number>,
): Promise<AssetView> {
	if (asset.category === "blockchain") {
		const balance = await getBlockchainBalance(asset);
		const usdPrice = prices[balance.symbol] ?? 0;
		const usdValue = balance.quantity * usdPrice;
		return {
			id: asset.id,
			label: asset.label,
			category: asset.category,
			chain: asset.chain,
			address: asset.address,
			quantity: balance.quantity,
			usdPrice,
			usdValue,
			status: balance.status,
			message: balance.message,
		};
	}

	const usdPrice = prices[asset.symbol] ?? (asset.symbol === "USD" ? 1 : 0);
	const usdValue = asset.quantity * usdPrice;
	return {
		id: asset.id,
		label: asset.label,
		category: asset.category,
		symbol: asset.symbol,
		quantity: asset.quantity,
		usdPrice,
		usdValue,
		status: usdPrice > 0 || asset.symbol === "USD" ? "ok" : "error",
		message: usdPrice > 0 ? undefined : "Price unavailable",
	};
}

function computeTotals(assets: AssetView[]): TotalsBreakdown {
	const totals: TotalsBreakdown = {
		usd: 0,
		byCategory: {
			blockchain: 0,
			physical: 0,
		},
	};

	for (const asset of assets) {
		totals.usd += asset.usdValue;
		totals.byCategory[asset.category] += asset.usdValue;
	}

	return totals;
}
