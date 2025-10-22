export type Chain = "bitcoin" | "ethereum" | "solana";

export type PhysicalSymbol = "GOLD" | "USD";

export interface BlockchainAsset {
	id: string;
	label: string;
	category: "blockchain";
	chain: Chain;
	address: string;
	createdAt: string;
}

export interface PhysicalAsset {
	id: string;
	label: string;
	category: "physical";
	symbol: PhysicalSymbol;
	quantity: number;
	createdAt: string;
}

export type PortfolioAsset = BlockchainAsset | PhysicalAsset;

export interface PortfolioData {
	assets: PortfolioAsset[];
	updatedAt: string;
}

export interface AssetValuation {
	asset: PortfolioAsset;
	quantity: number;
	usdPrice: number;
	usdValue: number;
	status: "ok" | "error";
	message?: string;
}

export interface PriceSnapshot {
	timestamp: number;
	prices: Record<string, number>;
}

export interface ChatMessage {
	role: "user" | "assistant";
	content: string;
}

export interface AssetView {
	id: string;
	label: string;
	category: PortfolioAsset["category"];
	chain?: Chain;
	address?: string;
	symbol?: PhysicalSymbol;
	quantity: number;
	usdPrice: number;
	usdValue: number;
	status: "ok" | "error";
	message?: string;
}

export interface TotalsBreakdown {
	usd: number;
	byCategory: Record<PortfolioAsset["category"], number>;
}

export interface PortfolioSummary {
	updatedAt: string;
	assets: AssetView[];
	totals: TotalsBreakdown;
	prices: Record<string, number>;
}
