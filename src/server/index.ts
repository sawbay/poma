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

    const workersai = createWorkersAI({ binding: this.env.AI });
    const model = workersai(this.env.MODEL_NAME as any);
    const tools = createServerTools(this);

    const result = streamText({
      system: this.systemPrompt(),
      messages: convertToModelMessages(this.messages),
      model,
      onFinish,
      tools,
      stopWhen: stepCountIs(5)
    });

    return result.toUIMessageStreamResponse();
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
