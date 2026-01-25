/**
 * A resilient SSE client with:
 * - Full SSE parsing (data, event, id, retry, multiline data)
 * - Last-Event-ID tracking for reconnection
 * - Exponential backoff with cap, honoring server retry: directives
 * - Clean cancellation via AbortController
 */

export interface SseEvent {
  id?: string;
  event?: string;
  data: string;
}

export interface SseClientOptions {
  /** Initial retry delay in ms (default: 1000) */
  initialRetryMs?: number;
  /** Maximum retry delay in ms (default: 30000) */
  maxRetryMs?: number;
  /** Backoff multiplier (default: 2) */
  backoffMultiplier?: number;
  /** Called when an event is received */
  onEvent: (event: SseEvent) => void;
  /** Called when connection state changes */
  onStateChange?: (state: SseConnectionState) => void;
  /** Called on unrecoverable error (after retries exhausted or abort) */
  onError?: (error: Error) => void;
  /** Logger for debugging */
  logger?: SseLogger;
}

export type SseConnectionState =
  | { status: 'connecting' }
  | { status: 'connected' }
  | { status: 'reconnecting'; attempt: number; nextRetryMs: number }
  | { status: 'closed'; reason: 'aborted' | 'error' | 'manual' };

export interface SseLogger {
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

const DEFAULT_INITIAL_RETRY_MS = 1000;
const DEFAULT_MAX_RETRY_MS = 30000;
const DEFAULT_BACKOFF_MULTIPLIER = 2;

export class SseClient {
  private readonly url: string;
  private readonly options: Required<Omit<SseClientOptions, 'logger' | 'onStateChange' | 'onError'>> & Pick<SseClientOptions, 'logger' | 'onStateChange' | 'onError'>;
  
  private abortController: AbortController | null = null;
  private lastEventId: string | undefined;
  private retryMs: number;
  private reconnectAttempt = 0;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private closed = false;

  constructor(url: string, options: SseClientOptions) {
    this.url = url;
    this.options = {
      initialRetryMs: options.initialRetryMs ?? DEFAULT_INITIAL_RETRY_MS,
      maxRetryMs: options.maxRetryMs ?? DEFAULT_MAX_RETRY_MS,
      backoffMultiplier: options.backoffMultiplier ?? DEFAULT_BACKOFF_MULTIPLIER,
      onEvent: options.onEvent,
      onStateChange: options.onStateChange,
      onError: options.onError,
      logger: options.logger,
    };
    this.retryMs = this.options.initialRetryMs;
  }

  /**
   * Start the SSE connection. Returns immediately.
   * The connection will automatically reconnect on failure.
   */
  connect(): void {
    if (this.closed) {
      return;
    }
    this.reconnectAttempt = 0;
    this.doConnect();
  }

  /**
   * Close the SSE connection and stop reconnecting.
   */
  close(): void {
    this.closed = true;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.setState({ status: 'closed', reason: 'manual' });
  }

  private setState(state: SseConnectionState): void {
    this.options.onStateChange?.(state);
  }

  private log(level: 'info' | 'warn' | 'error', message: string, ...args: unknown[]): void {
    this.options.logger?.[level](`[SseClient] ${message}`, ...args);
  }

  private async doConnect(): Promise<void> {
    if (this.closed) {
      return;
    }

    this.abortController = new AbortController();
    const isReconnect = this.reconnectAttempt > 0;

    if (isReconnect) {
      this.setState({ status: 'reconnecting', attempt: this.reconnectAttempt, nextRetryMs: this.retryMs });
    } else {
      this.setState({ status: 'connecting' });
    }

    const headers: Record<string, string> = {
      Accept: 'text/event-stream',
      'Cache-Control': 'no-cache',
    };
    if (this.lastEventId) {
      headers['Last-Event-ID'] = this.lastEventId;
    }

    this.log('info', `${isReconnect ? 'Reconnecting' : 'Connecting'} to ${this.url}`, {
      attempt: this.reconnectAttempt,
      lastEventId: this.lastEventId,
    });

    try {
      const response = await fetch(this.url, {
        headers,
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`SSE connection failed: ${response.status} ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('SSE response has no body');
      }

      // Connection successful - reset retry state
      this.reconnectAttempt = 0;
      this.retryMs = this.options.initialRetryMs;
      this.setState({ status: 'connected' });
      this.log('info', 'Connected successfully');

      await this.processStream(response.body);

      // Stream ended normally - attempt reconnect
      if (!this.closed) {
        this.log('info', 'Stream ended, reconnecting...');
        this.scheduleReconnect();
      }
    } catch (error) {
      if (this.closed) {
        return;
      }

      if ((error as Error).name === 'AbortError') {
        this.setState({ status: 'closed', reason: 'aborted' });
        return;
      }

      this.log('error', 'Connection error', error);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.closed) {
      return;
    }

    this.reconnectAttempt++;
    const delay = this.retryMs;

    this.log('info', `Scheduling reconnect attempt ${this.reconnectAttempt} in ${delay}ms`);
    this.setState({ status: 'reconnecting', attempt: this.reconnectAttempt, nextRetryMs: delay });

    // Exponential backoff
    this.retryMs = Math.min(this.retryMs * this.options.backoffMultiplier, this.options.maxRetryMs);

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      this.doConnect();
    }, delay);
  }

  private async processStream(body: ReadableStream<Uint8Array>): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    // SSE event fields (accumulated across lines)
    let eventType: string | undefined;
    let eventData: string[] = [];
    let eventId: string | undefined;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        // Process complete lines
        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);

          // Remove trailing \r if present (for \r\n line endings)
          const cleanLine = line.endsWith('\r') ? line.slice(0, -1) : line;

          this.processLine(cleanLine, eventType, eventData, eventId, (type, data, id) => {
            eventType = type;
            eventData = data;
            eventId = id;
          });
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private processLine(
    line: string,
    eventType: string | undefined,
    eventData: string[],
    eventId: string | undefined,
    setState: (type: string | undefined, data: string[], id: string | undefined) => void
  ): void {
    // Empty line = dispatch event
    if (line === '') {
      if (eventData.length > 0) {
        const event: SseEvent = {
          data: eventData.join('\n'),
        };
        if (eventType) {
          event.event = eventType;
        }
        if (eventId) {
          event.id = eventId;
          this.lastEventId = eventId;
        }
        this.options.onEvent(event);
      }
      // Reset for next event
      setState(undefined, [], undefined);
      return;
    }

    // Comment line
    if (line.startsWith(':')) {
      return;
    }

    // Parse field
    const colonIndex = line.indexOf(':');
    let field: string;
    let value: string;

    if (colonIndex === -1) {
      field = line;
      value = '';
    } else {
      field = line.slice(0, colonIndex);
      // Skip optional space after colon
      value = line.slice(colonIndex + 1);
      if (value.startsWith(' ')) {
        value = value.slice(1);
      }
    }

    switch (field) {
      case 'event':
        setState(value, eventData, eventId);
        break;
      case 'data':
        eventData.push(value);
        setState(eventType, eventData, eventId);
        break;
      case 'id':
        // Per spec, ignore if contains null character
        if (!value.includes('\0')) {
          setState(eventType, eventData, value);
        }
        break;
      case 'retry':
        const retryValue = parseInt(value, 10);
        if (!isNaN(retryValue) && retryValue >= 0) {
          this.retryMs = retryValue;
          this.log('info', `Server set retry interval to ${retryValue}ms`);
        }
        break;
      default:
        // Unknown field - ignore per spec
        break;
    }
  }
}
