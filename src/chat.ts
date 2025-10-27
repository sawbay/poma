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

export interface OperationOutcome {
	action: string;
	status: "applied" | "skipped";
	detail: string;
}

export interface ChatResult {
	reply: string;
	operations: OperationOutcome[];
	portfolio: PortfolioData;
}

export async function handleChatRequest(
	ai: Ai | null,
	kv: KVNamespace,
	messages: ChatMessage[],
): Promise<ChatResult> {
	const portfolio = await loadPortfolio(kv);
	const planner = await planOperations(ai, portfolio, messages);
	const operations = Array.isArray(planner.operations) ? planner.operations : [];

	const outcomes: OperationOutcome[] = [];
	let mutated = false;
	const assets = [...portfolio.assets];

	for (const operation of operations) {
		const outcome = applyOperation(assets, operation);
		outcomes.push(outcome);
		if (outcome.status === "applied") {
			mutated = true;
		}
	}

	if (mutated) {
		await savePortfolio(kv, { assets, updatedAt: new Date().toISOString() });
	}

	return {
		reply: planner.reply ?? "Let me know how you would like to adjust the portfolio next.",
		operations: outcomes,
		portfolio: mutated ? await loadPortfolio(kv) : portfolio,
	};
}

interface PlannerResponse {
	reply?: string;
	operations?: ChatOperation[];
}

async function planOperations(
	ai: Ai | null,
	portfolio: PortfolioData,
	messages: ChatMessage[],
): Promise<PlannerResponse> {
	const safeMessages = messages.map((message) => ({
		role: message.role,
		content: message.content.slice(0, 2000),
	}));

	if (ai) {
		try {
			return await runPlanner(ai, portfolio, safeMessages);
		} catch (error) {
			console.warn("AI planning failed, falling back to heuristics", error);
		}
	}

	return buildHeuristicPlan(safeMessages);
}

async function runPlanner(
	ai: Ai,
	portfolio: PortfolioData,
	messages: ChatMessage[],
): Promise<PlannerResponse> {
	const systemPrompt = `You manage a single-user investment portfolio.
You can add blockchain addresses (bitcoin, ethereum, solana) and physical holdings (gold in troy ounces, USD cash).
Return ONLY JSON with shape:
{ "reply": string, "operations": [ { "type": "add"|"remove"|"update", ... } ] }

Rules:
- For add blockchain operations include "target" chain name and "address".
- For add physical operations include "target" (gold/usd) and numeric "quantity".
- For remove or update include "identifier" referencing id, label, or address.
- Never guess addresses or quantities. Ask the user if missing.`;

	const conversation = [
		{ role: "system", content: systemPrompt },
		{ role: "user", content: `Current portfolio: ${JSON.stringify(portfolio.assets, null, 2)}` },
		...messages,
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
	if (raw && typeof raw === "object" && "response" in raw) {
		const response = (raw as Record<string, unknown>).response;
		if (typeof response === "string") {
			return response;
		}
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
		console.warn("Planner JSON parse failed", error);
		return {
			reply: "I could not parse that request. Please rephrase the portfolio change you need.",
			operations: [],
		};
	}
}

function extractJson(text: string): string {
	const trimmed = text.trim();
	if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
		return trimmed;
	}

	const blockMatch = trimmed.match(/```json([^]*?)```/i);
	if (blockMatch) {
		return blockMatch[1].trim();
	}
	return trimmed;
}

function buildHeuristicPlan(messages: ChatMessage[]): PlannerResponse {
	const lastUser = [...messages].reverse().find((message) => message.role === "user");
	if (!lastUser) {
		return {
			reply: "I am ready to update the portfolio. Describe what you'd like to change.",
			operations: [],
		};
	}

	const operations = extractHeuristicOperations(lastUser.content);
	return {
		reply: operations.length
			? "Applied the requested updates."
			: "I could not detect a concrete instruction. Try sentences like 'add bitcoin <address>' or 'remove gold'.",
		operations,
	};
}

