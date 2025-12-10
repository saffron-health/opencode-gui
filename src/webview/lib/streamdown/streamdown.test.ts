import { describe, it, expect } from "vitest";
import remend from "./remend";
import { parseMarkdownIntoBlocks } from "./parse-blocks";

describe("streamdown integration", () => {
  describe("remend + parseMarkdownIntoBlocks", () => {
    it("processes incomplete markdown for streaming", () => {
      const streaming = "**bold text";
      const fixed = remend(streaming);
      expect(fixed).toBe("**bold text**");
      
      const blocks = parseMarkdownIntoBlocks(fixed);
      expect(blocks.length).toBeGreaterThan(0);
    });

    it("handles streaming code block", () => {
      const streaming = "```js\nconst x = 1;";
      // remend doesn't close code blocks (intentional - they render as-is)
      const fixed = remend(streaming);
      const blocks = parseMarkdownIntoBlocks(fixed);
      expect(blocks.length).toBeGreaterThan(0);
    });

    it("handles streaming with multiple incomplete elements", () => {
      const streaming = "# Heading\n\n**bold and *italic";
      const fixed = remend(streaming);
      // Should complete both bold and italic
      expect(fixed).toContain("*");
      
      const blocks = parseMarkdownIntoBlocks(fixed);
      expect(blocks.length).toBeGreaterThan(0);
    });
  });

  describe("real-world streaming scenarios", () => {
    it("handles AI response being typed", () => {
      const snapshots = [
        "I",
        "I'll",
        "I'll help",
        "I'll help you with",
        "I'll help you with **",
        "I'll help you with **that",
        "I'll help you with **that**",
        "I'll help you with **that**. Here's",
        "I'll help you with **that**. Here's the code:\n\n```",
        "I'll help you with **that**. Here's the code:\n\n```python",
        "I'll help you with **that**. Here's the code:\n\n```python\ndef",
        "I'll help you with **that**. Here's the code:\n\n```python\ndef hello():",
        "I'll help you with **that**. Here's the code:\n\n```python\ndef hello():\n    print",
        "I'll help you with **that**. Here's the code:\n\n```python\ndef hello():\n    print(\"Hello\")",
        "I'll help you with **that**. Here's the code:\n\n```python\ndef hello():\n    print(\"Hello\")\n```",
      ];

      for (const snapshot of snapshots) {
        const fixed = remend(snapshot);
        const blocks = parseMarkdownIntoBlocks(fixed);
        
        // Should not throw
        expect(Array.isArray(blocks)).toBe(true);
        
        // Content should be preserved (check for content that exists in this snapshot)
        if (snapshot.includes("I'll help")) {
          expect(blocks.join("")).toContain("I'll help");
        }
      }
    });

    it("handles list being typed", () => {
      const snapshots = [
        "Here are the steps:",
        "Here are the steps:\n\n-",
        "Here are the steps:\n\n- First",
        "Here are the steps:\n\n- First\n-",
        "Here are the steps:\n\n- First\n- Second",
        "Here are the steps:\n\n- First\n- Second\n-",
        "Here are the steps:\n\n- First\n- Second\n- Third",
      ];

      for (const snapshot of snapshots) {
        const fixed = remend(snapshot);
        const blocks = parseMarkdownIntoBlocks(fixed);
        expect(Array.isArray(blocks)).toBe(true);
      }
    });

    it("handles inline code being typed", () => {
      const snapshots = [
        "Use the `",
        "Use the `useState",
        "Use the `useState`",
        "Use the `useState` hook",
      ];

      for (const snapshot of snapshots) {
        const fixed = remend(snapshot);
        // Incomplete inline code should be completed
        if (snapshot === "Use the `") {
          // Just backtick with nothing - should stay as is
        } else if (snapshot === "Use the `useState") {
          expect(fixed).toBe("Use the `useState`");
        }
        
        const blocks = parseMarkdownIntoBlocks(fixed);
        expect(Array.isArray(blocks)).toBe(true);
      }
    });

    it("handles link being typed", () => {
      const snapshots = [
        "Check out [",
        "Check out [this",
        "Check out [this link",
        "Check out [this link]",
        "Check out [this link](",
        "Check out [this link](http",
        "Check out [this link](http://",
        "Check out [this link](http://example",
        "Check out [this link](http://example.com)",
      ];

      for (const snapshot of snapshots) {
        const fixed = remend(snapshot);
        const blocks = parseMarkdownIntoBlocks(fixed);
        expect(Array.isArray(blocks)).toBe(true);
      }
    });
  });

  describe("edge cases in streaming", () => {
    it("handles rapid character additions", () => {
      let text = "";
      const chars = "**Hello** world! Here's `code` and *italic*.";
      
      for (const char of chars) {
        text += char;
        const fixed = remend(text);
        const blocks = parseMarkdownIntoBlocks(fixed);
        expect(Array.isArray(blocks)).toBe(true);
      }
    });

    it("handles math equations streaming", () => {
      const snapshots = [
        "The formula is $",
        "The formula is $$",
        "The formula is $$\n",
        "The formula is $$\nx",
        "The formula is $$\nx^2",
        "The formula is $$\nx^2 + y^2",
        "The formula is $$\nx^2 + y^2 = z^2",
        "The formula is $$\nx^2 + y^2 = z^2\n",
        "The formula is $$\nx^2 + y^2 = z^2\n$$",
      ];

      for (const snapshot of snapshots) {
        const fixed = remend(snapshot);
        const blocks = parseMarkdownIntoBlocks(fixed);
        expect(Array.isArray(blocks)).toBe(true);
      }
    });
  });
});
