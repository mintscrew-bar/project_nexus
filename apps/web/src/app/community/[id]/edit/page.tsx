"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
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
  LoadingSpinner,
} from "@/components/ui";
import { MarkdownEditor } from "@/components/community/MarkdownEditor";
import { useToast } from "@/components/ui/Toast";
import {
  ArrowLeft,
  Save,
  Megaphone,
  MessageCircle,
  Lightbulb,
  HelpCircle,
} from "lucide-react";

type PostCategory = "NOTICE" | "FREE" | "TIP" | "QNA";

const categories: { value: PostCategory; label: string; icon: React.ElementType }[] = [
  { value: "FREE", label: "자유", icon: MessageCircle },
  { value: "TIP", label: "팁", icon: Lightbulb },
  { value: "QNA", label: "Q&A", icon: HelpCircle },
  { value: "NOTICE", label: "공지", icon: Megaphone },
];

export default function EditPostPage() {
  const params = useParams();
  const router = useRouter();
  const postId = params.id as string;
  const { user, isAuthenticated, isLoading: authLoading } = useAuthStore();
  const { addToast } = useToast();

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState<PostCategory>("FREE");
  const [isLoadingPost, setIsLoadingPost] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push("/auth/login");
    }
  }, [isAuthenticated, authLoading, router]);

  useEffect(() => {
    if (!postId) return;

    const fetchPost = async () => {
      try {
        const post = await communityApi.getPost(postId);

        // 본인 게시글인지 확인
        if (user && post.author.id !== user.id) {
          addToast("수정 권한이 없습니다.", "error");
          router.push(`/community/${postId}`);
          return;
        }

        setTitle(post.title);
        setContent(post.content);
        setCategory(post.category);
      } catch {
        addToast("게시글을 불러오는데 실패했습니다.", "error");
        router.push("/community");
      } finally {
        setIsLoadingPost(false);
      }
    };

    if (!authLoading && isAuthenticated) {
      fetchPost();
    }
  }, [postId, user, isAuthenticated, authLoading, router, addToast]);

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
      await communityApi.updatePost(postId, {
        title: title.trim(),
        content: content.trim(),
      });
      addToast("게시글이 수정되었습니다.", "success");
      router.push(`/community/${postId}`);
    } catch (err: any) {
      setError(err.message || "게시글 수정에 실패했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (authLoading || isLoadingPost) {
    return (
      <div className="flex items-center justify-center flex-grow">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="text-text-secondary mt-4">불러오는 중...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="flex-grow p-4 md:p-8 animate-fade-in">
      <div className="container mx-auto max-w-3xl">
        {/* Back Button */}
        <Button
          variant="ghost"
          className="mb-4"
          onClick={() => router.push(`/community/${postId}`)}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          돌아가기
        </Button>

        <Card>
          <CardHeader>
            <CardTitle>게시글 수정</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Category (수정 불가 - 읽기 전용 표시) */}
              <div>
                <Label>카테고리</Label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
                  {categories.map((cat) => {
                    const Icon = cat.icon;
                    return (
                      <div
                        key={cat.value}
                        className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 ${
                          category === cat.value
                            ? "border-accent-primary bg-accent-primary/10 text-accent-primary"
                            : "border-bg-tertiary bg-bg-tertiary text-text-tertiary opacity-40"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        <span className="font-medium">{cat.label}</span>
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-text-tertiary mt-1">카테고리는 수정할 수 없습니다.</p>
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
                  onClick={() => router.push(`/community/${postId}`)}
                >
                  취소
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  <Save className="h-4 w-4 mr-2" />
                  {isSubmitting ? "저장 중..." : "저장하기"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
