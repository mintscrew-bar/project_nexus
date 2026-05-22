"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { communityApi, boardApi, type Board } from "@/lib/api-client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Input,
  Label,
  Skeleton,
} from "@/components/ui";
import { MarkdownEditor } from "@/components/community/MarkdownEditor";
import {
  ArrowLeft,
  Send,
  Megaphone,
  MessageCircle,
  Lightbulb,
  HelpCircle,
  X,
  Tag,
  MessagesSquare,
} from "lucide-react";

// 게시판 iconName(lucide) → 컴포넌트 매핑. 미지정/미등록은 기본 아이콘.
const ICON_MAP: Record<string, React.ElementType> = {
  Megaphone,
  MessageCircle,
  Lightbulb,
  HelpCircle,
};
const resolveIcon = (name?: string | null): React.ElementType =>
  (name && ICON_MAP[name]) || MessagesSquare;

// 권한 서열 — 값이 클수록 상위
const ROLE_RANK: Record<string, number> = { USER: 0, MODERATOR: 1, ADMIN: 2 };

export default function WritePostPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuthStore();

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [boards, setBoards] = useState<Board[]>([]);
  const [boardId, setBoardId] = useState<string>("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 태그 정규화: 소문자, 한글/영문/숫자만 허용, 최대 20자
  const normalizeTag = (val: string) =>
    val
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9가-힣]/g, "")
      .slice(0, 20);
  // 유저 권한으로 글쓰기 가능한 게시판만 노출 (writeRole 충족)
  const userRank = ROLE_RANK[user?.role ?? "USER"] ?? 0;
  const visibleBoards = boards.filter(
    (b) => !b.writeRole || userRank >= (ROLE_RANK[b.writeRole] ?? 0),
  );

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const normalized = normalizeTag(tagInput);
      if (normalized && !tags.includes(normalized) && tags.length < 5) {
        setTags([...tags, normalized]);
      }
      setTagInput("");
    }
  };

  const removeTag = (tag: string) => setTags(tags.filter((t) => t !== tag));

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push("/auth/login");
    }
  }, [isAuthenticated, authLoading, router]);

  // 게시판 목록 로드 + 기본 선택(첫 작성 가능 게시판)
  useEffect(() => {
    boardApi
      .list()
      .then((data) => {
        setBoards(data);
        const writable = data.filter(
          (b) => !b.writeRole || userRank >= (ROLE_RANK[b.writeRole] ?? 0),
        );
        // 자유게시판(free) 우선, 없으면 첫 작성 가능 게시판
        const def =
          writable.find((b) => b.slug === "free") ?? writable[0];
        if (def) setBoardId((prev) => prev || def.id);
      })
      .catch(() => setError("게시판 목록을 불러오지 못했습니다."));
    // userRank는 user 변경 시에만 바뀌므로 의존성에 포함
  }, [userRank]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      setError("제목을 입력해주세요.");
      return;
    }
    if (!content.trim()) {
      setError("내용을 입력해주세요.");
      return;
    }
    if (!boardId) {
      setError("게시판을 선택해주세요.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const post = await communityApi.createPost({
        title: title.trim(),
        content: content.trim(),
        boardId,
        tags: tags.length > 0 ? tags : undefined,
      });
      router.push(`/community/${post.id}`);
    } catch (err: any) {
      setError(err.message || "게시글 작성에 실패했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (authLoading || !isAuthenticated) {
    return (
      <div className="flex-grow p-4 md:p-8 animate-fade-in">
        <div className="container mx-auto max-w-3xl">
          <Skeleton className="h-9 w-20 mb-4" />
          <Card>
            <CardHeader>
              <Skeleton className="h-7 w-28" />
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-9 w-16 rounded-lg" />
                ))}
              </div>
              <Skeleton className="h-10 w-full rounded-lg" />
              <Skeleton className="h-64 w-full rounded-lg" />
              <Skeleton className="h-10 w-24 rounded-lg" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-grow p-4 md:p-8 animate-fade-in">
      <div className="container mx-auto max-w-3xl">
        {/* Back Button */}
        <Button
          variant="ghost"
          className="mb-4"
          onClick={() => router.push("/community")}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          목록으로
        </Button>

        <Card>
          <CardHeader>
            <CardTitle>새 글 작성</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* 게시판 선택 */}
              <div>
                <Label>게시판</Label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
                  {visibleBoards.map((board) => {
                    const Icon = resolveIcon(board.iconName);
                    return (
                      <button
                        key={board.id}
                        type="button"
                        onClick={() => setBoardId(board.id)}
                        className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-colors ${
                          boardId === board.id
                            ? "border-accent-primary bg-accent-primary/10 text-accent-primary"
                            : "border-bg-tertiary bg-bg-tertiary hover:border-accent-primary/50"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        <span className="font-medium">{board.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Title */}
              <div>
                <Label htmlFor="title">제목</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="제목을 입력하세요"
                  className="mt-1"
                  maxLength={200}
                />
              </div>

              {/* Content */}
              <div>
                <Label>내용</Label>
                <div className="mt-1">
                  <MarkdownEditor
                    value={content}
                    onChange={setContent}
                    height={400}
                  />
                </div>
              </div>

              {/* Tags */}
              <div>
                <Label>
                  태그{" "}
                  <span className="text-text-tertiary text-xs font-normal">
                    (최대 5개, Enter 또는 쉼표로 추가)
                  </span>
                </Label>
                <div className="mt-1 flex flex-wrap gap-2 p-2 rounded-lg border border-bg-tertiary bg-bg-secondary min-h-[42px] focus-within:border-accent-primary/50 transition-colors">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-accent-primary/15 text-accent-primary text-sm"
                    >
                      <Tag className="h-3 w-3" />
                      {tag}
                      <button
                        type="button"
                        onClick={() => removeTag(tag)}
                        className="hover:text-accent-danger transition-colors"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                  {tags.length < 5 && (
                    <input
                      type="text"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={handleTagKeyDown}
                      placeholder={tags.length === 0 ? "태그 입력..." : ""}
                      className="flex-1 min-w-[120px] bg-transparent text-sm outline-none placeholder:text-text-tertiary"
                    />
                  )}
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="bg-accent-danger/10 border border-accent-danger/30 rounded-lg p-3">
                  <p className="text-accent-danger text-sm">{error}</p>
                </div>
              )}

              {/* Submit */}
              <div className="flex justify-end gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => router.push("/community")}
                >
                  취소
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  <Send className="h-4 w-4 mr-2" />
                  {isSubmitting ? "작성 중..." : "작성하기"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
