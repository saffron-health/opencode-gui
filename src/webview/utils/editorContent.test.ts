import { describe, it, expect } from "vitest";
import { extractMentions } from "./editorContent";
import type { JSONContent } from "@tiptap/core";

describe("extractMentions", () => {
  it("extracts file mentions from editor JSON", () => {
    const json: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Check out " },
            { type: "fileMention", attrs: { id: "src/index.ts", label: "index.ts" } },
            { type: "text", text: " and " },
            { type: "fileMention", attrs: { id: "src/App.tsx", label: "App.tsx" } },
          ],
        },
      ],
    };

    const mentions = extractMentions(json);
    expect(mentions).toEqual(["src/index.ts", "src/App.tsx"]);
  });

  it("returns empty array when no mentions", () => {
    const json: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Just plain text" }],
        },
      ],
    };

    const mentions = extractMentions(json);
    expect(mentions).toEqual([]);
  });

  it("extracts mentions from nested content", () => {
    const json: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "First paragraph with " },
            { type: "fileMention", attrs: { id: "file1.ts", label: "file1" } },
          ],
        },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Second paragraph with " },
            { type: "fileMention", attrs: { id: "file2.ts", label: "file2" } },
          ],
        },
      ],
    };

    const mentions = extractMentions(json);
    expect(mentions).toEqual(["file1.ts", "file2.ts"]);
  });

  it("handles mentions without label", () => {
    const json: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "fileMention", attrs: { id: "package.json" } }],
        },
      ],
    };

    const mentions = extractMentions(json);
    expect(mentions).toEqual(["package.json"]);
  });

  it("skips mentions without id attribute", () => {
    const json: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "fileMention", attrs: { label: "broken" } },
            { type: "fileMention", attrs: { id: "valid.ts", label: "valid" } },
          ],
        },
      ],
    };

    const mentions = extractMentions(json);
    expect(mentions).toEqual(["valid.ts"]);
  });
});
