import type { Ai } from "@cloudflare/workers-types";
import { handleChatRequest } from "./chat";
import { renderPage } from "./ui";
import { buildPortfolioSummary } from "./summary";
import type { ChatMessage } from "./types";

interface Env {
	AI: Ai;
	PORTFOLIO_KV: KVNamespace;
}

export default {
	async fetch(request, env): Promise<Response> {
		try {
			const url = new URL(request.url);

			if (request.method === "OPTIONS") {
				return buildCorsResponse();
			}

			if (request.method === "GET" && url.pathname === "/") {
				return new Response(renderPage(), {
					headers: {
						"content-type": "text/html; charset=UTF-8",
					},
				});
			}

			if (request.method === "GET" && url.pathname === "/api/portfolio") {
				const summary = await buildPortfolioSummary(env.PORTFOLIO_KV);
				return jsonResponse(summary);
			}

			if (request.method === "POST" && url.pathname === "/api/chat") {
				const payload = await parseJson<{ messages?: ChatMessage[] }>(request);
				const sanitizedMessages = sanitizeMessages(payload?.messages ?? []);
				const chatResult = await handleChatRequest(env.AI, env.PORTFOLIO_KV, sanitizedMessages);
				const summary = await buildPortfolioSummary(env.PORTFOLIO_KV);
				return jsonResponse({
					reply: chatResult.reply,
					operations: chatResult.operations,
					summary,
				});
			}

			return new Response("Not found", { status: 404 });
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unexpected worker error";
			return jsonResponse({ error: message }, 500);
		}
	},
} satisfies ExportedHandler<Env>;

function buildCorsResponse(): Response {
	return new Response(null, {
		headers: {
			"Access-Control-Allow-Origin": "*",
			"Access-Control-Allow-Methods": "GET,POST,OPTIONS",
			"Access-Control-Allow-Headers": "Content-Type",
		},
	});
}

async function parseJson<T>(request: Request): Promise<T | undefined> {
	try {
		return (await request.json()) as T;
	} catch {
		return undefined;
	}
}

function jsonResponse(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			"content-type": "application/json; charset=UTF-8",
			"Access-Control-Allow-Origin": "*",
		},
	});
}

function sanitizeMessages(messages: ChatMessage[]): ChatMessage[] {
	return messages
		.filter(
			(message): message is ChatMessage =>
				message &&
				typeof message === "object" &&
				(message.role === "user" || message.role === "assistant") &&
				typeof message.content === "string",
		)
		.map((message) => ({
			role: message.role,
			content: message.content.slice(0, 2000),
		}));
}
