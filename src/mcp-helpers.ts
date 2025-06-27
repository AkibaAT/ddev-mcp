import { DdevCommandError } from "./ddev-command.js";

export function createTool(
  name: string,
  description: string,
  inputSchema: object,
  handler: (args: Record<string, unknown>, config: Record<string, unknown>) => { content: { type: string; text: string }[] }
) {
  return {
    name,
    description,
    inputSchema,
    handler,
  };
}

export function createToolResponse(text: string) {
  return {
    content: [
      {
        type: "text",
        text,
      },
    ],
  };
}

export function createErrorResponse(message: string, isError = true) {
  return {
    isError,
    content: [
      {
        type: "text",
        text: message,
      },
    ],
  };
}

export function handleToolError(error: unknown): never {
  if (error instanceof DdevCommandError) {
    throw createErrorResponse(
      `DDEV command failed:\n\n${error.message}`,
      true
    );
  }
  throw createErrorResponse(
    `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`,
    true
  );
}
