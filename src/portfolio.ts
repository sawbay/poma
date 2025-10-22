import {
	BlockchainAsset,
	Chain,
	PhysicalAsset,
	PhysicalSymbol,
	PortfolioAsset,
	PortfolioData,
} from "./types";

const PORTFOLIO_STORAGE_KEY = "portfolio:default";

export async function loadPortfolio(kv: KVNamespace): Promise<PortfolioData> {
	const stored = await kv.get<PortfolioData>(PORTFOLIO_STORAGE_KEY, "json");
	if (stored && Array.isArray(stored.assets)) {
		return stored;
	}

	const empty: PortfolioData = {
		assets: [],
		updatedAt: new Date().toISOString(),
	};
	await savePortfolio(kv, empty);
	return empty;
}

export async function savePortfolio(kv: KVNamespace, portfolio: PortfolioData): Promise<void> {
	const value: PortfolioData = {
		...portfolio,
		updatedAt: new Date().toISOString(),
	};
	await kv.put(PORTFOLIO_STORAGE_KEY, JSON.stringify(value));
}

export function createBlockchainAsset(params: {
	label: string;
	chain: Chain;
	address: string;
}): BlockchainAsset {
	return {
		id: crypto.randomUUID(),
		label: params.label,
		category: "blockchain",
		chain: params.chain,
		address: params.address,
		createdAt: new Date().toISOString(),
	};
}

export function createPhysicalAsset(params: {
	label: string;
	symbol: PhysicalSymbol;
	quantity: number;
}): PhysicalAsset {
	return {
		id: crypto.randomUUID(),
		label: params.label,
		category: "physical",
		symbol: params.symbol,
		quantity: params.quantity,
		createdAt: new Date().toISOString(),
	};
}

export function findAssetByIdentifier(
	assets: PortfolioAsset[],
	identifier: string,
): PortfolioAsset | undefined {
	const normalized = identifier.trim().toLowerCase();
	return assets.find((asset) => {
		if (asset.id.toLowerCase() === normalized) {
			return true;
		}
		if (asset.label.trim().toLowerCase() === normalized) {
			return true;
		}
		if (asset.category === "blockchain") {
			return asset.address.trim().toLowerCase() === normalized;
		}
		if (asset.category === "physical") {
			return asset.symbol.toLowerCase() === normalized;
		}
		return false;
	});
}
