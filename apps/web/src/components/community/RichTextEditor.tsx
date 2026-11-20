"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  EditorContent,
  useEditor,
  useEditorState,
  type Editor,
  type JSONContent,
} from "@tiptap/react";
import Placeholder from "@tiptap/extension-placeholder";
import FileHandler from "@tiptap/extension-file-handler";
import type { Node as PMNode } from "@tiptap/pm/model";
import {
  Bold,
  Code,
  ImagePlus,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Loader2,
  Quote,
  Redo2,
  Table as TableIcon,
  Trash2,
  Undo2,
} from "lucide-react";
import { baseExtensions, RICH_TEXT_CLASS } from "./rich-text/extensions";
import { ImageDrop } from "./rich-text/image-drop";
import { IMAGE_SLOT_NAME, slotKey } from "./rich-text/image-slot";
import { MarkdownPaste } from "./rich-text/markdown-paste";
import { communityApi } from "@/lib/api-client";
import {
  EMPTY_RICH_TEXT_DOC,
  isRichTextDocument,
  legacyMarkdownToRichTextDoc,
  type RichTextDocument,
} from "@/lib/rich-text";
import { cn } from "@/lib/utils";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

export interface RichTextEditorValue {
  json: RichTextDocument;
  text: string;
  isEmpty: boolean;
}

interface RichTextEditorProps {
  value?: RichTextDocument | null;
  fallbackMarkdown?: string;
  onChange: (value: RichTextEditorValue) => void;
  height?: number;
  placeholder?: string;
}

function toUploadUrl(path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  const apiOrigin = (
    process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"
  ).replace(/\/$/, "");
  return `${apiOrigin}${path}`;
}

function isImageFile(file: File) {
  return IMAGE_TYPES.includes(file.type);
}

/** 올린 사진 → 이미지 노드 */
function imageNodeFor(file: File, url: string): JSONContent {
  return {
    type: "image",
    attrs: {
      src: toUploadUrl(url),
      alt: file.name.replace(/\.[^.]+$/, "") || "image",
      title: null,
    },
  };
}

/** 문서 안 사진 자리들 — 파일 이름(소문자) → 위치 */
function findSlots(doc: PMNode): Map<string, number> {
  const slots = new Map<string, number>();
  doc.descendants((node, pos) => {
    if (node.type.name === IMAGE_SLOT_NAME) {
      const k = slotKey(String(node.attrs.name ?? ""));
      if (k && !slots.has(k)) slots.set(k, pos);
    }
    return node.type.name !== IMAGE_SLOT_NAME;
  });
  return slots;
}

/** 남은 사진 자리 수 */
function countSlots(doc: PMNode): number {
  let n = 0;
  doc.descendants((node) => {
    if (node.type.name === IMAGE_SLOT_NAME) n++;
  });
  return n;
}

/**
 * 비동기 업로드 동안 사용자가 글을 고쳐도 위치가 어긋나지 않게,
 * 에디터 트랜잭션마다 위치를 따라 옮긴다.
 */
function trackPos(editor: Editor, start: number) {
  let pos = start;
  const onTx = ({
    transaction,
  }: {
    transaction: { mapping: { map: (p: number) => number } };
  }) => {
    pos = transaction.mapping.map(pos);
  };
  editor.on("transaction", onTx);
  return {
    get: () => pos,
    stop: () => editor.off("transaction", onTx),
  };
}

function initialContent(
  value?: RichTextDocument | null,
  fallbackMarkdown?: string,
): RichTextDocument {
  if (isRichTextDocument(value)) return value;
  if (fallbackMarkdown?.trim())
    return legacyMarkdownToRichTextDoc(fallbackMarkdown);
  return EMPTY_RICH_TEXT_DOC;
}

function ToolbarButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-9 min-w-9 items-center justify-center rounded-md border border-bg-tertiary text-text-secondary transition-colors hover:border-accent-primary/40 hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50",
        active &&
          "border-accent-primary/50 bg-accent-primary/15 text-accent-primary",
      )}
    >
      {children}
    </button>
  );
}

