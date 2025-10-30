import { AIChatAgent } from "agents/ai-chat-agent";
import type { AgentContext } from "agents";
import {
  convertToModelMessages,
  type StreamTextOnFinishCallback,
  streamText,
  stepCountIs,
} from "ai";
import { createWorkersAI } from 'workers-ai-provider';
import systemprompt from './systemprompt.txt';
import { createDefaultAgentState, createPortfolioTools, type PortfolioAgentState } from "../tools/portfolio";
import { tools } from "../tools";

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
      tools: allTools,
      stopWhen: stepCountIs(5)
    });

    return result.toUIMessageStreamResponse();
  }

  systemPrompt() {
    return systemprompt;
  }
}
