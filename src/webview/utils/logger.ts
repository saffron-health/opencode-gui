/**
 * Logger utility that sends log messages to the VS Code extension host.
 * Falls back to console logging in standalone mode (E2E tests, web app).
 */

// Check if VS Code API is available
const hasVscodeApi = typeof (window as any).acquireVsCodeApi === "function" 
  || typeof (window as any).vscode !== "undefined";

// Get VS Code API if available
function getVscode(): { postMessage(message: unknown): void } | null {
  if (typeof (window as any).vscode !== "undefined") {
    return (window as any).vscode;
  }
  return null;
}

function serializeForLog(value: unknown): string {
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  if (value instanceof Error) {
    return `${value.name}: ${value.message}${value.stack ? `\n${value.stack}` : ""}`;
  }

  try {
    const seen = new WeakSet<object>();
    return JSON.stringify(
      value,
      (_key, current) => {
        if (current instanceof Error) {
          return {
            name: current.name,
            message: current.message,
            stack: current.stack,
          };
        }
        if (typeof current === "object" && current !== null) {
          if (seen.has(current)) return "[Circular]";
          seen.add(current);
        }
        return current;
      },
      2
    );
  } catch {
    return String(value);
  }
}

function log(level: "debug" | "info" | "error", message: string, data?: unknown) {
  const vscode = getVscode();
  const serialized = data !== undefined ? serializeForLog(data) : undefined;
  
  if (vscode) {
    // Send to extension host
    vscode.postMessage({
      type: "log",
      level,
      message,
      data: serialized,
    });
  }
  
  // Always log to console as well for debugging
  const prefix = `[OpenCode]`;
  const logData = serialized !== undefined ? [message, serialized] : [message];
  
  switch (level) {
    case "debug":
      console.debug(prefix, ...logData);
      break;
    case "info":
      console.info(prefix, ...logData);
      break;
    case "error":
      console.error(prefix, ...logData);
      break;
  }
}

export const logger = {
  debug: (message: string, data?: unknown) => log("debug", message, data),
  info: (message: string, data?: unknown) => log("info", message, data),
  error: (message: string, data?: unknown) => log("error", message, data),
};
