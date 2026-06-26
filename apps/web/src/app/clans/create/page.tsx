"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
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
import { ArrowLeft, Shield, Plus, ImagePlus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ClanEmblem, DEFAULT_CLAN_ACCENT } from "@/components/domain/ClanEmblem";

/** 대표색 프리셋 팔레트 */
const ACCENT_PRESETS = [
  "#667EEA",
  "#F43F5E",
  "#F59E0B",
  "#10B981",
  "#22D3EE",
  "#A855F7",
  "#EC4899",
  "#64748B",
];

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

  // 정체성: 대표색 + 로고/배너 파일(생성 후 업로드)
  const [accentColor, setAccentColor] = useState(DEFAULT_CLAN_ACCENT);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  // 파일 → 미리보기 object URL (변경 시 이전 URL 정리)
  const logoPreview = useMemo(
    () => (logoFile ? URL.createObjectURL(logoFile) : null),
    [logoFile],
  );
  const bannerPreview = useMemo(
    () => (bannerFile ? URL.createObjectURL(bannerFile) : null),
    [bannerFile],
  );
  useEffect(() => {
    return () => {
      if (logoPreview) URL.revokeObjectURL(logoPreview);
    };
  }, [logoPreview]);
  useEffect(() => {
    return () => {
      if (bannerPreview) URL.revokeObjectURL(bannerPreview);
    };
  }, [bannerPreview]);

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
        accentColor:
          accentColor !== DEFAULT_CLAN_ACCENT ? accentColor : undefined,
      });
      // 클랜 생성 후 이미지 업로드 (id 필요). 이미지 실패는 치명적이지 않으므로 무시.
      if (logoFile) {
        await clanApi.uploadClanLogo(clan.id, logoFile).catch(() => null);
      }
      if (bannerFile) {
        await clanApi.uploadClanBanner(clan.id, bannerFile).catch(() => null);
      }
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
              {/* 정체성 미리보기 + 편집 (배너 / 엠블럼 / 대표색) */}
              <div className="overflow-hidden rounded-lg border border-bg-elevated">
                {/* 배너 */}
                <div
                  onClick={() => bannerInputRef.current?.click()}
                  className="relative h-28 w-full cursor-pointer bg-bg-tertiary"
                >
                  {bannerPreview ? (
                    <Image
                      src={bannerPreview}
                      alt="배너 미리보기"
                      fill
                      className="object-cover"
                      unoptimized
                    />
                  ) : (
                    <span className="absolute inset-0 flex items-center justify-center gap-1.5 text-xs text-text-tertiary">
                      <ImagePlus className="h-4 w-4" /> 배너 추가 (선택)
                    </span>
                  )}
                  {bannerPreview && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setBannerFile(null);
                        if (bannerInputRef.current)
                          bannerInputRef.current.value = "";
                      }}
                      className="absolute right-2 top-2 rounded-md bg-black/60 p-1 text-white hover:bg-black/80"
                      aria-label="배너 제거"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* 엠블럼 + 태그 프리뷰 */}
                <div className="-mt-8 flex items-center gap-3 px-4 pt-0">
                  <div
                    onClick={() => logoInputRef.current?.click()}
                    className="relative cursor-pointer"
                  >
                    <ClanEmblem
                      tag={tag.trim() || "TAG"}
                      logo={logoPreview}
                      accentColor={accentColor}
                      size={56}
                      rounded="rounded-xl"
                      className="ring-2 ring-bg-secondary"
                    />
                    <span className="absolute -bottom-1 -right-1 rounded-full bg-accent-primary p-1">
                      <ImagePlus className="h-3 w-3 text-white" />
                    </span>
                  </div>
                  <div className="min-w-0 pt-7">
                    <p className="text-[10px] uppercase tracking-wider text-text-tertiary">
                      미리보기
                    </p>
                    <p className="truncate text-lg font-bold text-text-primary">
                      {tagPreview}
                    </p>
                  </div>
                </div>

                {/* 대표색 팔레트 */}
                <div className="flex flex-wrap items-center gap-2 px-4 pb-4 pt-3">
                  <span className="text-[10px] text-text-tertiary">대표색</span>
                  {ACCENT_PRESETS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setAccentColor(c)}
                      aria-label={`대표색 ${c}`}
                      className={cn(
                        "h-6 w-6 rounded-full border-2 transition-transform hover:scale-110",
                        accentColor.toUpperCase() === c
                          ? "border-text-primary"
                          : "border-transparent",
                      )}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                  {/* 커스텀 색상 */}
                  <label className="relative h-6 w-6 cursor-pointer overflow-hidden rounded-full border border-bg-elevated">
                    <input
                      type="color"
                      value={accentColor}
                      onChange={(e) => setAccentColor(e.target.value)}
                      className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                      aria-label="커스텀 대표색"
                    />
                    <span
                      className="flex h-full w-full items-center justify-center text-[9px] font-black text-white"
                      style={{ backgroundColor: accentColor }}
                    >
                      +
                    </span>
                  </label>
                </div>
              </div>

              {/* 숨김 파일 입력 */}
              <input
                ref={logoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
              />
              <input
                ref={bannerInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => setBannerFile(e.target.files?.[0] ?? null)}
              />

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
