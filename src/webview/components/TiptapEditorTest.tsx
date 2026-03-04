import { createSignal } from "solid-js";
import { createEditor, EditorContent } from "tiptap-solid";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";

export function TiptapEditorTest() {
  const [content, setContent] = createSignal("");

  const editor = createEditor({
    extensions: [Document, Paragraph, Text],
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
