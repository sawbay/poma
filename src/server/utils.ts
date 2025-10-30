import type { UIMessage } from "@ai-sdk/react";
import { type UIMessageStreamWriter, type ToolSet, isToolUIPart, type ToolCallOptions, convertToModelMessages } from "ai";
import type { z } from "zod";

// Helper type to infer tool arguments from Zod schema
type InferToolArgs<T> = T extends { inputSchema: infer S }
  ? S extends z.ZodType
    ? z.infer<S>
    : never
  : never;

// Type guard to check if part has required properties
function isToolConfirmationPart(part: unknown): part is {
  type: string;
  output: string;
  input?: Record<string, unknown>;
} {
  return (
    typeof part === "object" &&
    part !== null &&
    "type" in part &&
    "output" in part &&
    typeof (part as { type: unknown }).type === "string" &&
    typeof (part as { output: unknown }).output === "string"
  );
}

export const APPROVAL = {
  NO: "No, denied.",
  YES: "Yes, confirmed."
} as const;

/**
 * Tools that require Human-In-The-Loop
 */
export const toolsRequiringConfirmation = ["tool.portfolio.write"];

/**
 * Check if a message contains tool confirmations
 */
export function hasToolConfirmation(message: UIMessage): boolean {
  return (
    message?.parts?.some(
      (part) =>
        part.type?.startsWith("tool-") &&
        toolsRequiringConfirmation.includes(part.type?.slice("tool-".length)) &&
        "output" in part
    ) || false
  );
}

function isValidToolName<K extends PropertyKey, T extends object>(
  key: K,
  obj: T
): key is K & keyof T {
  return key in obj;
}

/**
 * Processes tool invocations where human input is required, executing tools when authorized.
 */
export async function processToolCalls<Tools extends ToolSet>({
  dataStream,
  messages,
  executions
}: {
  tools: Tools; // used for type inference
  dataStream: UIMessageStreamWriter;
  messages: UIMessage[];
  executions: Record<
    string,
    // biome-ignore lint/suspicious/noExplicitAny: needs a better type
    (args: any, context: ToolCallOptions) => Promise<unknown>
  >;
}): Promise<UIMessage[]> {
  // Process all messages, not just the last one
  const processedMessages = await Promise.all(
    messages.map(async (message) => {
      const parts = message.parts;
      if (!parts) return message;

      const processedParts = await Promise.all(
        parts.map(async (part) => {
          // Only process tool UI parts
          if (!isToolUIPart(part)) return part;

          const toolName = part.type.replace(
            "tool-",
            ""
          ) as keyof typeof executions;

          // Only process tools that require confirmation (are in executions object) and are in 'input-available' state
          if (!(toolName in executions) || part.state !== "output-available")
            return part;

          let result: unknown;

          if (part.output === APPROVAL.YES) {
            // User approved the tool execution
            if (!isValidToolName(toolName, executions)) {
              return part;
            }

            const toolInstance = executions[toolName];
            if (toolInstance) {
              result = await toolInstance(part.input, {
                messages: convertToModelMessages(messages),
                toolCallId: part.toolCallId
              });
            } else {
              result = "Error: No execute function found on tool";
            }
          } else if (part.output === APPROVAL.NO) {
            result = "Error: User denied access to tool execution";
          } else {
            // If no approval input yet, leave the part as-is for user interaction
            return part;
          }

          // Forward updated tool result to the client.
          dataStream.write({
            type: "tool-output-available",
            toolCallId: part.toolCallId,
            output: result
          });

          // Return updated tool part with the actual result.
          return {
            ...part,
            output: result
          };
        })
      );

      return { ...message, parts: processedParts };
    })
  );

  return processedMessages;
}

/**
 * Clean up incomplete tool calls from messages before sending to API
 * Prevents API errors from interrupted or failed tool executions
 */
export function cleanupMessages(messages: UIMessage[]): UIMessage[] {
  return messages.filter((message) => {
    if (!message.parts) return true;

    // Filter out messages with incomplete tool calls
    const hasIncompleteToolCall = message.parts.some((part) => {
      if (!isToolUIPart(part)) return false;
      // Remove tool calls that are still streaming or awaiting input without results
      return (
        part.state === "input-streaming" ||
        (part.state === "input-available" && !part.output && !part.errorText)
      );
    });

    return !hasIncompleteToolCall;
  });
}