import type { BlockchainAsset } from "./types";

export interface BalanceResult {
	symbol: string;
	quantity: number;
	status: "ok" | "error";
	message?: string;
}

export async function getBlockchainBalance(asset: BlockchainAsset): Promise<BalanceResult> {
	try {
		switch (asset.chain) {
			case "bitcoin":
				return await getBitcoinBalance(asset.address);
			case "ethereum":
				return await getEthereumBalance(asset.address);
			case "solana":
				return await getSolanaBalance(asset.address);
			default:
				return {
					symbol: asset.chain.toUpperCase(),
					quantity: 0,
					status: "error",
					message: "Unsupported chain",
				};
		}
	} catch (error) {
		return {
			symbol: asset.chain.toUpperCase(),
			quantity: 0,
			status: "error",
			message: error instanceof Error ? error.message : "Balance lookup failed",
		};
	}
}

async function getBitcoinBalance(address: string): Promise<BalanceResult> {
	const url = `https://blockchain.info/rawaddr/${encodeURIComponent(address)}?limit=0&cors=true`;
	const response = await fetch(url, { cf: { cacheTtl: 300 } });
	if (!response.ok) {
		throw new Error(`HTTP ${response.status} from blockchain.info`);
	}

	const payload = (await response.json()) as { final_balance?: number };
	const satoshis = payload.final_balance ?? 0;
	return {
		symbol: "BTC",
		quantity: satoshis / 1e8,
		status: "ok",
	};
}

async function getEthereumBalance(address: string): Promise<BalanceResult> {
	const response = await fetch("https://cloudflare-eth.com", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			jsonrpc: "2.0",
			id: 1,
			method: "eth_getBalance",
			params: [address, "latest"],
		}),
	});
	if (!response.ok) {
		throw new Error(`HTTP ${response.status} from Cloudflare ETH`);
	}

	const payload = (await response.json()) as { result?: string; error?: { message?: string } };
	if (payload.error) {
		throw new Error(payload.error.message ?? "Ethereum RPC error");
	}

	const wei = payload.result ? BigInt(payload.result) : 0n;
	return {
		symbol: "ETH",
		quantity: bigIntToFloat(wei, 18),
		status: "ok",
	};
}

async function getSolanaBalance(address: string): Promise<BalanceResult> {
	const response = await fetch("https://api.mainnet-beta.solana.com", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			jsonrpc: "2.0",
			id: 1,
			method: "getBalance",
			params: [address],
		}),
	});
	if (!response.ok) {
		throw new Error(`HTTP ${response.status} from Solana RPC`);
	}

	const payload = (await response.json()) as { result?: { value?: number }; error?: { message?: string } };
	if (payload.error) {
		throw new Error(payload.error.message ?? "Solana RPC error");
	}

	const lamports = payload.result?.value ?? 0;
	return {
		symbol: "SOL",
		quantity: lamports / 1e9,
		status: "ok",
	};
}

function bigIntToFloat(value: bigint, decimals: number): number {
	if (value === 0n) {
		return 0;
	}
	const negative = value < 0;
	const absValue = negative ? -value : value;
	const base = 10n ** BigInt(decimals);
	const integerPart = absValue / base;
	const fractionalPart = absValue % base;
	const fractionalStr = fractionalPart.toString().padStart(decimals, "0").replace(/0+$/, "");
	const integerStr = integerPart.toString();
	const combined = fractionalStr.length ? `${integerStr}.${fractionalStr}` : integerStr;
	const result = Number(combined);
	return negative ? -result : result;
}
