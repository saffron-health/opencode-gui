import Mention from "@tiptap/extension-mention";
import { mergeAttributes } from "@tiptap/core";

export interface FileMentionOptions {
  HTMLAttributes: Record<string, unknown>;
  suggestion: Record<string, unknown>;
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
        parseHTML: (element) => element.textContent,
        renderHTML: (attributes) => {
          return {};
        },
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
    return [
      "span",
      mergeAttributes(
        { "data-type": this.name },
        { class: "file-mention" },
        this.options.HTMLAttributes,
        HTMLAttributes
      ),
      `@${node.attrs.label || node.attrs.id}`,
    ];
  },
});
