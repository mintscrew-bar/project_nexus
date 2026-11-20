import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import { TableKit } from "@tiptap/extension-table";
import type { Editor } from "@tiptap/react";
import { ImageSlot } from "./image-slot";

/**
 * 글쓰기·보기 화면이 함께 쓰는 노드 목록.
 * 보기 화면이 모르는 노드(표·사진 자리)가 글에 들어 있으면 그리지 못하므로
 * 두 화면이 반드시 같은 목록에서 출발한다.
 */
export function baseExtensions(opts: {
  editable: boolean;
  onPickSlot?: (pos: number, editor: Editor) => void;
}) {
  return [
    StarterKit.configure({
      heading: { levels: [2, 3] },
      // 파일 끌기는 image-drop.ts 의 벌어지는 칸이 대신 보여 준다
      dropcursor: false,
      link: false,
    }),
    Link.configure({
      openOnClick: !opts.editable,
      autolink: true,
      linkOnPaste: true,
      HTMLAttributes: { class: "text-accent-primary underline" },
    }),
    Image.configure({
      allowBase64: false,
      HTMLAttributes: {
        class:
          "rounded-md border border-bg-tertiary max-h-[720px] object-contain",
      },
    }),
    TableKit.configure({
      table: { resizable: false },
    }),
    ImageSlot.configure({
      hidden: !opts.editable,
      onPick: opts.onPickSlot ?? null,
    }),
  ];
}

/**
 * 본문 글자 모양 — prose 위에 표·사진 칸 모양을 덧입힌다.
 * (globals.css 를 건드리지 않고 이 컴포넌트 안에서만 쓰도록 arbitrary variant 로 둔다)
 */
export const RICH_TEXT_CLASS = [
  "prose prose-invert max-w-none focus:outline-none",
  "[&_img]:my-4 [&_a]:text-accent-primary [&_a]:underline",
  "[&_pre]:bg-bg-tertiary [&_pre]:rounded-md [&_pre]:p-3",
  // typography 플러그인이 없어 prose 가 아무것도 안 한다 — 제목·목록·가로줄·인용을 직접 그린다
  "[&_p]:my-2 [&_p]:leading-relaxed",
  "[&_h2]:mb-2 [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-text-primary",
  "[&_h3]:mb-1.5 [&_h3]:mt-6 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-text-primary",
  "[&>*:first-child]:mt-0",
  "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6",
  "[&_li]:my-0.5 [&_li_p]:my-0 [&_li]:marker:text-text-tertiary",
  "[&_hr]:my-8 [&_hr]:border-bg-tertiary",
  // 인용 — 왼쪽 색 막대 대신 옅은 바탕 칸(CLAUDE.md 왼쪽 강조 보더 금지)
  "[&_blockquote]:my-3 [&_blockquote]:rounded-md [&_blockquote]:bg-bg-tertiary/50 [&_blockquote]:px-4 [&_blockquote]:py-2 [&_blockquote]:text-text-secondary",
  "[&_code]:rounded [&_code]:bg-bg-tertiary [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.9em]",
  // 표 — 칸마다 옅은 테두리, 머리 줄은 옅은 바탕
  "[&_.tableWrapper]:my-4 [&_.tableWrapper]:overflow-x-auto",
  "[&_table]:my-0 [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm",
  "[&_th]:border [&_th]:border-bg-tertiary [&_th]:bg-bg-tertiary/60 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold",
  "[&_td]:border [&_td]:border-bg-tertiary [&_td]:px-3 [&_td]:py-2 [&_td]:align-top",
  "[&_th_p]:my-0 [&_td_p]:my-0",
  // 편집 중 고른 칸
  "[&_.selectedCell]:bg-accent-primary/15",
].join(" ");
