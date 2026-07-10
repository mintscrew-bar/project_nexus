"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor, type Editor, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import FileHandler from "@tiptap/extension-file-handler";
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
  Undo2,
} from "lucide-react";
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
  const apiOrigin = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000").replace(/\/$/, "");
  return `${apiOrigin}${path}`;
}

function isImageFile(file: File) {
  return IMAGE_TYPES.includes(file.type);
}

function initialContent(value?: RichTextDocument | null, fallbackMarkdown?: string): RichTextDocument {
  if (isRichTextDocument(value)) return value;
  if (fallbackMarkdown?.trim()) return legacyMarkdownToRichTextDoc(fallbackMarkdown);
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
        "inline-flex h-9 w-9 items-center justify-center rounded-md border border-bg-tertiary text-text-secondary transition-colors hover:border-accent-primary/40 hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50",
        active && "border-accent-primary/50 bg-accent-primary/15 text-accent-primary",
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

  const uploadImages = useCallback(
    async (
      files: File[],
      insert: (nodes: JSONContent[]) => void,
    ) => {
      const images = files.filter(isImageFile);
      if (images.length === 0) return;

      const oversized = images.find((file) => file.size > MAX_IMAGE_BYTES);
      if (oversized) {
        setUploadError("이미지는 5MB 이하만 업로드할 수 있습니다.");
        return;
      }

      setIsUploading(true);
      setUploadError(null);
      try {
        const nodes: JSONContent[] = [];
        for (const file of images) {
          const { url } = await communityApi.uploadImage(file);
          nodes.push({
            type: "image",
            attrs: {
              src: toUploadUrl(url),
              alt: file.name.replace(/\.[^.]+$/, "") || "image",
              title: null,
            },
          });
        }
        insert(nodes);
      } catch {
        setUploadError("이미지 업로드에 실패했습니다.");
      } finally {
        setIsUploading(false);
      }
    },
    [],
  );

  const extensions = useMemo(
    () => [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        HTMLAttributes: {
          class: "text-accent-primary underline",
        },
      }),
      Image.configure({
        allowBase64: false,
        HTMLAttributes: {
          class: "rounded-md border border-bg-tertiary max-h-[720px] object-contain",
        },
      }),
      Placeholder.configure({ placeholder }),
      FileHandler.configure({
        allowedMimeTypes: IMAGE_TYPES,
        onPaste: (currentEditor, files) => {
          void uploadImages(Array.from(files), (nodes) => {
            currentEditor.chain().focus().insertContent(nodes).run();
          });
        },
        onDrop: (currentEditor, files, pos) => {
          void uploadImages(Array.from(files), (nodes) => {
            currentEditor.chain().focus().insertContentAt(pos, nodes).run();
          });
        },
      }),
    ],
    [placeholder, uploadImages],
  );

  const editor = useEditor({
    extensions,
    content: initialContent(value, fallbackMarkdown),
    immediatelyRender: false,
    onCreate: ({ editor }) => emitChange(editor),
    onUpdate: ({ editor }) => emitChange(editor),
    editorProps: {
      attributes: {
        class:
          "prose prose-invert max-w-none min-h-full focus:outline-none [&_img]:my-4 [&_a]:text-accent-primary [&_a]:underline [&_pre]:bg-bg-tertiary [&_pre]:rounded-md [&_blockquote]:border-l-accent-primary",
      },
    },
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
    editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
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
        <ToolbarButton label="링크" active={editor?.isActive("link")} disabled={!editor} onClick={addLink}>
          <LinkIcon className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          label="이미지"
          disabled={!editor || isUploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
        </ToolbarButton>
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
      {uploadError && (
        <div className="border-b border-accent-danger/30 bg-accent-danger/10 px-3 py-2 text-sm text-accent-danger">
          {uploadError}
        </div>
      )}
      <div className="overflow-y-auto px-4 py-3" style={{ minHeight: height, maxHeight: Math.max(height, 720) }}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
