import Mention from "@tiptap/extension-mention";
import { mergeAttributes } from "@tiptap/core";

export interface FileMentionOptions {
  HTMLAttributes: Record<string, unknown>;
  suggestion: Record<string, unknown>;
}

export function normalizeFileMentionLabel(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/^@+/, "");
}

export function formatFileMentionText(value: string | null | undefined): string {
  return `@${normalizeFileMentionLabel(value)}`;
}

export const FileMention = Mention.extend<FileMentionOptions>({
  name: "fileMention",

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-path"),
        renderHTML: (attributes) => {
          if (!attributes.id) {
            return {};
          }
          return {
            "data-path": attributes.id,
          };
        },
      },
      label: {
        default: null,
        parseHTML: (element) => normalizeFileMentionLabel(element.textContent),
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: `span[data-type="${this.name}"]`,
      },
      {
        tag: "span.file-mention",
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const label = normalizeFileMentionLabel(
      (node.attrs.label as string | null | undefined) ?? (node.attrs.id as string | null | undefined)
    );

    return [
      "span",
      mergeAttributes(
        { "data-type": this.name },
        { class: "file-chip file-mention" },
        this.options.HTMLAttributes,
        HTMLAttributes
      ),
      formatFileMentionText(label),
    ];
  },
});
