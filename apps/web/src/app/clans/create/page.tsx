"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { clanApi } from "@/lib/api-client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Skeleton,
} from "@/components/ui";
import { ArrowLeft, Shield, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

// ========================================
// 캐릭터 카운터 색상 계산 헬퍼
// ========================================

/**
 * 사용량 비율에 따른 색상 클래스 반환
 * - <60%: 초록 (여유)
 * - <85%: 주황 (주의)
 * - >=85%: 빨강 (위험)
 */
function getCounterColor(current: number, max: number): string {
  const ratio = current / max;
  if (ratio < 0.6) return "text-emerald-400";
  if (ratio < 0.85) return "text-orange-400";
  return "text-red-400";
}

export default function CreateClanPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();

  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [description, setDescription] = useState("");
  const [isRecruiting, setIsRecruiting] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push("/auth/login");
    }
  }, [isAuthenticated, authLoading, router]);

  // 실시간 태그 프리뷰 텍스트
  const tagPreview = useMemo(() => {
    const displayTag = tag.trim() || "TAG";
    const displayName = name.trim() || "클랜이름";
    return `[${displayTag}] ${displayName}`;
  }, [tag, name]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      setError("클랜 이름을 입력해주세요.");
      return;
    }
    if (!tag.trim()) {
      setError("클랜 태그를 입력해주세요.");
      return;
    }
    if (tag.length < 2 || tag.length > 5) {
      setError("클랜 태그는 2~5자여야 합니다.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const clan = await clanApi.createClan({
        name: name.trim(),
        tag: tag.trim().toUpperCase(),
        description: description.trim() || undefined,
        isRecruiting,
      });
      router.push(`/clans/${clan.id}`);
    } catch (err: any) {
      setError(
        err.response?.data?.message ||
          err.message ||
          "클랜 생성에 실패했습니다.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (authLoading || !isAuthenticated) {
    return (
      <div className="flex-grow p-4 md:p-8 animate-fade-in">
        <div className="container mx-auto max-w-2xl">
          <Skeleton className="h-9 w-24 mb-4" />
          <Card>
            <CardHeader>
              <Skeleton className="h-7 w-32" />
            </CardHeader>
            <CardContent className="space-y-4">
              <Skeleton className="h-10 w-full rounded-lg" />
              <Skeleton className="h-10 w-full rounded-lg" />
              <Skeleton className="h-24 w-full rounded-lg" />
              <Skeleton className="h-10 w-28 rounded-lg" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-grow p-4 md:p-8 animate-fade-in">
      <div className="container mx-auto max-w-2xl">
        {/* 뒤로가기 버튼 */}
        <Button
          variant="ghost"
          className="mb-4"
          onClick={() => router.push("/clans")}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          클랜 목록
        </Button>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-6 w-6 text-accent-primary" />
              클랜 만들기
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* 실시간 태그 프리뷰 */}
              <div className="bg-bg-tertiary border border-bg-elevated rounded-lg p-4 text-center">
                <p className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1.5">
                  미리보기
                </p>
                <p className="text-lg font-bold text-text-primary">
                  {tagPreview}
                </p>
              </div>

              {/* 클랜 이름 — Floating label */}
              <div className="relative">
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={30}
                  placeholder=" "
                  className="peer w-full px-3 pt-5 pb-2 bg-bg-tertiary border border-bg-elevated rounded-lg text-sm text-text-primary placeholder-transparent focus:outline-none focus:ring-2 focus:ring-accent-primary"
                />
                <label
                  htmlFor="name"
                  className="absolute left-3 top-1.5 text-[10px] text-text-tertiary transition-all peer-placeholder-shown:top-3.5 peer-placeholder-shown:text-sm peer-focus:top-1.5 peer-focus:text-[10px] peer-focus:text-accent-primary pointer-events-none"
                >
                  클랜 이름
                </label>
                <div className="flex items-center justify-between mt-1 px-1">
                  <span className="text-[10px] text-text-tertiary">
                    최대 30자
                  </span>
                  <span
                    className={cn(
                      "text-[10px] font-medium tabular-nums",
                      getCounterColor(name.length, 30),
                    )}
                  >
                    {name.length}/30
                  </span>
                </div>
              </div>

              {/* 클랜 태그 — Floating label */}
              <div className="relative">
                <input
                  id="tag"
                  type="text"
                  value={tag}
                  onChange={(e) => setTag(e.target.value.toUpperCase())}
                  maxLength={5}
                  placeholder=" "
                  className="peer w-full px-3 pt-5 pb-2 bg-bg-tertiary border border-bg-elevated rounded-lg text-sm text-text-primary uppercase placeholder-transparent focus:outline-none focus:ring-2 focus:ring-accent-primary"
                />
                <label
                  htmlFor="tag"
                  className="absolute left-3 top-1.5 text-[10px] text-text-tertiary transition-all peer-placeholder-shown:top-3.5 peer-placeholder-shown:text-sm peer-focus:top-1.5 peer-focus:text-[10px] peer-focus:text-accent-primary pointer-events-none"
                >
                  클랜 태그 (예: NEXUS)
                </label>
                <div className="flex items-center justify-between mt-1 px-1">
                  <span className="text-[10px] text-text-tertiary">
                    2~5자 영문/숫자
                  </span>
                  <span
                    className={cn(
                      "text-[10px] font-medium tabular-nums",
                      getCounterColor(tag.length, 5),
                    )}
                  >
                    {tag.length}/5
                  </span>
                </div>
              </div>

              {/* 클랜 소개 — Floating label */}
              <div className="relative">
                <textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  maxLength={500}
                  placeholder=" "
                  className="peer w-full px-3 pt-5 pb-2 bg-bg-tertiary border border-bg-elevated rounded-lg text-sm text-text-primary placeholder-transparent focus:outline-none focus:ring-2 focus:ring-accent-primary resize-none"
                />
                <label
                  htmlFor="description"
                  className="absolute left-3 top-1.5 text-[10px] text-text-tertiary transition-all peer-placeholder-shown:top-3.5 peer-placeholder-shown:text-sm peer-focus:top-1.5 peer-focus:text-[10px] peer-focus:text-accent-primary pointer-events-none"
                >
                  클랜 소개 (선택)
                </label>
                <div className="flex items-center justify-between mt-1 px-1">
                  <span className="text-[10px] text-text-tertiary">
                    최대 500자
                  </span>
                  <span
                    className={cn(
                      "text-[10px] font-medium tabular-nums",
                      getCounterColor(description.length, 500),
                    )}
                  >
                    {description.length}/500
                  </span>
                </div>
              </div>

              {/* 모집 토글 */}
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium text-text-primary">
                    클랜원 모집
                  </label>
                  <p className="text-xs text-text-tertiary">
                    활성화하면 다른 유저가 클랜에 가입할 수 있습니다
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsRecruiting(!isRecruiting)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    isRecruiting ? "bg-accent-primary" : "bg-bg-elevated"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      isRecruiting ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>

              {/* 에러 */}
              {error && (
                <div className="bg-accent-danger/10 border border-accent-danger/30 rounded-lg p-3">
                  <p className="text-accent-danger text-sm">{error}</p>
                </div>
              )}

              {/* 제출 버튼 */}
              <div className="flex justify-end gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => router.push("/clans")}
                >
                  취소
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  <Plus className="h-4 w-4 mr-2" />
                  {isSubmitting ? "생성 중..." : "클랜 만들기"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
