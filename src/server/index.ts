import { routeAgentRequest } from "agents";
import { AIChatAgent } from "agents/ai-chat-agent";
import type { AgentContext } from "agents";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  type StreamTextOnFinishCallback,
  streamText,
  stepCountIs,
} from "ai";
import {
  createServerTools,
  executePortfolioWrite,
  createDefaultAgentState
} from "./tools";
import type { PortfolioAgentState } from "./tools";
import { processToolCalls, hasToolConfirmation } from "./utils";
import { createWorkersAI } from 'workers-ai-provider';
import systemprompt from './prompts/systemprompt.txt';

export class PomaAgent extends AIChatAgent<Env, PortfolioAgentState> {
  constructor(ctx: AgentContext, env: Env) {
    super(ctx, env);
    this.initialState = createDefaultAgentState();
  }

  async onChatMessage(onFinish: StreamTextOnFinishCallback<{}>) {
    const startTime = Date.now();

    const lastMessage = this.messages[this.messages.length - 1];
    const tools = createServerTools(this);

    if (hasToolConfirmation(lastMessage)) {
      // Process tool confirmations using UI stream
      const stream = createUIMessageStream({
        execute: async ({ writer }) => {
          await processToolCalls(
            { writer, messages: this.messages, tools },
            { "tool.portfolio.write": (input) => executePortfolioWrite(this, input) }
          );
        }
      });
      return createUIMessageStreamResponse({ stream });
    }

    const workersai = createWorkersAI({ binding: this.env.AI });
    const model = workersai(this.env.MODEL_NAME as any);

    // Use streamText directly and return with metadata
    const result = streamText({
      system: this.systemPrompt(),
      messages: convertToModelMessages(this.messages),
      model,
      onFinish,
      tools,
      stopWhen: stepCountIs(5)
    });

    return result.toUIMessageStreamResponse({
      messageMetadata: ({ part }) => {
        // This is optional, purely for demo purposes in this example
        if (part.type === "start") {
          return {
            model: this.env.MODEL_NAME,
            createdAt: Date.now(),
            messageCount: this.messages.length
          };
        }
        if (part.type === "finish") {
          return {
            responseTime: Date.now() - startTime,
            totalTokens: part.totalUsage?.totalTokens
          };
        }
      }
    });
  }

  systemPrompt() {
    return systemprompt;
  }
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext) {
    return (
      (await routeAgentRequest(request, env)) ||
      new Response("Not found", { status: 404 })
    );
  }
} satisfies ExportedHandler<Env>;
