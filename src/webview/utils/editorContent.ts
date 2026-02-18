import type { JSONContent } from "@tiptap/core";

export function extractMentions(json: JSONContent): string[] {
  const mentions: string[] = [];

  function walk(node: JSONContent) {
    // Check if this is a mention node (either "mention" or "fileMention")
    if ((node.type === "mention" || node.type === "fileMention") && node.attrs?.id) {
      mentions.push(node.attrs.id as string);
    }

    // Recursively walk children
    if (node.content && Array.isArray(node.content)) {
      for (const child of node.content) {
        walk(child);
      }
    }
  }

  walk(json);
  return mentions;
}
