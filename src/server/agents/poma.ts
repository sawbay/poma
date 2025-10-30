import { AIChatAgent } from "agents/ai-chat-agent";
import type { AgentContext } from "agents";
import {
  convertToModelMessages,
  type StreamTextOnFinishCallback,
  streamText,
  stepCountIs,
  type UIMessage,
  type TextUIPart,
} from "ai";
import { createWorkersAI } from 'workers-ai-provider';
import systemprompt from './systemprompt.txt';
import { createDefaultAgentState, createPortfolioTools, type PortfolioAgentState } from "../tools/portfolio";
import { tools } from "../tools";

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
  private model;

  constructor(ctx: AgentContext, env: Env) {
    super(ctx, env);
    this.initialState = createDefaultAgentState();
    const workersai = createWorkersAI({ binding: this.env.AI });
    this.model = workersai(this.env.MODEL_NAME as any);
  }

  async onChatMessage(onFinish: StreamTextOnFinishCallback<{}>) {
    const allTools = {
      ...tools,
      ...createPortfolioTools(this)
    };

    const result = streamText({
      system: this.systemPrompt(),
      messages: convertToModelMessages(this.messages),
      model: this.model,
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
