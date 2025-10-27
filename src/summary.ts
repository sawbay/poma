import { getBlockchainBalance } from "./balances";
import { loadPortfolio } from "./portfolio";
import type { AssetView, PortfolioAsset, PortfolioSummary, TotalsBreakdown } from "./types";

export async function buildPortfolioSummary(kv: KVNamespace): Promise<PortfolioSummary> {
	const portfolio = await loadPortfolio(kv);

	const assets = await Promise.all(
		portfolio.assets.map(async (asset) => buildAssetView(asset)),
	);
	const totals = computeTotals(assets);

	return {
		updatedAt: portfolio.updatedAt,
		assets,
		totals,
		prices: {},
	};
}

async function buildAssetView(asset: PortfolioAsset): Promise<AssetView> {
	if (asset.category === "blockchain") {
		const balance = await getBlockchainBalance(asset);
		return {
			id: asset.id,
			label: asset.label,
			category: asset.category,
			chain: asset.chain,
			address: asset.address,
			quantity: balance.quantity,
			usdPrice: 0,
			usdValue: 0,
			status: balance.status,
			message: balance.message,
		};
	}

	const usdPrice = asset.symbol === "USD" ? 1 : 0;
	const usdValue = asset.symbol === "USD" ? asset.quantity : 0;
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
