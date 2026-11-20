"use client";

import { useEffect } from "react";
import { EditorContent, useEditor, type JSONContent } from "@tiptap/react";
import { isRichTextDocument } from "@/lib/rich-text";
import { baseExtensions, RICH_TEXT_CLASS } from "./rich-text/extensions";

interface RichTextViewerProps {
  content: JSONContent | null | undefined;
}

export function RichTextViewer({ content }: RichTextViewerProps) {
  const editor = useEditor({
    // 글쓰기와 같은 노드 목록(표·사진 자리 포함) — 사진 자리는 보기 화면에서 숨는다
    extensions: baseExtensions({ editable: false }),
    content: isRichTextDocument(content) ? content : undefined,
    editable: false,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: RICH_TEXT_CLASS,
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
