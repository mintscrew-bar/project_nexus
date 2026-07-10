"use client";

import { useEffect } from "react";
import { EditorContent, useEditor, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import { isRichTextDocument } from "@/lib/rich-text";

interface RichTextViewerProps {
  content: JSONContent | null | undefined;
}

export function RichTextViewer({ content }: RichTextViewerProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({
        openOnClick: true,
        autolink: true,
      }),
      Image.configure({
        HTMLAttributes: {
          class: "rounded-md border border-bg-tertiary max-h-[720px] object-contain",
        },
      }),
    ],
    content: isRichTextDocument(content) ? content : undefined,
    editable: false,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          "prose prose-invert max-w-none focus:outline-none [&_img]:my-4 [&_a]:text-accent-primary [&_a]:underline [&_pre]:bg-bg-tertiary [&_pre]:rounded-md [&_blockquote]:border-l-accent-primary",
      },
    },
  });

  useEffect(() => {
    if (!editor || !isRichTextDocument(content)) return;
    editor.commands.setContent(content, { emitUpdate: false });
  }, [content, editor]);

  if (!isRichTextDocument(content)) return null;

  return <EditorContent editor={editor} />;
}
