"use client";

import dynamic from "next/dynamic";
import rehypeSanitize from "rehype-sanitize";
import "@uiw/react-md-editor/markdown-editor.css";

const MDEditorMarkdown = dynamic(
  () => import("@uiw/react-md-editor").then((mod) => mod.default.Markdown),
  { ssr: false }
);

interface MarkdownViewerProps {
  content: string;
}

export function MarkdownViewer({ content }: MarkdownViewerProps) {
  return (
    <div data-color-mode="dark" className="wmde-markdown-var">
      <MDEditorMarkdown
        source={content}
        style={{ backgroundColor: "transparent", color: "inherit" }}
        rehypePlugins={[[rehypeSanitize]]}
      />
    </div>
  );
}
