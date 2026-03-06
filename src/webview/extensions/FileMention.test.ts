import { describe, it, expect } from "vitest";
import {
  FileMention,
  normalizeFileMentionLabel,
  formatFileMentionText,
} from "./FileMention";

describe("FileMention", () => {
  it("exports a Tiptap extension", () => {
    expect(FileMention).toBeDefined();
    expect(FileMention.name).toBe("fileMention");
  });

  it("can be configured", () => {
    const extension = FileMention.configure();
    expect(extension.name).toBe("fileMention");
  });

  it("has parseHTML and renderHTML defined", () => {
    const extension = FileMention.configure();
    expect(extension.config.parseHTML).toBeDefined();
    expect(extension.config.renderHTML).toBeDefined();
  });

  it("strips leading @ from parsed labels", () => {
    expect(normalizeFileMentionLabel("@src/index.ts")).toBe("src/index.ts");
    expect(normalizeFileMentionLabel("@@src/index.ts")).toBe("src/index.ts");
    expect(normalizeFileMentionLabel("src/index.ts")).toBe("src/index.ts");
  });

  it("formats mention text with exactly one leading @", () => {
    expect(formatFileMentionText("@src/index.ts")).toBe("@src/index.ts");
    expect(formatFileMentionText("@@src/index.ts")).toBe("@src/index.ts");
    expect(formatFileMentionText("src/index.ts")).toBe("@src/index.ts");
  });
});
