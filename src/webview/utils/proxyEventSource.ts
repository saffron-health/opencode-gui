import { hasVscodeApi, vscode } from "./vscode";

type SSEEventHandler = (data: string) => void;
type SSEErrorHandler = (error: Error) => void;
type SSEStatusHandler = (status: {
  status: "connecting" | "connected" | "reconnecting" | "closed";
  attempt?: number;
  nextRetryMs?: number;
  reason?: "aborted" | "error" | "manual";
}) => void;

interface ProxySSESubscription {
  onMessage: SSEEventHandler;
  onError?: SSEErrorHandler;
  onStatus?: SSEStatusHandler;
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
  } else if (message?.type === "sseStatus") {
    const { id, status, attempt, nextRetryMs, reason } = message;
    const sub = activeSubscriptions.get(id);
    if (sub?.onStatus) {
      sub.onStatus({ status, attempt, nextRetryMs, reason });
    }
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
  onError?: SSEErrorHandler,
  onStatus?: SSEStatusHandler
): () => void {
  // Use native EventSource when running outside VSCode
  if (!hasVscodeApi) {
    const eventSource = new EventSource(url);
    
    // Simulate status callbacks for native EventSource
    onStatus?.({ status: "connecting" });
    
    eventSource.onopen = () => {
      onStatus?.({ status: "connected" });
    };
    eventSource.onmessage = (event) => {
      onMessage(event.data);
    };
    eventSource.onerror = () => {
      onError?.(new Error("EventSource connection error"));
    };
    return () => {
      eventSource.close();
      onStatus?.({ status: "closed", reason: "manual" });
    };
  }

  const id = crypto.randomUUID();

  activeSubscriptions.set(id, { onMessage, onError, onStatus });

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
