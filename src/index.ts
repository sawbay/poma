import { handleChatRequest } from "./chat";
import { buildPortfolioSummary } from "./summary";
import type { ChatMessage } from "./types";
import overviewHtml from "./ui/index.html";
import manageHtml from "./ui/manage.html";

interface Env {
	POMA_KV: KVNamespace;
	AI: Ai;
}

export default {
	async fetch(request, env): Promise<Response> {
		try {
			const url = new URL(request.url);

			if (request.method === "OPTIONS") {
				return corsResponse();
			}

			if (request.method === "GET" && url.pathname === "/") {
				return new Response(overviewHtml, {
					headers: {
						"content-type": "text/html; charset=UTF-8",
					},
				});
			}

			if (request.method === "GET" && url.pathname === "/manage") {
				return new Response(manageHtml, {
					headers: {
						"content-type": "text/html; charset=UTF-8",
					},
				});
			}

			if (request.method === "GET" && url.pathname === "/api/portfolio") {
				const summary = await buildPortfolioSummary(env.POMA_KV);
				return jsonResponse(summary);
			}

			if (request.method === "POST" && url.pathname === "/api/chat") {
				const payload = await parseJson<{ messages?: ChatMessage[] }>(request);
				const sanitized = sanitizeMessages(payload?.messages ?? []);
				const chat = await handleChatRequest(env.AI ?? null, env.POMA_KV, sanitized);
				const summary = await buildPortfolioSummary(env.POMA_KV);
				return jsonResponse({
					reply: chat.reply,
					operations: chat.operations,
					summary,
				});
			}

			return new Response("Not found", { status: 404 });
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unexpected worker error";
			return jsonResponse({ error: message }, 500);
		}
	},
	async scheduled(event, env): Promise<void> {
		await buildPortfolioSummary(env.POMA_KV);
	},
} satisfies ExportedHandler<Env>;

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

function corsResponse(): Response {
	return new Response(null, {
		headers: {
			"Access-Control-Allow-Origin": "*",
			"Access-Control-Allow-Methods": "GET,POST,OPTIONS",
			"Access-Control-Allow-Headers": "Content-Type",
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
