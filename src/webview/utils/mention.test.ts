import { describe, expect, it } from "vitest";
import { applyMentionToken, findMentionTokenAtCursor } from "./mention";

describe("findMentionTokenAtCursor", () => {
  it("Given cursor after mention token, When token is valid, Then returns token range and query", () => {
    const text = "Read @src/webview/App.tsx please";
    const cursor = "Read @src/webview/App.tsx".length;
    const token = findMentionTokenAtCursor(text, cursor);

    expect(token).toEqual({
      start: 5,
      end: cursor,
      query: "src/webview/App.tsx",
    });
  });

  it("Given email-like text, When @ is in the middle of a word, Then returns null", () => {
    const text = "contact me at foo@bar.com";
    const token = findMentionTokenAtCursor(text, text.length);
    expect(token).toBeNull();
  });

  it("Given mention was already terminated by whitespace, When cursor moved forward, Then returns null", () => {
    const text = "Open @README.md now";
    const cursor = text.length;
    const token = findMentionTokenAtCursor(text, cursor);
    expect(token).toBeNull();
  });

  it("Given user just typed @, When cursor is at token end, Then returns empty query token", () => {
    const text = "@";
    const token = findMentionTokenAtCursor(text, 1);
    expect(token).toEqual({ start: 0, end: 1, query: "" });
  });
});

describe("applyMentionToken", () => {
  it("Given active mention token, When user selects a file, Then token is replaced and caret moves after mention", () => {
    const text = "Open @rea now";
    const token = findMentionTokenAtCursor(text, "Open @rea".length);
    expect(token).not.toBeNull();

    const result = applyMentionToken(text, token!, "README.md");
    expect(result.text).toBe("Open @README.md now");
    expect(result.cursor).toBe("Open @README.md".length);
  });

  it("Given next char is already a space, When applying replacement, Then no extra space is inserted", () => {
    const text = "Open @rea file";
    const token = findMentionTokenAtCursor(text, "Open @rea".length);
    expect(token).not.toBeNull();

    const result = applyMentionToken(text, token!, "README.md");
    expect(result.text).toBe("Open @README.md file");
  });
});
