import { describe, expect, it } from "vitest";
import { parseFileReferenceTarget } from "./fileReferences";

describe("parseFileReferenceTarget", () => {
  it("returns null for non-file URLs", () => {
    expect(parseFileReferenceTarget("https://example.com/file.ts")).toBeNull();
  });

  it("parses start/end from query params and strips metadata from URL", () => {
    const target = parseFileReferenceTarget("file:///tmp/example.ts?start=10&end=12");
    expect(target).toEqual({
      url: "file:///tmp/example.ts",
      startLine: 10,
      endLine: 12,
    });
  });

  it("parses line range from hash fragment", () => {
    const target = parseFileReferenceTarget("file:///tmp/example.ts#L8-L9");
    expect(target).toEqual({
      url: "file:///tmp/example.ts",
      startLine: 8,
      endLine: 9,
    });
  });

  it("parses trailing :line suffix from pathname", () => {
    const target = parseFileReferenceTarget("file:///tmp/example.ts:42");
    expect(target).toEqual({
      url: "file:///tmp/example.ts",
      startLine: 42,
      endLine: 42,
    });
  });

  it("keeps explicit line query over hash/path metadata", () => {
    const target = parseFileReferenceTarget(
      "file:///tmp/example.ts:3?start=21#L1-L2",
    );
    expect(target).toEqual({
      url: "file:///tmp/example.ts",
      startLine: 21,
      endLine: 21,
    });
  });
});
