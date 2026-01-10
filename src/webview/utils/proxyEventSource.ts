import { hasVscodeApi, vscode } from "./vscode";

type SSEEventHandler = (data: string) => void;
type SSEErrorHandler = (error: Error) => void;

interface ProxySSESubscription {
  onMessage: SSEEventHandler;
  onError?: SSEErrorHandler;
}

const activeSubscriptions = new Map<string, ProxySSESubscription>();

// Listen for SSE events from extension
window.addEventListener("message", (event) => {
  const message = event.data;

  if (message?.type === "sseEvent") {
    const { id, data } = message;
    const sub = activeSubscriptions.get(id);
    if (sub) {
      sub.onMessage(data);
    }
  } else if (message?.type === "sseError") {
    const { id, error } = message;
    const sub = activeSubscriptions.get(id);
    if (sub?.onError) {
      sub.onError(new Error(error ?? "SSE connection error"));
    }
    activeSubscriptions.delete(id);
  } else if (message?.type === "sseClosed") {
    const { id } = message;
    activeSubscriptions.delete(id);
  }
});

// Clean up subscriptions when webview unloads
window.addEventListener("beforeunload", () => {
  for (const id of activeSubscriptions.keys()) {
    vscode.postMessage({ type: "sseClose", id });
  }
  activeSubscriptions.clear();
});

/**
 * Subscribe to SSE events through the VS Code extension proxy.
 * Falls back to native EventSource when running outside VSCode.
 * Returns an unsubscribe function.
 */
export function proxyEventSource(
  url: string,
  onMessage: SSEEventHandler,
  onError?: SSEErrorHandler
): () => void {
  // Use native EventSource when running outside VSCode
  if (!hasVscodeApi) {
    const eventSource = new EventSource(url);
    eventSource.onmessage = (event) => {
      onMessage(event.data);
    };
    eventSource.onerror = () => {
      onError?.(new Error("EventSource connection error"));
    };
    return () => {
      eventSource.close();
    };
  }

  const id = crypto.randomUUID();

  activeSubscriptions.set(id, { onMessage, onError });

  vscode.postMessage({
    type: "sseSubscribe",
    id,
    url,
  });

  return () => {
    activeSubscriptions.delete(id);
    vscode.postMessage({ type: "sseClose", id });
  };
}
