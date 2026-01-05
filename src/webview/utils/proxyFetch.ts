import { vscode } from "./vscode";

const FETCH_TIMEOUT_MS = 30_000;

const pendingFetches = new Map<
  string,
  {
    resolve: (value: Response) => void;
    reject: (reason?: unknown) => void;
    timeoutId: number;
  }
>();

// Listen for proxy fetch responses from extension
window.addEventListener("message", (event) => {
  const message = event.data;
  if (message?.type !== "proxyFetchResult") return;

  const { id, ok, status, statusText, headers, bodyText, error } = message;

  const entry = pendingFetches.get(id);
  if (!entry) return;

  clearTimeout(entry.timeoutId);
  pendingFetches.delete(id);

  if (!ok) {
    entry.reject(new Error(error ?? "Proxy fetch failed"));
    return;
  }

  // Build a synthetic Response object for the SDK
  const responseHeaders = new Headers(headers ?? {});
  const response = new Response(bodyText, {
    status,
    statusText,
    headers: responseHeaders,
  });
  entry.resolve(response);
});

// Clean up pending requests when webview unloads
window.addEventListener("beforeunload", () => {
  for (const [, entry] of pendingFetches.entries()) {
    clearTimeout(entry.timeoutId);
    entry.reject(new Error("Webview unloaded before proxy fetch completed"));
  }
  pendingFetches.clear();
});

/**
 * Fetch implementation that proxies requests through the VS Code extension
 * to bypass CORS restrictions for localhost API calls.
 */
export async function proxyFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  // Handle Request objects - the SDK might pass a Request instead of separate args
  let url: string;
  let method: string | undefined;
  let reqHeaders: HeadersInit | undefined;
  let reqBody: string | undefined;

  if (input instanceof Request) {
    url = input.url;
    method = input.method;
    reqHeaders = input.headers;
    // Read body from Request if present
    if (input.body) {
      reqBody = await input.text();
    }
  } else {
    url = String(input);
    method = init?.method;
    reqHeaders = init?.headers;
    if (typeof init?.body === "string") {
      reqBody = init.body;
    }
  }

  const id = crypto.randomUUID();

  return new Promise<Response>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      pendingFetches.delete(id);
      reject(new Error("Proxy fetch timed out"));
    }, FETCH_TIMEOUT_MS);

    pendingFetches.set(id, { resolve, reject, timeoutId });

    const headers: Record<string, string> = {};
    if (reqHeaders instanceof Headers) {
      reqHeaders.forEach((v, k) => (headers[k] = v));
    } else if (Array.isArray(reqHeaders)) {
      for (const [k, v] of reqHeaders) headers[k] = v;
    } else if (reqHeaders) {
      Object.assign(headers, reqHeaders as Record<string, string>);
    }

    vscode.postMessage({
      type: "proxyFetch",
      id,
      url,
      init: {
        method,
        headers,
        body: reqBody,
      },
    });
  });
}
