import "server-only";

// Closed schema: never serialize errors, headers, prompts, user input or config.
export function operationLog(event: "completed" | "failed" | "unexpected", operation: "text" | "image" | "request" | "media", fields: { requestId?: string; durationMs?: number; code?: string } = {}) {
  const entry = JSON.stringify({ event, operation, ...fields, time: new Date().toISOString() });
  if (event === "completed") console.info(entry);
  else console.error(entry);
}
