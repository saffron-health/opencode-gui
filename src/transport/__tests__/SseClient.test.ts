import { describe, it, expect, vi } from 'vitest';
import { SseClient, SseEvent } from '../SseClient';

function createTestFixture() {
  const mockFetch = vi.fn();
  vi.stubGlobal('fetch', mockFetch);

  function createMockReadableStream(chunks: string[]): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    let index = 0;
    return new ReadableStream<Uint8Array>({
      pull(controller) {
        if (index < chunks.length) {
          controller.enqueue(encoder.encode(chunks[index]));
          index++;
        } else {
          controller.close();
        }
      },
    });
  }

  function createMockResponse(chunks: string[], status = 200): Response {
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? 'OK' : 'Error',
      body: createMockReadableStream(chunks),
      headers: new Headers({ 'content-type': 'text/event-stream' }),
    } as unknown as Response;
  }

  function cleanup() {
    vi.restoreAllMocks();
  }

  return { mockFetch, createMockResponse, cleanup };
}

describe('SseClient', () => {
  describe('SSE parsing', () => {
    it('should parse simple data events', async () => {
      const { mockFetch, createMockResponse, cleanup } = createTestFixture();
      const events: SseEvent[] = [];
      mockFetch.mockResolvedValueOnce(createMockResponse(['data: hello\n\n']));

      const client = new SseClient('http://localhost/events', {
        onEvent: (e) => events.push(e),
      });

      client.connect();
      await vi.waitFor(() => expect(events.length).toBe(1));
      client.close();

      expect(events[0]).toEqual({ data: 'hello' });
      cleanup();
    });

    it('should parse multiline data events', async () => {
      const { mockFetch, createMockResponse, cleanup } = createTestFixture();
      const events: SseEvent[] = [];
      mockFetch.mockResolvedValueOnce(
        createMockResponse(['data: line1\ndata: line2\ndata: line3\n\n'])
      );

      const client = new SseClient('http://localhost/events', {
        onEvent: (e) => events.push(e),
      });

      client.connect();
      await vi.waitFor(() => expect(events.length).toBe(1));
      client.close();

      expect(events[0]).toEqual({ data: 'line1\nline2\nline3' });
      cleanup();
    });

    it('should parse event type', async () => {
      const { mockFetch, createMockResponse, cleanup } = createTestFixture();
      const events: SseEvent[] = [];
      mockFetch.mockResolvedValueOnce(
        createMockResponse(['event: message\ndata: payload\n\n'])
      );

      const client = new SseClient('http://localhost/events', {
        onEvent: (e) => events.push(e),
      });

      client.connect();
      await vi.waitFor(() => expect(events.length).toBe(1));
      client.close();

      expect(events[0]).toEqual({ event: 'message', data: 'payload' });
      cleanup();
    });

    it('should parse event id and track lastEventId', async () => {
      const { mockFetch, createMockResponse, cleanup } = createTestFixture();
      const events: SseEvent[] = [];
      mockFetch.mockResolvedValueOnce(
        createMockResponse(['id: 123\ndata: first\n\n', 'id: 124\ndata: second\n\n'])
      );

      const client = new SseClient('http://localhost/events', {
        onEvent: (e) => events.push(e),
      });

      client.connect();
      await vi.waitFor(() => expect(events.length).toBe(2));
      client.close();

      expect(events[0]).toEqual({ id: '123', data: 'first' });
      expect(events[1]).toEqual({ id: '124', data: 'second' });
      cleanup();
    });

    it('should handle chunked data across multiple reads', async () => {
      const { mockFetch, createMockResponse, cleanup } = createTestFixture();
      const events: SseEvent[] = [];
      mockFetch.mockResolvedValueOnce(
        createMockResponse(['data: hel', 'lo\n\n'])
      );

      const client = new SseClient('http://localhost/events', {
        onEvent: (e) => events.push(e),
      });

      client.connect();
      await vi.waitFor(() => expect(events.length).toBe(1));
      client.close();

      expect(events[0]).toEqual({ data: 'hello' });
      cleanup();
    });

    it('should ignore comment lines', async () => {
      const { mockFetch, createMockResponse, cleanup } = createTestFixture();
      const events: SseEvent[] = [];
      mockFetch.mockResolvedValueOnce(
        createMockResponse([': this is a comment\ndata: actual data\n\n'])
      );

      const client = new SseClient('http://localhost/events', {
        onEvent: (e) => events.push(e),
      });

      client.connect();
      await vi.waitFor(() => expect(events.length).toBe(1));
      client.close();

      expect(events[0]).toEqual({ data: 'actual data' });
      cleanup();
    });

    it('should handle data with colon in value', async () => {
      const { mockFetch, createMockResponse, cleanup } = createTestFixture();
      const events: SseEvent[] = [];
      mockFetch.mockResolvedValueOnce(
        createMockResponse(['data: key: value\n\n'])
      );

      const client = new SseClient('http://localhost/events', {
        onEvent: (e) => events.push(e),
      });

      client.connect();
      await vi.waitFor(() => expect(events.length).toBe(1));
      client.close();

      expect(events[0]).toEqual({ data: 'key: value' });
      cleanup();
    });

    it('should handle field without value', async () => {
      const { mockFetch, createMockResponse, cleanup } = createTestFixture();
      const events: SseEvent[] = [];
      mockFetch.mockResolvedValueOnce(createMockResponse(['data\n\n']));

      const client = new SseClient('http://localhost/events', {
        onEvent: (e) => events.push(e),
      });

      client.connect();
      await vi.waitFor(() => expect(events.length).toBe(1));
      client.close();

      expect(events[0]).toEqual({ data: '' });
      cleanup();
    });

    it('should handle multiple events in sequence', async () => {
      const { mockFetch, createMockResponse, cleanup } = createTestFixture();
      const events: SseEvent[] = [];
      mockFetch.mockResolvedValueOnce(
        createMockResponse(['data: first\n\ndata: second\n\ndata: third\n\n'])
      );

      const client = new SseClient('http://localhost/events', {
        onEvent: (e) => events.push(e),
      });

      client.connect();
      await vi.waitFor(() => expect(events.length).toBe(3));
      client.close();

      expect(events[0]).toEqual({ data: 'first' });
      expect(events[1]).toEqual({ data: 'second' });
      expect(events[2]).toEqual({ data: 'third' });
      cleanup();
    });

    it('should handle JSON data', async () => {
      const { mockFetch, createMockResponse, cleanup } = createTestFixture();
      const events: SseEvent[] = [];
      const jsonPayload = JSON.stringify({ type: 'message', content: 'hello' });
      mockFetch.mockResolvedValueOnce(
        createMockResponse([`data: ${jsonPayload}\n\n`])
      );

      const client = new SseClient('http://localhost/events', {
        onEvent: (e) => events.push(e),
      });

      client.connect();
      await vi.waitFor(() => expect(events.length).toBe(1));
      client.close();

      expect(events[0]).toEqual({ data: jsonPayload });
      expect(JSON.parse(events[0].data)).toEqual({ type: 'message', content: 'hello' });
      cleanup();
    });
  });

  describe('close behavior', () => {
    it('should stop processing after close is called', async () => {
      const { mockFetch, cleanup } = createTestFixture();
      const events: SseEvent[] = [];
      
      let resolveStream: () => void;
      const streamPromise = new Promise<void>((resolve) => {
        resolveStream = resolve;
      });

      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode('data: test\n\n'));
          streamPromise.then(() => controller.close());
        },
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: stream,
      });

      const client = new SseClient('http://localhost/events', {
        onEvent: (e) => events.push(e),
      });

      client.connect();
      await vi.waitFor(() => expect(events.length).toBe(1));
      
      client.close();
      resolveStream!();
      
      expect(events.length).toBe(1);
      cleanup();
    });
  });

  describe('error handling', () => {
    it('should handle non-ok response', async () => {
      const { mockFetch, createMockResponse, cleanup } = createTestFixture();
      mockFetch.mockResolvedValueOnce(createMockResponse([], 500));

      const client = new SseClient('http://localhost/events', {
        onEvent: () => {},
        initialRetryMs: 100000,
      });

      client.connect();
      
      await new Promise((r) => setTimeout(r, 50));
      client.close();
      cleanup();
    });
  });
});
