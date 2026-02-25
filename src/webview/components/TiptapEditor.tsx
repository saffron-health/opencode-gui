import { createEffect, createSignal, onCleanup } from "solid-js";
import { createEditor, EditorContent } from "tiptap-solid";
import StarterKit from "@tiptap/starter-kit";
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
  ref?: (getJSON: () => any) => void;
}

export function TiptapEditor(props: TiptapEditorProps) {
  const [isSuggestionActive, setIsSuggestionActive] = createSignal(false);

  const editor = createEditor({
    extensions: [
      StarterKit.configure({
        history: {
          depth: 100,
        },
      }),
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
    content: props.value,
    editorProps: {
      attributes: {
        class: "tiptap-editor",
        "data-placeholder": props.placeholder || "",
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

  // Expose getJSON method via ref
  createEffect(() => {
    const currentEditor = editor();
    if (currentEditor && props.ref) {
      props.ref(() => currentEditor.getJSON());
    }
  });

  // Keyboard shortcuts
  const handleKeyDown = (event: KeyboardEvent) => {
    // Cmd/Ctrl + Enter to submit
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      props.onSubmit();
      return;
    }

    // Enter to submit (but not when suggestion is active or Shift is held)
    if (event.key === "Enter" && !event.shiftKey && !isSuggestionActive()) {
      event.preventDefault();
      props.onSubmit();
      return;
    }
  };

  onCleanup(() => {
    const currentEditor = editor();
    if (currentEditor) {
      currentEditor.destroy();
    }
  });

  return (
    <div class="tiptap-editor-container" onKeyDown={handleKeyDown}>
      <EditorContent editor={editor()} />
    </div>
  );
}
