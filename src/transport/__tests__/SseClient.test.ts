import { test as base, describe, expect, vi } from 'vitest';
import { SseClient, SseEvent } from '../SseClient';

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

interface TestFixtures {
  mockFetch: ReturnType<typeof vi.fn>;
}

const test = base.extend<TestFixtures>({
  mockFetch: async ({}, use) => {
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    await use(mockFetch);
    vi.restoreAllMocks();
  },
});

describe('SseClient', () => {
  describe('SSE parsing', () => {
    test('should parse simple data events', async ({ mockFetch }) => {
      const events: SseEvent[] = [];
      mockFetch.mockResolvedValueOnce(createMockResponse(['data: hello\n\n']));

      const client = new SseClient('http://localhost/events', {
        onEvent: (e) => events.push(e),
      });

      client.connect();
      await vi.waitFor(() => expect(events.length).toBe(1));
      client.close();

      expect(events[0]).toEqual({ data: 'hello' });
    });

    test('should parse multiline data events', async ({ mockFetch }) => {
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
    });

    test('should parse event type', async ({ mockFetch }) => {
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
    });

    test('should parse event id and track lastEventId', async ({ mockFetch }) => {
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
    });

    test('should handle chunked data across multiple reads', async ({ mockFetch }) => {
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
    });

    test('should ignore comment lines', async ({ mockFetch }) => {
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
    });

    test('should handle data with colon in value', async ({ mockFetch }) => {
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
    });

    test('should handle field without value', async ({ mockFetch }) => {
      const events: SseEvent[] = [];
      mockFetch.mockResolvedValueOnce(createMockResponse(['data\n\n']));

      const client = new SseClient('http://localhost/events', {
        onEvent: (e) => events.push(e),
      });

      client.connect();
      await vi.waitFor(() => expect(events.length).toBe(1));
      client.close();

      expect(events[0]).toEqual({ data: '' });
    });

    test('should handle multiple events in sequence', async ({ mockFetch }) => {
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
    });

    test('should handle JSON data', async ({ mockFetch }) => {
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
    });
  });

  describe('close behavior', () => {
    test('should stop processing after close is called', async ({ mockFetch }) => {
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
    });
  });

  describe('retry directive', () => {
    test('should parse and honor server retry directive', async ({ mockFetch }) => {
      const events: SseEvent[] = [];
      
      mockFetch
        .mockResolvedValueOnce(createMockResponse(['retry: 5000\ndata: first\n\n']))
        .mockResolvedValueOnce(createMockResponse(['data: second\n\n']));

      const client = new SseClient('http://localhost/events', {
        onEvent: (e) => events.push(e),
        initialRetryMs: 1000,
      });

      client.connect();
      await vi.waitFor(() => expect(events.length).toBe(1));
      
      expect(events[0]).toEqual({ data: 'first' });
      client.close();
    });

    test('should ignore invalid retry values', async ({ mockFetch }) => {
      const events: SseEvent[] = [];
      mockFetch.mockResolvedValueOnce(
        createMockResponse(['retry: invalid\ndata: test\n\n'])
      );

      const client = new SseClient('http://localhost/events', {
        onEvent: (e) => events.push(e),
      });

      client.connect();
      await vi.waitFor(() => expect(events.length).toBe(1));
      client.close();

      expect(events[0]).toEqual({ data: 'test' });
    });

    test('should ignore negative retry values', async ({ mockFetch }) => {
      const events: SseEvent[] = [];
      mockFetch.mockResolvedValueOnce(
        createMockResponse(['retry: -1000\ndata: test\n\n'])
      );

      const client = new SseClient('http://localhost/events', {
        onEvent: (e) => events.push(e),
      });

      client.connect();
      await vi.waitFor(() => expect(events.length).toBe(1));
      client.close();

      expect(events[0]).toEqual({ data: 'test' });
    });
  });

  describe('chunked input edge cases', () => {
    test('should handle event split across many small chunks', async ({ mockFetch }) => {
      const events: SseEvent[] = [];
      const chunks = 'data: hello\n\n'.split('');
      mockFetch.mockResolvedValueOnce(createMockResponse(chunks));

      const client = new SseClient('http://localhost/events', {
        onEvent: (e) => events.push(e),
      });

      client.connect();
      await vi.waitFor(() => expect(events.length).toBe(1));
      client.close();

      expect(events[0]).toEqual({ data: 'hello' });
    });

    test('should handle chunk boundary at field separator', async ({ mockFetch }) => {
      const events: SseEvent[] = [];
      mockFetch.mockResolvedValueOnce(
        createMockResponse(['event:', ' message\ndata: payload\n\n'])
      );

      const client = new SseClient('http://localhost/events', {
        onEvent: (e) => events.push(e),
      });

      client.connect();
      await vi.waitFor(() => expect(events.length).toBe(1));
      client.close();

      expect(events[0]).toEqual({ event: 'message', data: 'payload' });
    });

    test('should handle CRLF line endings', async ({ mockFetch }) => {
      const events: SseEvent[] = [];
      mockFetch.mockResolvedValueOnce(
        createMockResponse(['data: hello\r\n\r\n'])
      );

      const client = new SseClient('http://localhost/events', {
        onEvent: (e) => events.push(e),
      });

      client.connect();
      await vi.waitFor(() => expect(events.length).toBe(1));
      client.close();

      expect(events[0]).toEqual({ data: 'hello' });
    });

    test('should handle mixed LF and CRLF line endings', async ({ mockFetch }) => {
      const events: SseEvent[] = [];
      mockFetch.mockResolvedValueOnce(
        createMockResponse(['event: test\r\ndata: hello\n\n'])
      );

      const client = new SseClient('http://localhost/events', {
        onEvent: (e) => events.push(e),
      });

      client.connect();
      await vi.waitFor(() => expect(events.length).toBe(1));
      client.close();

      expect(events[0]).toEqual({ event: 'test', data: 'hello' });
    });
  });

  describe('reconnection', () => {
    test('should send Last-Event-ID header on reconnect', async ({ mockFetch }) => {
      const events: SseEvent[] = [];
      
      mockFetch
        .mockResolvedValueOnce(createMockResponse(['id: evt-123\ndata: first\n\n']))
        .mockImplementation(() => new Promise(() => {}));

      const client = new SseClient('http://localhost/events', {
        onEvent: (e) => events.push(e),
        initialRetryMs: 10,
      });

      client.connect();
      
      await vi.waitFor(() => expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(2), { timeout: 1000 });
      client.close();

      const secondCall = mockFetch.mock.calls[1];
      expect(secondCall[1].headers['Last-Event-ID']).toBe('evt-123');
    });
  });

  describe('error handling', () => {
    test('should handle non-ok response', async ({ mockFetch }) => {
      mockFetch.mockResolvedValueOnce(createMockResponse([], 500));

      const client = new SseClient('http://localhost/events', {
        onEvent: () => {},
        initialRetryMs: 100000,
      });

      client.connect();
      
      await new Promise((r) => setTimeout(r, 50));
      client.close();
    });

    test('should attempt reconnect after fetch error', async ({ mockFetch }) => {
      let fetchCallCount = 0;
      
      mockFetch.mockImplementation(() => {
        fetchCallCount++;
        if (fetchCallCount === 1) {
          return Promise.reject(new Error('Network error'));
        }
        return new Promise(() => {});
      });

      const client = new SseClient('http://localhost/events', {
        onEvent: () => {},
        initialRetryMs: 10,
      });

      client.connect();
      
      await vi.waitFor(() => {
        expect(fetchCallCount).toBeGreaterThanOrEqual(2);
      }, { timeout: 500 });
      client.close();
    });

    test('should ignore id with null character per SSE spec', async ({ mockFetch }) => {
      const events: SseEvent[] = [];
      mockFetch.mockResolvedValueOnce(
        createMockResponse(['id: bad\x00id\ndata: test\n\n'])
      );

      const client = new SseClient('http://localhost/events', {
        onEvent: (e) => events.push(e),
      });

      client.connect();
      await vi.waitFor(() => expect(events.length).toBe(1));
      client.close();

      expect(events[0]).toEqual({ data: 'test' });
      expect(events[0].id).toBeUndefined();
    });
  });
});
