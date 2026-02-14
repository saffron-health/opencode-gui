import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HostMessage } from "./shared/messages";

const mocks = vi.hoisted(() => ({
  findFiles: vi.fn(),
  asRelativePath: vi.fn(),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("vscode", () => {
  class RelativePattern {
    constructor(
      public readonly base: string,
      public readonly pattern: string
    ) {}
  }

  return {
    workspace: {
      findFiles: mocks.findFiles,
      asRelativePath: mocks.asRelativePath,
    },
    RelativePattern,
  };
});

vi.mock("./extension", () => ({
  getLogger: () => mocks.logger,
}));

import { OpenCodeViewProvider } from "./OpenCodeViewProvider";

type UriLike = {
  relativePath: string;
  toString: () => string;
};

function makeUri(relativePath: string): UriLike {
  return {
    relativePath,
    toString: () => `file:///workspace/${relativePath}`,
  };
}

function createProvider(workspaceRoot = "/workspace") {
  const service = {
    getWorkspaceRoot: vi.fn(() => workspaceRoot),
  } as unknown as ConstructorParameters<typeof OpenCodeViewProvider>[1];

  const globalState = {
    get: vi.fn(),
    update: vi.fn(),
  } as unknown as ConstructorParameters<typeof OpenCodeViewProvider>[2];

  const provider = new OpenCodeViewProvider({} as never, service, globalState);

  const messages: HostMessage[] = [];
  (provider as unknown as { _sendMessage: (msg: HostMessage) => void })._sendMessage = (
    msg: HostMessage
  ) => {
    messages.push(msg);
  };

  return { provider, messages };
}

describe("OpenCodeViewProvider mention-search", () => {
  beforeEach(() => {
    mocks.findFiles.mockReset();
    mocks.asRelativePath.mockReset();
    mocks.logger.error.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("Given blank query, When searching mentions, Then returns empty results without workspace scan", async () => {
    const { provider, messages } = createProvider();

    await (
      provider as unknown as {
        _handleMentionSearch: (
          requestId: string,
          query: string,
          limit?: number
        ) => Promise<void>;
      }
    )._handleMentionSearch("req-empty", "   ", 20);

    expect(mocks.findFiles).not.toHaveBeenCalled();
    expect(messages).toEqual([
      {
        type: "mention-results",
        requestId: "req-empty",
        items: [],
      },
    ]);
  });

  it("Given matching files, When searching with limit, Then returns ranked and limited mention results", async () => {
    const { provider, messages } = createProvider();
    const uris = [
      makeUri("src/App.tsx"),
      makeUri("src/components/AppPanel.tsx"),
      makeUri("docs/guide.md"),
    ];
    mocks.findFiles.mockResolvedValue(uris);
    mocks.asRelativePath.mockImplementation((uri: UriLike) => uri.relativePath);

    await (
      provider as unknown as {
        _handleMentionSearch: (
          requestId: string,
          query: string,
          limit?: number
        ) => Promise<void>;
      }
    )._handleMentionSearch("req-ranked", "src/app", 1);

    expect(mocks.findFiles).toHaveBeenCalledTimes(1);
    expect(mocks.findFiles.mock.calls[0][0].pattern).toBe("**/*app*");
    expect(mocks.findFiles.mock.calls[0][2]).toBeUndefined();
    expect(messages).toEqual([
      {
        type: "mention-results",
        requestId: "req-ranked",
        items: [
          {
            id: "file:///workspace/src/App.tsx",
            filePath: "src/App.tsx",
            fileUrl: "file:///workspace/src/App.tsx",
          },
        ],
      },
    ]);
  });

  it("Given query has glob special chars, When building search include, Then special chars are escaped", async () => {
    const { provider } = createProvider();
    mocks.findFiles.mockResolvedValue([]);
    mocks.asRelativePath.mockImplementation((uri: UriLike) => uri.relativePath);

    await (
      provider as unknown as {
        _handleMentionSearch: (
          requestId: string,
          query: string,
          limit?: number
        ) => Promise<void>;
      }
    )._handleMentionSearch("req-glob", "src/[App]{1}", 20);

    expect(mocks.findFiles).toHaveBeenCalledTimes(1);
    expect(mocks.findFiles.mock.calls[0][0].pattern).toBe("**/*\\[app\\]\\{1\\}*");
    expect(mocks.findFiles.mock.calls[0][2]).toBeUndefined();
  });

  it("Given workspace search throws, When searching mentions, Then returns empty results and logs error", async () => {
    const { provider, messages } = createProvider();
    mocks.findFiles.mockRejectedValue(new Error("boom"));

    await (
      provider as unknown as {
        _handleMentionSearch: (
          requestId: string,
          query: string,
          limit?: number
        ) => Promise<void>;
      }
    )._handleMentionSearch("req-error", "app", 20);

    expect(mocks.logger.error).toHaveBeenCalledTimes(1);
    expect(messages).toEqual([
      {
        type: "mention-results",
        requestId: "req-error",
        items: [],
      },
    ]);
  });
});
