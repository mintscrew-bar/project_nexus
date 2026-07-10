import type { JSONContent } from "@tiptap/react";

export type PostContentFormat = "MARKDOWN" | "RICHTEXT";
export type RichTextDocument = JSONContent;

export const EMPTY_RICH_TEXT_DOC: RichTextDocument = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

export function isRichTextDocument(value: unknown): value is RichTextDocument {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      (value as { type?: unknown }).type === "doc",
  );
}

function textNode(text: string): JSONContent[] {
  return text ? [{ type: "text", text }] : [];
}

function paragraph(text: string): JSONContent {
  return { type: "paragraph", content: textNode(text) };
}

function heading(text: string, level: number): JSONContent {
  return {
    type: "heading",
    attrs: { level },
    content: textNode(text),
  };
}

function imageNode(src: string, alt = ""): JSONContent {
  return {
    type: "image",
    attrs: { src, alt, title: null },
  };
}

function plainLine(line: string): string {
  return line
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^>\s*/, "")
    .trim();
}

export function plainTextToRichTextDoc(text: string): RichTextDocument {
  const blocks = text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => paragraph(block.replace(/\n/g, " ")));

  return {
    type: "doc",
    content: blocks.length > 0 ? blocks : [{ type: "paragraph" }],
  };
}

export function legacyMarkdownToRichTextDoc(markdown: string): RichTextDocument {
  const lines = markdown.split(/\r?\n/);
  const content: JSONContent[] = [];
  let listItems: JSONContent[] = [];

  const flushList = () => {
    if (listItems.length === 0) return;
    content.push({ type: "bulletList", content: listItems });
    listItems = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushList();
      continue;
    }

    const imageOnly = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (imageOnly) {
      flushList();
      content.push(imageNode(imageOnly[2], imageOnly[1]));
      continue;
    }

    const bullet = line.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      listItems.push({
        type: "listItem",
        content: [paragraph(plainLine(bullet[1]))],
      });
      continue;
    }

    flushList();

    const h3 = line.match(/^###\s+(.+)$/);
    if (h3) {
      content.push(heading(plainLine(h3[1]), 3));
      continue;
    }

    const h2 = line.match(/^##\s+(.+)$/);
    if (h2) {
      content.push(heading(plainLine(h2[1]), 2));
      continue;
    }

    const h1 = line.match(/^#\s+(.+)$/);
    if (h1) {
      content.push(heading(plainLine(h1[1]), 2));
      continue;
    }

    const inlineImage = line.match(/!\[([^\]]*)\]\(([^)]+)\)/);
    if (inlineImage) {
      const before = plainLine(line.slice(0, inlineImage.index));
      const after = plainLine(line.slice((inlineImage.index ?? 0) + inlineImage[0].length));
      if (before) content.push(paragraph(before));
      content.push(imageNode(inlineImage[2], inlineImage[1]));
      if (after) content.push(paragraph(after));
      continue;
    }

    content.push(paragraph(plainLine(line)));
  }

  flushList();

  return {
    type: "doc",
    content: content.length > 0 ? content : [{ type: "paragraph" }],
  };
}
