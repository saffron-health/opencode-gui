import { describe, expect, it } from "vitest";
import {
  encodeFileMentionReference,
  formatFileMentionLabel,
  parseFileMentionReference,
} from "./fileMentionReference";

describe("fileMentionReference", () => {
  it("encodes range references", () => {
    expect(
      encodeFileMentionReference({
        filePath: "src/App.tsx",
        startLine: 5,
        endLine: 8,
      })
    ).toBe("src/App.tsx#L5-8");
  });

  it("encodes single line references", () => {
    expect(
      encodeFileMentionReference({
        filePath: "src/App.tsx",
        startLine: 12,
      })
    ).toBe("src/App.tsx#L12");
  });

  it("parses encoded range references", () => {
    expect(parseFileMentionReference("src/App.tsx#L9-3")).toEqual({
      filePath: "src/App.tsx",
      startLine: 3,
      endLine: 9,
    });
  });

  it("parses plain path references", () => {
    expect(parseFileMentionReference("src/App.tsx")).toEqual({
      filePath: "src/App.tsx",
    });
  });

  it("formats labels with line ranges", () => {
    expect(
      formatFileMentionLabel({
        filePath: "src/App.tsx",
        startLine: 2,
        endLine: 4,
      })
    ).toBe("src/App.tsx L2-4");
  });
});
