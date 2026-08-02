"use client";

import dynamic from "next/dynamic";
import { useRef } from "react";
import "@uiw/react-md-editor/markdown-editor.css";
import "@uiw/react-markdown-preview/markdown.css";
import { communityApi } from "@/lib/api-client";

const MDEditor = dynamic(() => import("@uiw/react-md-editor"), { ssr: false });

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  height?: number;
}

export function MarkdownEditor({
  value,
  onChange,
  placeholder = "내용을 입력하세요 (마크다운 지원)",
  height = 400,
}: MarkdownEditorProps) {
  // 숨겨진 파일 input ref → 이미지 업로드 버튼 클릭 시 트리거
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = async (file: File) => {
    try {
      const { url } = await communityApi.uploadImage(file);
      // API 서버(4000)의 절대 URL로 변환하여 마크다운에 삽입
      const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      // /uploads/... 경로이므로 apiBase에서 /api 제거
      const baseOrigin = apiBase.replace(/\/api$/, "");
      const fullUrl = `${baseOrigin}${url}`;
      const markdown = `![image](${fullUrl})`;
      onChange(value ? `${value}\n${markdown}` : markdown);
    } catch {
      alert("이미지 업로드에 실패했습니다.");
    }
  };

  return (
    <div data-color-mode="dark">
      {/* 숨겨진 파일 인풋 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleImageUpload(file);
          // 같은 파일 재업로드 가능하도록 value 초기화
          e.target.value = "";
        }}
      />
      {/* 이미지 업로드 버튼 (에디터 위) */}
      <div className="flex justify-end mb-1">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="text-xs px-2 py-1 rounded bg-bg-tertiary text-text-secondary hover:bg-bg-elevated hover:text-text-primary transition-colors"
        >
          🖼 이미지 업로드
        </button>
      </div>
      <MDEditor
        value={value}
        onChange={(val) => onChange(val || "")}
        height={height}
        textareaProps={{ placeholder }}
        preview="edit"
      />
    </div>
  );
}