function extractHeuristicOperations(input: string): ChatOperation[] {
	const operations: ChatOperation[] = [];
	const commands = input
		.split(/[\n.;]+/)
		.map((segment) => segment.trim())
		.filter(Boolean);

	for (const segment of commands) {
		const lower = segment.toLowerCase();

		const addChainMatch = lower.match(/add\s+(bitcoin|ethereum|solana)\s+([a-z0-9]+)/i);
		if (addChainMatch) {
			const chain = addChainMatch[1].toLowerCase();
			const address = extractAddress(segment, addChainMatch[2]);
			const label = extractLabel(segment);
			operations.push({
				type: "add",
				target: chain,
				address,
				label,
			});
			continue;
		}

		const addPhysicalMatch = segment.match(/add\s+([\d.]+)\s+(gold|usd)/i);
		if (addPhysicalMatch) {
			const quantity = Number(addPhysicalMatch[1]);
			const symbol = addPhysicalMatch[2].toLowerCase();
			operations.push({
				type: "add",
				target: symbol,
				quantity,
				label: extractLabel(segment) ?? symbol.toUpperCase(),
			});
			continue;
		}

		const removeMatch = segment.match(/remove\s+([^\s]+)/i);
		if (removeMatch) {
			operations.push({
				type: "remove",
				identifier: removeMatch[1],
			});
			continue;
		}

		const updateMatch = segment.match(/(update|set)\s+([^\s]+)\s+(?:to\s+)?([\d.]+)/i);
		if (updateMatch) {
			operations.push({
				type: "update",
				identifier: updateMatch[2],
				quantity: Number(updateMatch[3]),
			});
			continue;
		}
	}

	return operations.filter(validateOperationShape);
}

function extractAddress(segment: string, fallback: string): string {
	const addressMatch = segment.match(/0x[a-f0-9]{40}/i);
	if (addressMatch) {
		return addressMatch[0];
	}
	return fallback;
}

function extractLabel(segment: string): string | undefined {
	const match = segment.match(/(?:label(?:ed)?|named)\s+([a-z0-9 _-]+)/i);
	return match ? match[1].trim() : undefined;
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
		if (SUPPORTED_CHAINS.includes(normalized as Chain)) {
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

export function applyOperation(assets: PortfolioAsset[], operation: ChatOperation): OperationOutcome {
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
				detail: "Unsupported operation",
			};
	}
}

function applyAddOperation(assets: PortfolioAsset[], operation: ChatOperation): OperationOutcome {
	const target = operation.target?.toLowerCase();
	if (!target) {
		return { action: "add", status: "skipped", detail: "Missing target" };
	}

	if (SUPPORTED_CHAINS.includes(target as Chain)) {
		const address = operation.address?.trim();
		if (!address) {
			return { action: "add", status: "skipped", detail: `Missing address for ${target}` };
		}
		const label = operation.label?.trim() || `${target.toUpperCase()} ${address.slice(-4)}`;
		assets.push(createBlockchainAsset({ label, chain: target as Chain, address }));
		return {
			action: `add-${target}`,
			status: "applied",
			detail: `Added ${label}`,
		};
	}

	if ((SUPPORTED_PHYSICAL as string[]).includes(target.toUpperCase())) {
		const quantity = Number(operation.quantity ?? 0);
		if (!Number.isFinite(quantity) || quantity <= 0) {
			return { action: "add", status: "skipped", detail: "Quantity must be positive" };
		}
		const label = operation.label?.trim() || target.toUpperCase();
		assets.push(
			createPhysicalAsset({
				label,
				symbol: target.toUpperCase() as PhysicalSymbol,
				quantity,
			}),
		);
		return {
			action: `add-${target}`,
			status: "applied",
			detail: `Added ${label}`,
		};
	}

	return { action: "add", status: "skipped", detail: `Unsupported target ${operation.target}` };
}

function applyRemoveOperation(assets: PortfolioAsset[], identifier: string): OperationOutcome {
	const asset = findAssetByIdentifier(assets, identifier);
	if (!asset) {
		return {
			action: "remove",
			status: "skipped",
			detail: `No asset matches "${identifier}"`,
		};
	}

	assets.splice(assets.indexOf(asset), 1);
	return {
		action: "remove",
		status: "applied",
		detail: `Removed ${asset.label}`,
	};
}

function applyUpdateOperation(assets: PortfolioAsset[], operation: ChatOperation): OperationOutcome {
	const asset = findAssetByIdentifier(assets, operation.identifier!);
	if (!asset) {
		return {
			action: "update",
			status: "skipped",
			detail: `No asset matches "${operation.identifier}"`,
		};
	}

	const notes: string[] = [];

	if (typeof operation.label === "string" && operation.label.trim().length > 0) {
		asset.label = operation.label.trim();
		notes.push("label updated");
	}

	if (asset.category === "physical" && typeof operation.quantity === "number") {
		if (Number.isFinite(operation.quantity) && operation.quantity >= 0) {
			asset.quantity = operation.quantity;
			notes.push("quantity updated");
		} else {
			return {
				action: "update",
				status: "skipped",
				detail: "Quantity must be zero or greater",
			};
		}
	}

	if (asset.category === "blockchain" && typeof operation.address === "string") {
		const address = operation.address.trim();
		if (address.length > 0) {
			asset.address = address;
			notes.push("address updated");
		}
	}

	if (!notes.length) {
		return {
			action: "update",
			status: "skipped",
			detail: "No valid fields to update",
		};
	}

	return {
		action: "update",
		status: "applied",
		detail: `Updated ${asset.label} (${notes.join(", ")})`,
	};
}
