import { Extension, type Editor } from "@tiptap/react";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";

/**
 * 사진 끌어다 놓기 — 파일을 끌고 들어오면 놓일 자리의 글이 위아래로 "사사삭" 비켜서며
 * 빈 칸이 벌어진다. 손을 옮기면 이전 칸은 접히고 새 자리가 벌어진다.
 *
 * - 칸은 문단·제목·표 같은 **맨 바깥 블록 사이**에만 생긴다(문장 한가운데로 끊지 않는다).
 * - 벌어지는/접히는 움직임은 높이 transition 하나로 낸다. 접히는 칸은 잠깐 남겨 두었다가
 *   다 접히면 지운다(`closing`).
 * - 놓으면 `onDropFiles(파일들, 위치)` 를 부른다. 이름이 같은 사진 자리가 있으면
 *   그쪽으로 보내는 일은 에디터(RichTextEditor)가 한다.
 */
export interface ImageDropOptions {
  onDropFiles: ((files: File[], pos: number, editor: Editor) => void) | null;
  /** 받는 사진 형식 */
  accept: string[];
}

interface GapState {
  /** 지금 벌어진 칸의 위치 (없으면 null) */
  pos: number | null;
  /** 끌고 있는 파일 수 — 칸 안내 문구용 */
  count: number;
  /** 접히는 중인 이전 칸들 */
  closing: { pos: number; id: number }[];
}

type GapMeta =
  | { type: "show"; pos: number; count: number }
  | { type: "hide" }
  | { type: "closed"; id: number };

const key = new PluginKey<GapState>("imageDropGap");
/** 칸 높이(px)와 움직임 시간(ms) */
const GAP_HEIGHT = 132;
const ANIM_MS = 220;
const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";

let closingSeq = 0;

/** 드래그 중인 것이 파일인가 (글자·노드 끌기는 손대지 않는다) */
function isFileDrag(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes("Files");
}

function fileCount(event: DragEvent): number {
  const items = event.dataTransfer?.items;
  if (!items) return 1;
  return Math.max(1, Array.from(items).filter((i) => i.kind === "file").length);
}

/**
 * 마우스 높이로 칸이 들어갈 블록 경계를 찾는다.
 * 맨 바깥 블록마다 화면 위치를 보고, 마우스가 블록 가운데보다 위면 그 앞, 아래면 그 뒤.
 */
function gapPosAt(view: EditorView, clientY: number): number {
  const { doc } = view.state;
  let pos = 0;
  let result = doc.content.size;
  for (let i = 0; i < doc.childCount; i++) {
    const child = doc.child(i);
    const dom = view.nodeDOM(pos);
    if (dom instanceof HTMLElement) {
      const rect = dom.getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) {
        result = pos;
        break;
      }
    }
    pos += child.nodeSize;
  }
  return result;
}

/** 칸 DOM — 처음엔 높이 0, 다음 프레임에 벌린다(closing 이면 반대로) */
function gapWidget(count: number, opening: boolean): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("data-image-drop-gap", "");
  el.contentEditable = "false";
  Object.assign(el.style, {
    height: opening ? "0px" : `${GAP_HEIGHT}px`,
    opacity: opening ? "0" : "1",
    overflow: "hidden",
    transition: `height ${ANIM_MS}ms ${EASE}, opacity ${ANIM_MS}ms ${EASE}`,
    pointerEvents: "none",
  } satisfies Partial<CSSStyleDeclaration>);

  const box = document.createElement("div");
  box.className =
    "not-prose mx-0 my-2 flex h-[116px] items-center justify-center gap-2 rounded-lg border-2 border-dashed border-accent-primary/70 bg-accent-primary/10 text-sm font-semibold text-accent-primary";
  box.textContent =
    count > 1 ? `사진 ${count}장을 여기에 놓기` : "사진을 여기에 놓기";
  el.append(box);

  // 두 번 기다려야 처음 높이가 그려진 뒤에 바뀌어 transition 이 탄다
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      el.style.height = opening ? `${GAP_HEIGHT}px` : "0px";
      el.style.opacity = opening ? "1" : "0";
    }),
  );
  return el;
}

function buildDecorations(state: EditorState, gap: GapState): DecorationSet {
  const decos: Decoration[] = [];
  if (gap.pos !== null) {
    decos.push(
      Decoration.widget(gap.pos, () => gapWidget(gap.count, true), {
        // 위치·장수가 같으면 같은 DOM 을 다시 쓴다 — 매 dragover 마다 다시 벌어지지 않게
        key: `gap-${gap.pos}-${gap.count}`,
        side: -1,
        ignoreSelection: true,
      }),
    );
  }
  for (const c of gap.closing) {
    decos.push(
      Decoration.widget(c.pos, () => gapWidget(gap.count, false), {
        key: `closing-${c.id}`,
        side: -1,
        ignoreSelection: true,
      }),
    );
  }
  return DecorationSet.create(state.doc, decos);
}

