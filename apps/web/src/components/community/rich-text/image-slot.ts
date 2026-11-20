import { Node, mergeAttributes, type Editor } from "@tiptap/react";

/**
 * 사진 자리 — 마크다운을 붙여 넣었는데 사진 주소가 내 PC 파일 경로(`../images/a.png`)라
 * 브라우저가 읽을 수 없을 때 그 자리에 남기는 표시 칸.
 *
 * - 사진 파일을 끌어다 놓으면 **파일 이름이 같은 자리**에 들어간다(image-drop.ts).
 *   여러 장을 한꺼번에 놓아도 각자 제자리를 찾아간다.
 * - 칸을 누르면 파일 고르기 창이 열리고, 고른 사진이 그 자리에 들어간다.
 * - 글을 올릴 때 남아 있어도 보기 화면에서는 그리지 않는다(`hidden` 옵션).
 */
export interface ImageSlotOptions {
  /** 보기 화면 — 칸을 그리지 않는다 */
  hidden: boolean;
  /** 칸을 눌렀을 때. pos 는 그 칸의 문서 위치 */
  onPick: ((pos: number, editor: Editor) => void) | null;
}

export const IMAGE_SLOT_NAME = "imageSlot";

/** 사진 자리 이름 비교용 — 경로·대소문자를 떼고 파일 이름만 */
export function slotKey(nameOrPath: string): string {
  const base = nameOrPath.split(/[\\/]/).pop() ?? nameOrPath;
  try {
    return decodeURIComponent(base).trim().toLowerCase();
  } catch {
    return base.trim().toLowerCase();
  }
}

export const ImageSlot = Node.create<ImageSlotOptions>({
  name: IMAGE_SLOT_NAME,
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addOptions() {
    return { hidden: false, onPick: null };
  },

  addAttributes() {
    return {
      name: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-image-slot") ?? "",
      },
      alt: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-alt") ?? "",
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-image-slot]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-image-slot": node.attrs.name,
        "data-alt": node.attrs.alt,
        // 보기 화면에서는 남은 자리 표시를 숨긴다
        ...(this.options.hidden ? { hidden: "hidden" } : {}),
      }),
      `사진 자리: ${node.attrs.name}`,
    ];
  },

  // 편집 화면 — 점선 칸 + 안내. 누르면 파일 고르기
  addNodeView() {
    return ({ node, getPos, editor }) => {
      const dom = document.createElement("div");
      dom.setAttribute("data-image-slot", node.attrs.name);
      dom.contentEditable = "false";
      dom.className =
        "not-prose my-3 flex cursor-pointer items-center gap-3 rounded-lg border-2 border-dashed border-accent-gold/50 bg-accent-gold/5 px-4 py-5 text-sm text-text-secondary transition-colors hover:border-accent-gold hover:bg-accent-gold/10";

      // 사진 아이콘 — 이모지는 글꼴에 따라 네모로 깨져서 SVG 로 그린다(lucide image-plus 모양)
      const icon = document.createElement("span");
      icon.className = "shrink-0 text-accent-gold";
      icon.innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 5h6"/><path d="M19 2v6"/><path d="M21 11.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7.5"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/><circle cx="9" cy="9" r="2"/></svg>';

      const text = document.createElement("div");
      const title = document.createElement("div");
      title.className = "font-semibold text-text-primary";
      title.textContent = node.attrs.name || "사진";
      const hint = document.createElement("div");
      hint.className = "text-xs text-text-tertiary";
      hint.textContent = node.attrs.alt
        ? `${node.attrs.alt} — 같은 이름의 사진을 끌어다 놓거나 눌러서 고르세요`
        : "같은 이름의 사진을 끌어다 놓거나 눌러서 고르세요";
      text.append(title, hint);
      dom.append(icon, text);

      dom.addEventListener("click", () => {
        const pos = typeof getPos === "function" ? getPos() : undefined;
        if (typeof pos === "number") this.options.onPick?.(pos, editor);
      });

      return { dom };
    };
  },
});
