import { AIChatAgent } from "agents/ai-chat-agent";
import type { AgentContext } from "agents";
import {
  convertToModelMessages,
  type StreamTextOnFinishCallback,
  streamText,
  stepCountIs,
  createUIMessageStream,
  createUIMessageStreamResponse,
} from "ai";
import { createWorkersAI } from 'workers-ai-provider';
import {
  createServerTools,
  createDefaultAgentState
} from "../tools";
import type { PortfolioAgentState } from "../tools";
import systemprompt from './systemprompt.txt';
import { cleanupMessages, processToolCalls } from "../utils";
import { executions, tools } from "../tools/index";

export class PomaAgent extends AIChatAgent<Env, PortfolioAgentState> {
  private model;

  constructor(ctx: AgentContext, env: Env) {
    super(ctx, env);
    this.initialState = createDefaultAgentState();
    const workersai = createWorkersAI({ binding: this.env.AI });
    this.model = workersai(this.env.MODEL_NAME as any);
  }

  async onChatMessage(onFinish: StreamTextOnFinishCallback<{}>) {
    const allTools = {...tools};

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        // Clean up incomplete tool calls to prevent API errors
        const cleanedMessages = cleanupMessages(this.messages);

        // Process any pending tool calls from previous messages
        // This handles human-in-the-loop confirmations for tools
        const processedMessages = await processToolCalls({
          messages: cleanedMessages,
          dataStream: writer,
          tools: allTools,
          executions
        });

        const result = streamText({
          system: this.systemPrompt(),
          messages: convertToModelMessages(processedMessages),
          model: this.model,
          tools: allTools,
          onFinish: onFinish as unknown as StreamTextOnFinishCallback<
            typeof allTools
          >,
          stopWhen: stepCountIs(10)
        });

        writer.merge(result.toUIMessageStream());
      }
    });

    return createUIMessageStreamResponse({ stream });

    // WARN: The code below is the previous implementation before refactoring to use processToolCalls utility function.
    // const result = streamText({
    //   system: this.systemPrompt(),
    //   messages: convertToModelMessages(this.messages),
    //   model: this.model,
    //   onFinish,
    //   tools,
    //   stopWhen: stepCountIs(5)
    // });

    // return result.toUIMessageStreamResponse();
  }

  systemPrompt() {
    return systemprompt;
  }
}
