"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { communityApi } from "@/lib/api-client";
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
} from "lucide-react";

type PostCategory = "NOTICE" | "FREE" | "TIP" | "QNA";

const categories: { value: PostCategory; label: string; icon: React.ElementType }[] = [
  { value: "FREE", label: "자유", icon: MessageCircle },
  { value: "TIP", label: "팁", icon: Lightbulb },
  { value: "QNA", label: "Q&A", icon: HelpCircle },
  { value: "NOTICE", label: "공지", icon: Megaphone },
];

export default function WritePostPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState<PostCategory>("FREE");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 태그 정규화: 소문자, 한글/영문/숫자만 허용, 최대 20자
  const normalizeTag = (val: string) =>
    val.trim().toLowerCase().replace(/[^a-z0-9가-힣]/g, "").slice(0, 20);

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

    setIsSubmitting(true);
    setError(null);

    try {
      const post = await communityApi.createPost({
        title: title.trim(),
        content: content.trim(),
        category,
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
              {/* Category */}
              <div>
                <Label>카테고리</Label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
                  {categories.map((cat) => {
                    const Icon = cat.icon;
                    return (
                      <button
                        key={cat.value}
                        type="button"
                        onClick={() => setCategory(cat.value)}
                        className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-colors ${
                          category === cat.value
                            ? "border-accent-primary bg-accent-primary/10 text-accent-primary"
                            : "border-bg-tertiary bg-bg-tertiary hover:border-accent-primary/50"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        <span className="font-medium">{cat.label}</span>
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
                <Label>태그 <span className="text-text-tertiary text-xs font-normal">(최대 5개, Enter 또는 쉼표로 추가)</span></Label>
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
