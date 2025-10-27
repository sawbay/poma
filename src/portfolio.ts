import type {
	BlockchainAsset,
	Chain,
	PhysicalAsset,
	PhysicalSymbol,
	PortfolioAsset,
	PortfolioData,
} from "./types";

const STORAGE_KEY = "portfolio:single-user";

export async function loadPortfolio(kv: KVNamespace): Promise<PortfolioData> {
	const stored = await kv.get<PortfolioData>(STORAGE_KEY, "json");
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

export async function savePortfolio(kv: KVNamespace, data: PortfolioData): Promise<void> {
	const payload: PortfolioData = {
		...data,
		updatedAt: new Date().toISOString(),
	};
	await kv.put(STORAGE_KEY, JSON.stringify(payload));
}

export function createBlockchainAsset(input: {
	label: string;
	chain: Chain;
	address: string;
}): BlockchainAsset {
	return {
		id: crypto.randomUUID(),
		label: input.label,
		category: "blockchain",
		chain: input.chain,
		address: input.address,
		createdAt: new Date().toISOString(),
	};
}

export function createPhysicalAsset(input: {
	label: string;
	symbol: PhysicalSymbol;
	quantity: number;
}): PhysicalAsset {
	return {
		id: crypto.randomUUID(),
		label: input.label,
		category: "physical",
		symbol: input.symbol,
		quantity: input.quantity,
		createdAt: new Date().toISOString(),
	};
}

export function findAssetByIdentifier(
	assets: PortfolioAsset[],
	identifier: string,
): PortfolioAsset | undefined {
	const query = identifier.trim().toLowerCase();
	return assets.find((asset) => {
		if (asset.id.toLowerCase() === query) {
			return true;
		}
		if (asset.label.trim().toLowerCase() === query) {
			return true;
		}
		if (asset.category === "blockchain") {
			return asset.address.trim().toLowerCase() === query;
		}
		if (asset.category === "physical") {
			return asset.symbol.toLowerCase() === query;
		}
		return false;
	});
}