export function RichTextEditor({
  value,
  fallbackMarkdown,
  onChange,
  height = 420,
  placeholder = "내용을 입력하세요",
}: RichTextEditorProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const emitChange = useCallback(
    (editor: Editor) => {
      onChange({
        json: editor.getJSON() as RichTextDocument,
        text: editor.getText({ blockSeparator: "\n" }),
        isEmpty: editor.isEmpty,
      });
    },
    [onChange],
  );

  /** 사진을 올리고 (파일, 주소) 목록을 돌려준다. 실패하면 null */
  const uploadFiles = useCallback(async (files: File[]) => {
    const images = files.filter(isImageFile);
    if (images.length === 0) return null;

    const oversized = images.find((file) => file.size > MAX_IMAGE_BYTES);
    if (oversized) {
      setUploadError(
        `이미지는 5MB 이하만 업로드할 수 있습니다. (${oversized.name})`,
      );
      return null;
    }

    setIsUploading(true);
    setUploadError(null);
    try {
      const uploaded: { file: File; url: string }[] = [];
      for (const file of images) {
        const { url } = await communityApi.uploadImage(file);
        uploaded.push({ file, url });
      }
      return uploaded;
    } catch {
      setUploadError("이미지 업로드에 실패했습니다.");
      return null;
    } finally {
      setIsUploading(false);
    }
  }, []);

  const uploadImages = useCallback(
    async (files: File[], insert: (nodes: JSONContent[]) => void) => {
      const uploaded = await uploadFiles(files);
      if (uploaded)
        insert(uploaded.map(({ file, url }) => imageNodeFor(file, url)));
    },
    [uploadFiles],
  );

  /**
   * 끌어다 놓은 사진 배치 — 이름이 같은 사진 자리가 있으면 그 자리로,
   * 없으면 놓은 위치(벌어진 칸)에 차례로 넣는다.
   */
  const placeDroppedImages = useCallback(
    async (currentEditor: Editor, files: File[], dropPos: number) => {
      const tracker = trackPos(currentEditor, dropPos);
      try {
        const uploaded = await uploadFiles(files);
        if (!uploaded || currentEditor.isDestroyed) return;

        const { state } = currentEditor;
        const slots = findSlots(state.doc);
        const tr = state.tr;
        const leftovers: JSONContent[] = [];
        // 사진 자리 바꾸기는 뒤쪽부터 — 앞쪽 위치가 밀리지 않게
        const matched: { pos: number; node: JSONContent }[] = [];
        for (const { file, url } of uploaded) {
          const slotPos = slots.get(slotKey(file.name));
          if (slotPos !== undefined) {
            matched.push({ pos: slotPos, node: imageNodeFor(file, url) });
            slots.delete(slotKey(file.name));
          } else {
            leftovers.push(imageNodeFor(file, url));
          }
        }
        matched.sort((a, b) => b.pos - a.pos);
        for (const m of matched) {
          const slot = tr.doc.nodeAt(m.pos);
          if (!slot) continue;
          tr.replaceWith(
            m.pos,
            m.pos + slot.nodeSize,
            state.schema.nodeFromJSON(m.node),
          );
        }
        if (leftovers.length > 0) {
          const at = Math.min(
            tr.mapping.map(tracker.get()),
            tr.doc.content.size,
          );
          tr.insert(
            at,
            leftovers.map((n) => state.schema.nodeFromJSON(n)),
          );
        }
        currentEditor.view.dispatch(tr);
        if (matched.length > 0 && leftovers.length > 0) {
          setUploadError(null);
        }
      } finally {
        tracker.stop();
      }
    },
    [uploadFiles],
  );

  /** 사진 자리를 눌렀을 때 — 파일 고르기 창을 열고, 고른 사진이 그 자리를 대신한다 */
  const pickForSlot = useCallback(
    (pos: number, currentEditor: Editor) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = IMAGE_TYPES.join(",");
      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) return;
        const tracker = trackPos(currentEditor, pos);
        void uploadFiles([file])
          .then((uploaded) => {
            if (!uploaded || currentEditor.isDestroyed) return;
            const at = tracker.get();
            const slot = currentEditor.state.doc.nodeAt(at);
            if (!slot || slot.type.name !== IMAGE_SLOT_NAME) return;
            currentEditor
              .chain()
              .focus()
              .insertContentAt(
                { from: at, to: at + slot.nodeSize },
                imageNodeFor(file, uploaded[0].url),
              )
              .run();
          })
          .finally(() => tracker.stop());
      };
      input.click();
    },
    [uploadFiles],
  );

  const extensions = useMemo(
    () => [
      ...baseExtensions({ editable: true, onPickSlot: pickForSlot }),
      Placeholder.configure({ placeholder }),
      // 사진 붙여 넣기(클립보드 속 이미지 파일)는 커서 자리에
      FileHandler.configure({
        allowedMimeTypes: IMAGE_TYPES,
        onPaste: (currentEditor, files) => {
          void uploadImages(Array.from(files), (nodes) => {
            currentEditor.chain().focus().insertContent(nodes).run();
          });
        },
      }),
      // 마크다운 붙여 넣기 — 제목·목록·표·사진 자리로
      MarkdownPaste,
      // 사진 끌어다 놓기 — 자리가 벌어지는 효과 + 이름 맞춰 배치
      ImageDrop.configure({
        accept: IMAGE_TYPES,
        onDropFiles: (files, pos, currentEditor) => {
          void placeDroppedImages(currentEditor, files, pos);
        },
      }),
    ],
    [placeholder, uploadImages, placeDroppedImages, pickForSlot],
  );

  const [slotCount, setSlotCount] = useState(0);
  const editor = useEditor({
    extensions,
    content: initialContent(value, fallbackMarkdown),
    immediatelyRender: false,
    onCreate: ({ editor }) => {
      emitChange(editor);
      setSlotCount(countSlots(editor.state.doc));
    },
    onUpdate: ({ editor }) => {
      emitChange(editor);
      setSlotCount(countSlots(editor.state.doc));
    },
    editorProps: {
      attributes: {
        class: `${RICH_TEXT_CLASS} min-h-full`,
      },
    },
  });

  // 커서가 표 안에 있는지 — 표 편집 버튼을 보일지 정한다(트랜잭션마다 다시 계산)
  const isInTable = useEditorState({
    editor,
    selector: ({ editor: current }) => current?.isActive("table") ?? false,
  });

  const addLink = () => {
    if (!editor) return;
    const previousUrl = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("링크 URL", previousUrl ?? "");
    if (url === null) return;
    if (!url.trim()) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href: url.trim() })
      .run();
  };

  const insertUploadedImages = (files: File[]) => {
    if (!editor || files.length === 0) return;
    void uploadImages(files, (nodes) => {
      editor.chain().focus().insertContent(nodes).run();
    });
  };

  return (
    <div className="overflow-hidden rounded-lg border border-bg-tertiary bg-bg-secondary">
      <div className="flex flex-wrap items-center gap-1 border-b border-bg-tertiary bg-bg-tertiary/40 p-2">
        <ToolbarButton
          label="굵게"
          active={editor?.isActive("bold")}
          disabled={!editor}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          label="기울임"
          active={editor?.isActive("italic")}
          disabled={!editor}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          label="코드"
          active={editor?.isActive("code")}
          disabled={!editor}
          onClick={() => editor?.chain().focus().toggleCode().run()}
        >
          <Code className="h-4 w-4" />
        </ToolbarButton>
        <span className="mx-1 h-6 w-px bg-bg-tertiary" />
        <ToolbarButton
          label="글머리 목록"
          active={editor?.isActive("bulletList")}
          disabled={!editor}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        >
          <List className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          label="번호 목록"
          active={editor?.isActive("orderedList")}
          disabled={!editor}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          label="인용"
          active={editor?.isActive("blockquote")}
          disabled={!editor}
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
        >
          <Quote className="h-4 w-4" />
        </ToolbarButton>
        <span className="mx-1 h-6 w-px bg-bg-tertiary" />
        <ToolbarButton
          label="링크"
          active={editor?.isActive("link")}
          disabled={!editor}
          onClick={addLink}
        >
          <LinkIcon className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          label="이미지"
          disabled={!editor || isUploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {isUploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ImagePlus className="h-4 w-4" />
          )}
        </ToolbarButton>
        <ToolbarButton
          label="표 넣기"
          active={!!isInTable}
          disabled={!editor}
          onClick={() =>
            editor
              ?.chain()
              .focus()
              .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
              .run()
          }
        >
          <TableIcon className="h-4 w-4" />
        </ToolbarButton>
        {/* 표 안에 있을 때만 — 줄·칸 더하고 빼기 */}
        {editor && isInTable && (
          <>
            <ToolbarButton
              label="아래에 줄 추가"
              onClick={() => editor.chain().focus().addRowAfter().run()}
            >
              <span className="px-1.5 text-xs font-semibold">+줄</span>
            </ToolbarButton>
            <ToolbarButton
              label="오른쪽에 칸 추가"
              onClick={() => editor.chain().focus().addColumnAfter().run()}
            >
              <span className="px-1.5 text-xs font-semibold">+칸</span>
            </ToolbarButton>
            <ToolbarButton
              label="이 줄 지우기"
              onClick={() => editor.chain().focus().deleteRow().run()}
            >
              <span className="px-1.5 text-xs font-semibold">−줄</span>
            </ToolbarButton>
            <ToolbarButton
              label="이 칸 지우기"
              onClick={() => editor.chain().focus().deleteColumn().run()}
            >
              <span className="px-1.5 text-xs font-semibold">−칸</span>
            </ToolbarButton>
            <ToolbarButton
              label="표 지우기"
              onClick={() => editor.chain().focus().deleteTable().run()}
            >
              <Trash2 className="h-4 w-4" />
            </ToolbarButton>
          </>
        )}
        <span className="mx-1 h-6 w-px bg-bg-tertiary" />
        <ToolbarButton
          label="실행 취소"
          disabled={!editor || !editor.can().undo()}
          onClick={() => editor?.chain().focus().undo().run()}
        >
          <Undo2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          label="다시 실행"
          disabled={!editor || !editor.can().redo()}
          onClick={() => editor?.chain().focus().redo().run()}
        >
          <Redo2 className="h-4 w-4" />
        </ToolbarButton>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={IMAGE_TYPES.join(",")}
          className="hidden"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = "";
            insertUploadedImages(files);
          }}
        />
      </div>
      {/* 남은 사진 자리 안내 */}
      {slotCount > 0 && (
        <div className="border-b border-bg-tertiary bg-bg-tertiary/30 px-3 py-2 text-xs text-text-secondary">
          사진 자리 {slotCount}곳 — 사진 파일들을 한꺼번에 끌어다 놓으면 이름이
          같은 자리에 각각 들어갑니다.
        </div>
      )}
      {uploadError && (
        <div className="border-b border-accent-danger/30 bg-accent-danger/10 px-3 py-2 text-sm text-accent-danger">
          {uploadError}
        </div>
      )}
      <div
        className="overflow-y-auto px-4 py-3"
        style={{ minHeight: height, maxHeight: Math.max(height, 720) }}
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