export const ImageDrop = Extension.create<ImageDropOptions>({
  name: "imageDrop",
  // FileHandler 보다 먼저 drop 을 받는다
  priority: 1000,

  addOptions() {
    return { onDropFiles: null, accept: [] };
  },

  addProseMirrorPlugins() {
    const options = this.options;
    const editor = this.editor;

    // 이전 칸을 접히는 칸으로 넘기고, 다 접히면 지운다
    const hide = (view: EditorView) => {
      const gap = key.getState(view.state);
      if (!gap || gap.pos === null) return;
      view.dispatch(
        view.state.tr.setMeta(key, { type: "hide" } satisfies GapMeta),
      );
    };

    return [
      new Plugin<GapState>({
        key,
        state: {
          init: () => ({ pos: null, count: 1, closing: [] }),
          apply(tr, prev) {
            // 문서가 바뀌면 위치를 따라 옮긴다
            let gap: GapState = tr.docChanged
              ? {
                  ...prev,
                  pos: prev.pos === null ? null : tr.mapping.map(prev.pos),
                  closing: prev.closing.map((c) => ({
                    ...c,
                    pos: tr.mapping.map(c.pos),
                  })),
                }
              : prev;
            const meta = tr.getMeta(key) as GapMeta | undefined;
            if (!meta) return gap;
            if (meta.type === "show") {
              if (gap.pos === meta.pos && gap.count === meta.count) return gap;
              const closing =
                gap.pos === null
                  ? gap.closing
                  : [...gap.closing, { pos: gap.pos, id: ++closingSeq }];
              gap = { pos: meta.pos, count: meta.count, closing };
            } else if (meta.type === "hide") {
              const closing =
                gap.pos === null
                  ? gap.closing
                  : [...gap.closing, { pos: gap.pos, id: ++closingSeq }];
              gap = { ...gap, pos: null, closing };
            } else if (meta.type === "closed") {
              gap = {
                ...gap,
                closing: gap.closing.filter((c) => c.id !== meta.id),
              };
            }
            return gap;
          },
        },
        view: () => {
          // 접히기 시작한 칸은 움직임이 끝나면 지운다
          const timers = new Map<number, number>();
          return {
            update(view) {
              const gap = key.getState(view.state);
              for (const c of gap?.closing ?? []) {
                if (timers.has(c.id)) continue;
                timers.set(
                  c.id,
                  window.setTimeout(() => {
                    timers.delete(c.id);
                    if (view.isDestroyed) return;
                    view.dispatch(
                      view.state.tr.setMeta(key, {
                        type: "closed",
                        id: c.id,
                      } satisfies GapMeta),
                    );
                  }, ANIM_MS + 30),
                );
              }
            },
            destroy() {
              timers.forEach((t) => window.clearTimeout(t));
            },
          };
        },
        props: {
          decorations(state) {
            const gap = key.getState(state);
            return gap ? buildDecorations(state, gap) : null;
          },
          handleDOMEvents: {
            dragover(view, event) {
              if (!isFileDrag(event) || !view.editable) return false;
              event.preventDefault();
              const pos = gapPosAt(view, event.clientY);
              const count = fileCount(event);
              const gap = key.getState(view.state);
              if (gap?.pos !== pos || gap?.count !== count) {
                view.dispatch(
                  view.state.tr.setMeta(key, {
                    type: "show",
                    pos,
                    count,
                  } satisfies GapMeta),
                );
              }
              return true;
            },
            dragleave(view, event) {
              // 에디터 안의 다른 칸으로 옮겨 가는 dragleave 는 무시한다
              const next = event.relatedTarget as globalThis.Node | null;
              if (next && view.dom.contains(next)) return false;
              hide(view);
              return false;
            },
            dragend(view) {
              hide(view);
              return false;
            },
          },
          handleDrop(view, event) {
            if (!isFileDrag(event)) return false;
            const files = Array.from(event.dataTransfer?.files ?? []).filter(
              (f) =>
                options.accept.length === 0
                  ? f.type.startsWith("image/")
                  : options.accept.includes(f.type),
            );
            const gap = key.getState(view.state);
            const pos = gap?.pos ?? gapPosAt(view, event.clientY);
            hide(view);
            if (files.length === 0) return false;
            event.preventDefault();
            options.onDropFiles?.(files, pos, editor);
            return true;
          },
        },
      }),
    ];
  },
});
