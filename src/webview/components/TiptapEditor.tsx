import { createEffect, createSignal, onCleanup } from "solid-js";
import { createEditor, EditorContent } from "tiptap-solid";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import type { JSONContent } from "@tiptap/core";
import { FileMention } from "../extensions/FileMention";
import { createFileMentionSuggestion } from "../utils/fileMentionSuggestion";
import {
  encodeFileMentionReference,
  formatFileMentionLabel,
} from "../utils/fileMentionReference";
import "./TiptapEditor.css";

export interface TiptapEditorMethods {
  getJSON: () => JSONContent;
  setContent: (content: JSONContent | string) => void;
  clear: () => void;
  focus: () => void;
  insertFileMention: (filePath: string, startLine?: number, endLine?: number) => void;
}

export interface TiptapEditorProps {
  value: string;
  onInput: (text: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  disabled?: boolean;
  searchFiles: (query: string) => Promise<string[]>;
  onFileMentionClick?: (filePath: string) => void;
  ref?: (methods: TiptapEditorMethods) => void;
}

export function TiptapEditor(props: TiptapEditorProps) {
  const [isSuggestionActive, setIsSuggestionActive] = createSignal(false);

  const editor = createEditor({
    extensions: [
      Document,
      Paragraph,
      Text,
      FileMention.configure({
        suggestion: (() => {
          const baseSuggestion = createFileMentionSuggestion({
            searchFiles: props.searchFiles,
          });
          
          const baseRender = baseSuggestion.render;
          
          return {
            ...baseSuggestion,
            render: () => {
              const renderer = baseRender!();
              const originalOnStart = renderer.onStart;
              const originalOnExit = renderer.onExit;
              
              return {
                ...renderer,
                onStart: (suggestionProps: any) => {
                  setIsSuggestionActive(true);
                  originalOnStart?.(suggestionProps);
                },
                onExit: (suggestionProps: any) => {
                  setIsSuggestionActive(false);
                  originalOnExit?.(suggestionProps);
                },
              };
            },
          } as any;
        })(),
      }),
    ],
    autofocus: true,
    content: props.value,
    editorProps: {
      attributes: {
        class: "tiptap-editor",
        "data-placeholder": props.placeholder || "",
        role: "textbox",
        "aria-label": "Message input",
        "aria-multiline": "true",
      },
      handleKeyDown: (view, event) => {
        // Let Tiptap handle suggestion navigation first
        // If the suggestion plugin returns true, it handled the event
        // Otherwise, we can handle our submit shortcuts
        
        // Don't handle keyboard shortcuts if suggestion dropdown is active
        if (isSuggestionActive()) {
          return false; // Let Tiptap handle it
        }

        // Cmd/Ctrl + Enter to submit
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
          event.preventDefault();
          props.onSubmit();
          return true; // Handled
        }

        return false; // Not handled, let Tiptap continue
      },
      handleClick: (_view, _pos, event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) {
          return false;
        }
        const mentionNode = target.closest('[data-type="fileMention"], .file-mention');
        if (!(mentionNode instanceof HTMLElement)) {
          return false;
        }

        const filePath = mentionNode.getAttribute("data-path");
        if (!filePath) {
          return false;
        }

        props.onFileMentionClick?.(filePath);
        event.preventDefault();
        event.stopPropagation();
        return true;
      },
    },
    onUpdate: ({ editor }: any) => {
      const text = editor.getText();
      props.onInput(text);
    },
    editable: !props.disabled,
  });

  // Sync external value changes
  createEffect(() => {
    const currentEditor = editor();
    if (currentEditor && props.value !== currentEditor.getText()) {
      currentEditor.commands.setContent(props.value);
    }
  });

  // Sync disabled state
  createEffect(() => {
    const currentEditor = editor();
    if (currentEditor) {
      currentEditor.setEditable(!props.disabled);
    }
  });

  // Expose editor methods via ref
  createEffect(() => {
    const currentEditor = editor();
    if (currentEditor && props.ref) {
      props.ref({
        getJSON: () => currentEditor.getJSON(),
        setContent: (content: JSONContent | string) => currentEditor.commands.setContent(content),
        clear: () => currentEditor.commands.clearContent(),
        focus: () => currentEditor.commands.focus(),
        insertFileMention: (filePath: string, startLine?: number, endLine?: number) => {
          const normalizedPath = filePath.trim();
          if (!normalizedPath) return;
          const mentionReference = {
            filePath: normalizedPath,
            startLine,
            endLine,
          };
          const mentionId = encodeFileMentionReference(mentionReference);
          const mentionLabel = formatFileMentionLabel(mentionReference);

          const hasExistingText = currentEditor.getText().trim().length > 0;
          const content: JSONContent[] = [];
          if (hasExistingText) {
            content.push({ type: "text", text: " " });
          }
          content.push({
            type: "fileMention",
            attrs: {
              id: mentionId,
              label: mentionLabel,
            },
          });
          content.push({ type: "text", text: " " });

          currentEditor.chain().focus("end").insertContent(content).run();
        },
      });
    }
  });

  onCleanup(() => {
    const currentEditor = editor();
    if (currentEditor) {
      currentEditor.destroy();
    }
  });

  return (
    <div class="tiptap-editor-container">
      <EditorContent editor={editor()} />
    </div>
  );
}
