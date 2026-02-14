import { describe, expect, it } from "vitest";
import {
  filePathMatchesMentionQuery,
  mentionMatchScore,
  normalizeMentionQuery,
} from "./mentionSearch";

describe("normalizeMentionQuery", () => {
  it("Given mixed slash and uppercase query, When normalized, Then result is lowercase unix-style path", () => {
    expect(normalizeMentionQuery("  Src\\WebView  ")).toBe("src/webview");
  });
});

describe("filePathMatchesMentionQuery", () => {
  it("Given file path includes query, When matching, Then returns true", () => {
    expect(filePathMatchesMentionQuery("src/webview/App.tsx", "webview/app")).toBe(true);
  });

  it("Given empty query, When matching, Then returns false", () => {
    expect(filePathMatchesMentionQuery("src/webview/App.tsx", "")).toBe(false);
  });
});

describe("mentionMatchScore", () => {
  it("Given exact filename match, When scored, Then it gets highest priority", () => {
    const exact = mentionMatchScore("src/README.md", "readme.md");
    const partial = mentionMatchScore("src/docs/readme-guide.md", "readme");
    expect(exact).toBeLessThan(partial);
  });

  it("Given filename prefix and deep path match, When scored, Then filename prefix ranks higher", () => {
    const prefix = mentionMatchScore("src/webview/InputBar.tsx", "input");
    const deep = mentionMatchScore("src/ui/components/mention-input.tsx", "input");
    expect(prefix).toBeLessThan(deep);
  });
});
