import { AIChatAgent } from "agents/ai-chat-agent";
import type { AgentContext } from "agents";
import {
  convertToModelMessages,
  type StreamTextOnFinishCallback,
  streamText,
  stepCountIs,
  type UIMessage,
  type TextUIPart,
  createUIMessageStream,
  createUIMessageStreamResponse,
} from "ai";
import { createOpenAI, openai } from "@ai-sdk/openai";
import systemprompt from './systemprompt.txt';
import { createDefaultAgentState, createPortfolioTools, type PortfolioAgentState } from "../tools/portfolio";
import { tools } from "../tools";
import { env } from "cloudflare:workers";

const MAX_TOTAL_MESSAGES = 32;
const MAX_RECENT_MESSAGES = 12;
const MAX_SUMMARY_CHARS = 1600;
const SUMMARY_PREFIX = "Earlier context (compressed):";

function isTextPart(part: UIMessage["parts"][number]): part is TextUIPart {
  return part.type === "text";
}

function formatMessageForSummary(message: UIMessage): string {
  const text = message.parts
    .filter(isTextPart)
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join(" ")
    .trim();

  if (!text) {
    return "";
  }

  return `${message.role}: ${text}`;
}

function isSummarySystemMessage(message: UIMessage): boolean {
  if (message.role !== "system") return false;
  return message.parts.some(
    (part) => isTextPart(part) && part.text.startsWith(SUMMARY_PREFIX)
  );
}

export class PomaAgent extends AIChatAgent<Env, PortfolioAgentState> {
  constructor(ctx: AgentContext, env: Env) {
    super(ctx, env);
    this.initialState = createDefaultAgentState();

  }

  async onChatMessage(onFinish: StreamTextOnFinishCallback<{}>) {
    const model = createOpenAI({
      apiKey: env.OPENAI_API_KEY,
      baseURL: await env.AI.gateway("sawbayaigw").getUrl("openai"),
      headers: {
        "cf-aig-authorization": `Bearer ${env.CF_AIG_TOKEN}`,
      },
    })(env.MODEL_NAME);

    const allTools = {
      ...tools,
      ...createPortfolioTools(this)
    };

    // const stream = createUIMessageStream({
    //   execute: async ({ writer }) => {
    //     const result = streamText({
    //       messages: convertToModelMessages(this.messages),
    //       model: this.model,
    //       onFinish
    //     });

    //     writer.merge(result.toUIMessageStream());
    //   }
    // });

    // return createUIMessageStreamResponse({ stream });

    const result = streamText({
      system: this.systemPrompt(),
      messages: convertToModelMessages(this.messages),
      model,
      onFinish,
      // onFinish: async (event) => {
      //   try {
      //     await onFinish(event as any);
      //   } finally {
      //     this.compressMessagesIfNeeded();
      //   }
      // },
      tools: allTools,
      stopWhen: stepCountIs(5)
    });

    return result.toUIMessageStreamResponse();
  }

  private compressMessagesIfNeeded(): void {
    const conversationMessages = this.messages.filter(
      (message) => message.role !== "system"
    );

    if (conversationMessages.length <= MAX_TOTAL_MESSAGES) {
      return;
    }

    const summaryCarryOver = this.messages
      .filter(isSummarySystemMessage)
      .flatMap((message) =>
        message.parts
          .filter(isTextPart)
          .map((part) =>
            part.text.replace(`${SUMMARY_PREFIX}\n`, "").trim()
          )
      )
      .filter(Boolean);

    const systemMessages = this.messages.filter(
      (message) => message.role === "system" && !isSummarySystemMessage(message)
    );

    const recent = conversationMessages.slice(-MAX_RECENT_MESSAGES);
    const earlier = conversationMessages.slice(
      0,
      Math.max(0, conversationMessages.length - MAX_RECENT_MESSAGES)
    );

    const summarySegments = [
      ...summaryCarryOver,
      ...earlier.map(formatMessageForSummary).filter(Boolean)
    ];

    const summaryText = summarySegments.join("\n").slice(-MAX_SUMMARY_CHARS);

    const summaryMessage: UIMessage = {
      id: crypto.randomUUID(),
      role: "system",
      parts: [
        {
          type: "text",
          text: summaryText
            ? `${SUMMARY_PREFIX}\n${summaryText}`
            : `${SUMMARY_PREFIX}\n(no additional details retained)`
        }
      ]
    };

    const nextMessages = [...systemMessages, summaryMessage, ...recent];
    this.messages.splice(0, this.messages.length, ...nextMessages);
  }

  systemPrompt() {
    return systemprompt;
  }
}
