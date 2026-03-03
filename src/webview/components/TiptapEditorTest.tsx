import { createSignal } from "solid-js";
import { createEditor, EditorContent } from "tiptap-solid";
import StarterKit from "@tiptap/starter-kit";

export function TiptapEditorTest() {
  const [content, setContent] = createSignal("");

  const editor = createEditor({
    extensions: [StarterKit],
    content: "<p>Hello from Tiptap!</p>",
    onUpdate: ({ editor }) => {
      setContent(editor.getText());
    },
  });

  return (
    <div style={{ padding: "20px", border: "1px solid #ccc" }}>
      <h3>Tiptap Test Component</h3>
      <EditorContent editor={editor()} />
      <div style={{ "margin-top": "10px" }}>
        <strong>Content:</strong> {content()}
      </div>
    </div>
  );
}
