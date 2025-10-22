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
			message: error instanceof Error ? error.message : "Unknown balance error",
		};
	}
}

async function getBitcoinBalance(address: string): Promise<BalanceResult> {
	const url = `https://blockchain.info/rawaddr/${encodeURIComponent(address)}?limit=0&cors=true`;
	const resp = await fetch(url, { cf: { cacheTtl: 300 } });
	if (!resp.ok) {
		throw new Error(`HTTP ${resp.status} fetching BTC balance`);
	}

	const data = (await resp.json()) as { final_balance?: number };
	const satoshis = data.final_balance ?? 0;
	return {
		symbol: "BTC",
		quantity: satoshis / 1e8,
		status: "ok",
	};
}

async function getEthereumBalance(address: string): Promise<BalanceResult> {
	const resp = await fetch("https://cloudflare-eth.com", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			jsonrpc: "2.0",
			id: 1,
			method: "eth_getBalance",
			params: [address, "latest"],
		}),
	});

	if (!resp.ok) {
		throw new Error(`HTTP ${resp.status} fetching ETH balance`);
	}

	const json = (await resp.json()) as { result?: string; error?: { message?: string } };
	if (json.error) {
		throw new Error(json.error.message ?? "Ethereum RPC error");
	}

	const wei = json.result ? BigInt(json.result) : 0n;
	const quantity = bigIntToFloat(wei, 18);
	return {
		symbol: "ETH",
		quantity,
		status: "ok",
	};
}

async function getSolanaBalance(address: string): Promise<BalanceResult> {
	const resp = await fetch("https://api.mainnet-beta.solana.com", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			jsonrpc: "2.0",
			id: 1,
			method: "getBalance",
			params: [address],
		}),
	});

	if (!resp.ok) {
		throw new Error(`HTTP ${resp.status} fetching SOL balance`);
	}

	const json = (await resp.json()) as { result?: { value?: number }; error?: { message?: string } };
	if (json.error) {
		throw new Error(json.error.message ?? "Solana RPC error");
	}

	const lamports = json.result?.value ?? 0;
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
