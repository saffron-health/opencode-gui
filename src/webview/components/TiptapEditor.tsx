import { createEffect, createSignal, onCleanup } from "solid-js";
import { createEditor, EditorContent } from "tiptap-solid";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { FileMention } from "../extensions/FileMention";
import { createFileMentionSuggestion } from "../utils/fileMentionSuggestion";
import "./TiptapEditor.css";

export interface TiptapEditorProps {
  value: string;
  onInput: (text: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  disabled?: boolean;
  searchFiles: (query: string) => Promise<string[]>;
  ref?: (methods: { getJSON: () => any; setContent: (content: any) => void; clear: () => void; focus: () => void }) => void;
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
        setContent: (content: any) => currentEditor.commands.setContent(content),
        clear: () => currentEditor.commands.clearContent(),
        focus: () => currentEditor.commands.focus(),
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
