import type { Ai } from "@cloudflare/workers-types";
import {
	createBlockchainAsset,
	createPhysicalAsset,
	findAssetByIdentifier,
	loadPortfolio,
	savePortfolio,
} from "./portfolio";
import type {
	Chain,
	ChatMessage,
	PhysicalSymbol,
	PortfolioAsset,
	PortfolioData,
} from "./types";

const SUPPORTED_CHAINS: Chain[] = ["bitcoin", "ethereum", "solana"];
const SUPPORTED_PHYSICAL: PhysicalSymbol[] = ["GOLD", "USD"];

export interface ChatOperation {
	type: "add" | "remove" | "update";
	target?: string;
	address?: string;
	quantity?: number;
	label?: string;
	identifier?: string;
}

export interface ChatResult {
	reply: string;
	operations: OperationOutcome[];
	portfolio: PortfolioData;
}

export interface OperationOutcome {
	action: string;
	status: "applied" | "skipped";
	detail: string;
}

export async function handleChatRequest(
	ai: Ai,
	kv: KVNamespace,
	messages: ChatMessage[],
): Promise<ChatResult> {
	const portfolio = await loadPortfolio(kv);
	const aiResponse = await runPlanner(ai, portfolio, messages);
	const operations = Array.isArray(aiResponse.operations) ? aiResponse.operations : [];

	const outcomes: OperationOutcome[] = [];
	let mutated = false;
	const assets = [...portfolio.assets];

	for (const op of operations) {
		const outcome = applyOperation(assets, op);
		outcomes.push(outcome);
		if (outcome.status === "applied") {
			mutated = true;
		}
	}

	if (mutated) {
		await savePortfolio(kv, { assets, updatedAt: new Date().toISOString() });
	}

	return {
		reply: aiResponse.reply ?? "Let me know how else I can help with your portfolio.",
		operations: outcomes,
		portfolio: mutated ? await loadPortfolio(kv) : portfolio,
	};
}

interface PlannerResponse {
	reply?: string;
	operations?: ChatOperation[];
}

async function runPlanner(
	ai: Ai,
	portfolio: PortfolioData,
	messages: ChatMessage[],
): Promise<PlannerResponse> {
	const systemPrompt = `You help users manage a personal investment portfolio that contains blockchain
addresses (bitcoin, ethereum, solana) and physical assets (gold, US dollars).

Return a minified JSON object with properties:
- reply: short natural language answer to the user.
- operations: array of actions to apply.

Every operation object MUST have:
- type: "add", "remove", or "update".
- For type "add":
  - target: one of "bitcoin", "ethereum", "solana", "gold", "usd".
  - address: required when the target is a blockchain asset.
  - quantity: required when the target is a physical asset.
  - label: optional friendly name.
- For type "remove":
  - identifier: required. May be an asset id, label, or address/symbol.
- For type "update":
  - identifier: required.
  - label: optional new label.
  - quantity: optional (only valid for physical assets).
  - address: optional new address (only valid for blockchain assets).

Never include explanatory text outside JSON.
Match multiple operations when the user lists several instructions.
Preserve numeric values as numbers, not strings.
When unsure about an address or quantity, omit the operation entirely.`;

	const conversation = [
		{ role: "system", content: systemPrompt },
		{
			role: "user",
			content: `Current portfolio snapshot: ${JSON.stringify(portfolio.assets, null, 2)}`,
		},
		...messages.map((message) => ({
			role: message.role,
			content: message.content,
		})),
	];

	const raw = (await ai.run("@cf/meta/llama-3-8b-instruct", {
		messages: conversation,
	})) as unknown;

	const text = extractText(raw);
	return parsePlannerResponse(text);
}

function extractText(raw: unknown): string {
	if (typeof raw === "string") {
		return raw;
	}
	if (raw && typeof raw === "object" && "response" in raw && typeof (raw as Record<string, unknown>).response === "string") {
		return (raw as Record<string, string>).response;
	}
	return JSON.stringify(raw);
}

function parsePlannerResponse(text: string): PlannerResponse {
	const jsonText = extractJson(text);
	try {
		const parsed = JSON.parse(jsonText) as PlannerResponse;
		const operations = Array.isArray(parsed.operations)
			? parsed.operations.filter(validateOperationShape)
			: [];
		return {
			reply: typeof parsed.reply === "string" ? parsed.reply : undefined,
			operations,
		};
	} catch (error) {
		return {
			reply:
				"Sorry, I couldn't understand that request. Please restate how you'd like to adjust the portfolio.",
			operations: [],
		};
	}
}

