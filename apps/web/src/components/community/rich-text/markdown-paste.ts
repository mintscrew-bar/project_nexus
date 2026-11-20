import { Marked, type Tokens } from "marked";
import { Extension } from "@tiptap/react";
import { Plugin, PluginKey } from "@tiptap/pm/state";

/**
 * 마크다운 붙여 넣기 — 메모장·VS Code 에서 복사한 마크다운을 서식째 넣는다.
 *
 * 에디터가 받는 서식(StarterKit 제목 2·3단, 목록, 인용, 가로줄, 굵게·기울임·코드,
 * 링크, 사진, 표)으로 바꾼 HTML 을 돌려주면 Tiptap 이 스키마에 맞춰 읽는다.
 * 스키마에 없는 태그(script 등)는 Tiptap 이 버리므로 따로 소독하지 않아도 된다.
 *
 * 사진은 주소가 http(s) 면 그대로 넣고, 내 PC 경로(`../images/a.png`)면 브라우저가
 * 읽을 수 없으므로 "사진 자리"(image-slot.ts)로 남긴다.
 */

/** 붙여 넣은 글이 마크다운으로 보이는가 — 평범한 글을 잘못 바꾸지 않도록 보수적으로 */
export function looksLikeMarkdown(text: string): boolean {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  if (lines.length < 2) return false;

  const has = (re: RegExp) => lines.some((l) => re.test(l));
  // 이것 하나만 있어도 마크다운이 확실한 것
  if (has(/^#{1,6}\s+\S/)) return true;
  if (has(/^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/)) return true; // 표 구분 줄
  if (has(/^!\[[^\]]*\]\([^)]+\)$/)) return true; // 사진 한 줄

  // 아니면 두 종류 이상 섞여 있을 때만
  const kinds = [
    /^[-*+]\s+\S/, // 글머리 목록
    /^\d+\.\s+\S/, // 번호 목록
    /^>\s?/, // 인용
    /^(-{3,}|\*{3,})$/, // 가로줄
    /\*\*[^*]+\*\*/, // 굵게
    /\[[^\]]+\]\([^)]+\)/, // 링크
    /^```/, // 코드 묶음
  ].filter((re) => has(re)).length;
  return kinds >= 2;
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function isWebUrl(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

/** 사진 하나 — 웹 주소면 img, 아니면 사진 자리 */
function imageHtml(href: string, alt: string): string {
  if (isWebUrl(href)) {
    return `<img src="${escapeAttr(href)}" alt="${escapeAttr(alt)}">`;
  }
  const name = href.split(/[\\/]/).pop() ?? href;
  return `<div data-image-slot="${escapeAttr(name)}" data-alt="${escapeAttr(alt)}"></div>`;
}

const marked = new Marked({ gfm: true, breaks: false });

marked.use({
  renderer: {
    // 에디터 제목은 2·3단뿐 — 1단은 2단으로, 4단 이하는 3단으로 맞춘다
    heading({ tokens, depth }: Tokens.Heading) {
      const level = depth <= 2 ? 2 : 3;
      return `<h${level}>${this.parser.parseInline(tokens)}</h${level}>\n`;
    },
    // 사진만 있는 문단은 문단으로 감싸지 않는다(사진 자리는 블록이라 p 안에 못 들어간다)
    paragraph({ tokens }: Tokens.Paragraph) {
      const meaningful = tokens.filter(
        (t) => !(t.type === "text" && !t.raw.trim()),
      );
      if (
        meaningful.length > 0 &&
        meaningful.every((t) => t.type === "image")
      ) {
        return (
          meaningful
            .map((t) =>
              imageHtml((t as Tokens.Image).href, (t as Tokens.Image).text),
            )
            .join("\n") + "\n"
        );
      }
      return `<p>${this.parser.parseInline(tokens)}</p>\n`;
    },
    // 문장 중간의 사진 — 웹 주소만 살리고 PC 경로는 이름만 글자로 남긴다
    image({ href, text }: Tokens.Image) {
      return isWebUrl(href)
        ? imageHtml(href, text)
        : `[사진: ${escapeAttr(href.split(/[\\/]/).pop() ?? href)}]`;
    },
  },
});

/** 마크다운 → 에디터가 읽을 HTML */
export function markdownToEditorHtml(markdown: string): string {
  return marked.parse(markdown.replace(/\r\n/g, "\n"), {
    async: false,
  }) as string;
}

/**
 * 붙여 넣은 글이 마크다운으로 보이면 서식째 바꿔 넣는 확장.
 * 클립보드에 파일이 함께 있으면(이미지 복사) 손대지 않고 FileHandler 에 넘긴다.
 */
export const MarkdownPaste = Extension.create({
  name: "markdownPaste",
  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        key: new PluginKey("markdownPaste"),
        props: {
          handlePaste(_view, event) {
            const data = event.clipboardData;
            if (!data || data.files.length > 0) return false;
            const text = data.getData("text/plain");
            if (!text || !looksLikeMarkdown(text)) return false;
            event.preventDefault();
            editor
              .chain()
              .focus()
              .insertContent(markdownToEditorHtml(text))
              .run();
            return true;
          },
        },
      }),
    ];
  },
});
