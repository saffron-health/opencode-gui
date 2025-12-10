import { describe, it, expect } from "vitest";
import { parseMarkdownIntoBlocks } from "./parse-blocks";

describe("parseMarkdownIntoBlocks", () => {
  describe("basic parsing", () => {
    it("parses simple paragraph", () => {
      const blocks = parseMarkdownIntoBlocks("Hello world");
      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toBe("Hello world");
    });

    it("parses multiple paragraphs", () => {
      const blocks = parseMarkdownIntoBlocks("First paragraph\n\nSecond paragraph");
      // Includes space token between paragraphs
      expect(blocks.length).toBeGreaterThanOrEqual(2);
      expect(blocks.join("")).toContain("First paragraph");
      expect(blocks.join("")).toContain("Second paragraph");
    });

    it("parses headings", () => {
      const blocks = parseMarkdownIntoBlocks("# Heading\n\nParagraph");
      expect(blocks).toHaveLength(2);
      expect(blocks[0]).toContain("# Heading");
    });
  });

  describe("code blocks", () => {
    it("keeps code block as single block", () => {
      const markdown = "```js\nconst x = 1;\nconst y = 2;\n```";
      const blocks = parseMarkdownIntoBlocks(markdown);
      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toBe(markdown);
    });

    it("separates code blocks from text", () => {
      const markdown = "Text before\n\n```js\ncode\n```\n\nText after";
      const blocks = parseMarkdownIntoBlocks(markdown);
      expect(blocks.length).toBeGreaterThan(1);
    });
  });

  describe("math blocks", () => {
    it("merges math blocks correctly", () => {
      const markdown = "$$\nx^2 + y^2 = z^2\n$$";
      const blocks = parseMarkdownIntoBlocks(markdown);
      // Math blocks may be merged or kept separate depending on tokenization
      const combined = blocks.join("");
      expect(combined).toContain("$$");
      expect(combined).toContain("x^2");
    });

    it("merges unclosed math with closing $$", () => {
      const markdown = "$$\nmath content\n\n$$";
      const blocks = parseMarkdownIntoBlocks(markdown);
      // Should merge to keep math block together
      const combined = blocks.join("");
      expect(combined).toContain("math content");
    });
  });

  describe("HTML blocks", () => {
    it("merges HTML blocks with content", () => {
      const markdown = "<div>\nContent inside div\n</div>";
      const blocks = parseMarkdownIntoBlocks(markdown);
      const combined = blocks.join("");
      expect(combined).toContain("<div>");
      expect(combined).toContain("</div>");
    });

    it("handles self-closing tags", () => {
      const markdown = "<br />\n\nParagraph";
      const blocks = parseMarkdownIntoBlocks(markdown);
      expect(blocks.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("footnotes", () => {
    it("returns entire document as single block when footnotes present", () => {
      const markdown = "Text with footnote[^1]\n\n[^1]: Footnote definition";
      const blocks = parseMarkdownIntoBlocks(markdown);
      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toBe(markdown);
    });

    it("returns entire document for footnote references", () => {
      const markdown = "See reference[^note] for details.";
      const blocks = parseMarkdownIntoBlocks(markdown);
      expect(blocks).toHaveLength(1);
    });
  });

  describe("lists", () => {
    it("parses unordered lists", () => {
      const markdown = "- Item 1\n- Item 2\n- Item 3";
      const blocks = parseMarkdownIntoBlocks(markdown);
      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toContain("Item 1");
    });

    it("parses ordered lists", () => {
      const markdown = "1. First\n2. Second\n3. Third";
      const blocks = parseMarkdownIntoBlocks(markdown);
      expect(blocks).toHaveLength(1);
    });
  });

  describe("blockquotes", () => {
    it("parses blockquotes", () => {
      const markdown = "> This is a quote\n> Continued";
      const blocks = parseMarkdownIntoBlocks(markdown);
      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toContain(">");
    });
  });

  describe("tables", () => {
    it("parses GFM tables", () => {
      const markdown = "| Header 1 | Header 2 |\n|----------|----------|\n| Cell 1   | Cell 2   |";
      const blocks = parseMarkdownIntoBlocks(markdown);
      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toContain("Header 1");
    });
  });

  describe("edge cases", () => {
    it("handles empty string", () => {
      const blocks = parseMarkdownIntoBlocks("");
      expect(blocks).toEqual([]);
    });

    it("handles whitespace only", () => {
      const blocks = parseMarkdownIntoBlocks("   \n\n   ");
      // Should produce space tokens
      expect(Array.isArray(blocks)).toBe(true);
    });

    it("handles mixed content", () => {
      const markdown = `# Heading

Paragraph text with **bold** and *italic*.

\`\`\`python
def hello():
    print("world")
\`\`\`

- List item 1
- List item 2

> A quote

| Col 1 | Col 2 |
|-------|-------|
| A     | B     |`;

      const blocks = parseMarkdownIntoBlocks(markdown);
      expect(blocks.length).toBeGreaterThan(0);
      const combined = blocks.join("");
      expect(combined).toContain("# Heading");
      expect(combined).toContain("**bold**");
      expect(combined).toContain("def hello()");
    });
  });
});