function validateOperationShape(operation: ChatOperation): operation is ChatOperation {
	if (!operation || typeof operation !== "object") {
		return false;
	}
	if (operation.type === "add") {
		if (typeof operation.target !== "string") {
			return false;
		}
		const normalized = operation.target.toLowerCase();
		if (["bitcoin", "ethereum", "solana"].includes(normalized)) {
			return typeof operation.address === "string" && operation.address.length > 0;
		}
		if (["gold", "usd"].includes(normalized)) {
			return typeof operation.quantity === "number" && Number.isFinite(operation.quantity);
		}
		return false;
	}

	if (operation.type === "remove" || operation.type === "update") {
		return typeof operation.identifier === "string" && operation.identifier.trim().length > 0;
	}

	return false;
}

function extractJson(text: string): string {
	const trimmed = text.trim();
	if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
		return trimmed;
	}

	const match = trimmed.match(/```json([^]*?)```/);
	if (match) {
		return match[1].trim();
	}
	return trimmed;
}

function applyOperation(assets: PortfolioAsset[], operation: ChatOperation): OperationOutcome {
	switch (operation.type) {
		case "add":
			return applyAddOperation(assets, operation);
		case "remove":
			return applyRemoveOperation(assets, operation.identifier!);
		case "update":
			return applyUpdateOperation(assets, operation);
		default:
			return {
				action: "unknown",
				status: "skipped",
				detail: "Unsupported operation type",
			};
	}
}

function applyAddOperation(assets: PortfolioAsset[], operation: ChatOperation): OperationOutcome {
	const target = operation.target?.toLowerCase();
	if (!target) {
		return { action: "add", status: "skipped", detail: "Missing target for add operation" };
	}

	if ((SUPPORTED_CHAINS as string[]).includes(target)) {
		const chain = target as Chain;
		const address = operation.address?.trim();
		if (!address) {
			return { action: "add", status: "skipped", detail: `Missing address for ${chain}` };
		}
		const label = operation.label?.trim() || `${chain.toUpperCase()} ${address.slice(-4)}`;
		assets.push(createBlockchainAsset({ label, chain, address }));
		return {
			action: `add-${chain}`,
			status: "applied",
			detail: `Added ${label} (${address})`,
		};
	}

	if ((SUPPORTED_PHYSICAL as string[]).includes(target.toUpperCase())) {
		const symbol = target.toUpperCase() as PhysicalSymbol;
		const quantity = Number(operation.quantity ?? 0);
		if (!Number.isFinite(quantity) || quantity <= 0) {
			return {
				action: "add-physical",
				status: "skipped",
				detail: `Invalid quantity for ${symbol}`,
			};
		}
		const label = operation.label?.trim() || symbol;
		assets.push(createPhysicalAsset({ label, symbol, quantity }));
		return {
			action: `add-${symbol.toLowerCase()}`,
			status: "applied",
			detail: `Added ${label} with ${quantity} units`,
		};
	}

	return {
		action: "add",
		status: "skipped",
		detail: `Unsupported target ${operation.target}`,
	};
}

function applyRemoveOperation(assets: PortfolioAsset[], identifier: string): OperationOutcome {
	const asset = findAssetByIdentifier(assets, identifier);
	if (!asset) {
		return {
			action: "remove",
			status: "skipped",
			detail: `No asset found matching "${identifier}"`,
		};
	}

	const index = assets.indexOf(asset);
	assets.splice(index, 1);
	return {
		action: "remove",
		status: "applied",
		detail: `Removed ${asset.label}`,
	};
}

function applyUpdateOperation(assets: PortfolioAsset[], operation: ChatOperation): OperationOutcome {
	const targetAsset = findAssetByIdentifier(assets, operation.identifier!);
	if (!targetAsset) {
		return {
			action: "update",
			status: "skipped",
			detail: `No asset found matching "${operation.identifier}"`,
		};
	}

	const updates: string[] = [];

	if (typeof operation.label === "string" && operation.label.trim().length > 0) {
		targetAsset.label = operation.label.trim();
		updates.push(`label -> ${targetAsset.label}`);
	}

	if (targetAsset.category === "physical" && typeof operation.quantity === "number") {
		if (Number.isFinite(operation.quantity) && operation.quantity >= 0) {
			targetAsset.quantity = operation.quantity;
			updates.push(`quantity -> ${operation.quantity}`);
		} else {
			return {
				action: "update",
				status: "skipped",
				detail: "Quantity must be a non-negative number",
			};
		}
	}

	if (targetAsset.category === "blockchain" && typeof operation.address === "string") {
		const normalized = operation.address.trim();
		if (normalized.length > 0) {
			targetAsset.address = normalized;
			updates.push(`address -> ${normalized}`);
		}
	}

	if (updates.length === 0) {
		return {
			action: "update",
			status: "skipped",
			detail: "No valid fields to update",
		};
	}

	return {
		action: "update",
		status: "applied",
		detail: `Updated ${targetAsset.label}: ${updates.join(", ")}`,
	};
}
