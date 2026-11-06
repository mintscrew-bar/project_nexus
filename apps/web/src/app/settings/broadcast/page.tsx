"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ImagePlus,
  Loader2,
  RotateCcw,
  Save,
  X,
} from "lucide-react";
import {
  DEFAULT_BROADCAST_SETTINGS,
  normalizeBroadcastSettings,
  type BroadcastSettings,
} from "@nexus/types";
import { Button, Switch } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { useAuthStore } from "@/stores/auth-store";
import { broadcastApi } from "@/lib/api-client";

/**
 * 방송 오버레이 꾸미기 — 방송인이 자기 OBS 오버레이를 직접 바꾼다.
 *
 * 오른쪽 미리보기는 /broadcast/sample 을 iframe 으로 띄우고, 고칠 때마다 설정을
 * postMessage 로 보내 바로 다시 그린다(목업 데이터). 저장하면 송출 중인 오버레이도
 * 몇 초 안에(방이 있으면 즉시) 바뀐다.
 */

const MESSAGE_TYPE = "nexus-broadcast-settings";

const PREVIEW_SCENES = [
  { key: "auction", label: "경매" },
  { key: "waiting", label: "대기실" },
  { key: "teamReveal", label: "팀 확정" },
  { key: "matchIntro", label: "경기 소개" },
  { key: "bracketSingle4", label: "대진표" },
  { key: "matchDone", label: "경기 결과" },
  { key: "idle", label: "방송 대기" },
  { key: "break", label: "휴식" },
] as const;

/** 빠른 설정 — 여러 항목을 한 번에 바꾼다. 바꾼 뒤에도 하나씩 더 고칠 수 있다 */
const QUICK_PRESETS: {
  key: BroadcastSettings["preset"];
  label: string;
  desc: string;
  apply: (s: BroadcastSettings) => BroadcastSettings;
}[] = [
  {
    key: "default",
    label: "기본",
    desc: "넥서스 기본 모습",
    apply: (s) => ({
      ...s,
      preset: "default",
      background: { type: "aurora", intensity: 50 },
      transition: {
        ...s.transition,
        style: "wipe",
        speed: "normal",
        showLabel: true,
      },
      show: { ...s.show, englishLabels: true },
      font: "default",
    }),
  },
  {
    key: "minimal",
    label: "미니멀",
    desc: "효과 줄이고 한글만, 담백하게",
    apply: (s) => ({
      ...s,
      preset: "minimal",
      background: { type: "solid", intensity: 30 },
      transition: {
        ...s.transition,
        style: "fade",
        speed: "fast",
        showLabel: false,
      },
      show: { ...s.show, englishLabels: false },
      font: "default",
    }),
  },
  {
    key: "glass",
    label: "화려하게",
    desc: "입자 배경 + 굵은 제목체",
    apply: (s) => ({
      ...s,
      preset: "glass",
      background: { type: "particles", intensity: 75 },
      transition: {
        ...s.transition,
        style: "slide",
        speed: "normal",
        showLabel: true,
      },
      show: { ...s.show, englishLabels: true },
      font: "display",
    }),
  },
];

/** 고를 수 있는 값들의 한글 이름 */
const BACKGROUND_LABELS: Record<
  BroadcastSettings["background"]["type"],
  string
> = {
  aurora: "움직이는 빛",
  gradient: "그라데이션",
  solid: "단색",
  grain: "필름 그레인",
  particles: "입자",
  transparent: "투명",
};
const FONT_LABELS: Record<BroadcastSettings["font"], string> = {
  default: "기본",
  display: "굵은 제목체",
  rounded: "둥근체",
  handwriting: "손글씨",
};
const TRANSITION_LABELS: Record<
  BroadcastSettings["transition"]["style"],
  string
> = {
  wipe: "와이프",
  fade: "페이드",
  slide: "슬라이드",
  none: "없음",
};
const SPEED_LABELS: Record<BroadcastSettings["transition"]["speed"], string> = {
  slow: "느리게",
  normal: "보통",
  fast: "빠르게",
};
const NAME_LABELS: Record<BroadcastSettings["nameDisplay"], string> = {
  nickname: "사이트 닉네임",
  riotId: "Riot ID",
  both: "둘 다",
};

export default function BroadcastSettingsPage() {
  const { isAuthenticated, isLoading } = useAuthStore();
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  const { data: saved } = useQuery({
    queryKey: ["broadcastSettings"],
    queryFn: broadcastApi.getSettings,
    enabled: isAuthenticated,
  });
  const [draft, setDraft] = useState<BroadcastSettings>(
    DEFAULT_BROADCAST_SETTINGS,
  );
  // 서버 값이 처음 도착하면 편집본으로 옮긴다
  const loadedRef = useRef(false);
  useEffect(() => {
    if (saved && !loadedRef.current) {
      loadedRef.current = true;
      setDraft(normalizeBroadcastSettings(saved));
    }
  }, [saved]);

  const dirty = useMemo(
    () =>
      saved !== undefined &&
      JSON.stringify(normalizeBroadcastSettings(saved)) !==
        JSON.stringify(normalizeBroadcastSettings(draft)),
    [saved, draft],
  );

  const save = useMutation({
    mutationFn: () => broadcastApi.updateSettings(draft),
    onSuccess: (next) => {
      queryClient.setQueryData(["broadcastSettings"], next);
      setDraft(next);
      addToast("방송 화면 설정을 저장했습니다", "success");
    },
    onError: () =>
      addToast("저장하지 못했습니다. 다시 시도해 주세요.", "error"),
  });

  const [uploading, setUploading] = useState(false);
  const onLogo = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const { url } = await broadcastApi.uploadLogo(file);
      setDraft((d) => ({ ...d, logoUrl: url }));
    } catch {
      addToast("로고를 올리지 못했습니다. 5MB 이하 이미지만 됩니다.", "error");
    } finally {
      setUploading(false);
    }
  };

  // 편집 도우미 — 중첩 항목 하나만 바꾼다
  const set = useCallback(
    <K extends keyof BroadcastSettings>(key: K, value: BroadcastSettings[K]) =>
      setDraft((d) => ({ ...d, [key]: value })),
    [],
  );

  // ── 미리보기 iframe ──
  const [scene, setScene] = useState<string>("auction");
  const frameRef = useRef<HTMLIFrameElement>(null);
  const post = useCallback(() => {
    frameRef.current?.contentWindow?.postMessage(
      { type: MESSAGE_TYPE, settings: draft },
      window.location.origin,
    );
  }, [draft]);
  useEffect(() => {
    post();
  }, [post]);
  useEffect(() => {
    const onReady = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === `${MESSAGE_TYPE}:ready`) post();
    };
    window.addEventListener("message", onReady);
    return () => window.removeEventListener("message", onReady);
  }, [post]);

  if (!isLoading && !isAuthenticated) {
    return (
      <main className="mx-auto max-w-xl px-4 py-20 text-center">
        <p className="text-text-secondary">
          로그인하면 방송 화면을 꾸밀 수 있습니다.
        </p>
        <Link
          href="/auth/login"
          className="mt-4 inline-block text-accent-primary"
        >
          로그인
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[1600px] px-4 py-6 md:px-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/settings"
            className="inline-flex items-center gap-1.5 text-sm text-text-tertiary hover:text-accent-primary"
          >
            <ArrowLeft className="h-4 w-4" /> 설정
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-text-primary">
            방송 화면 꾸미기
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            OBS 오버레이의 색·로고·배경·전환·효과음을 바꿉니다. 저장하면 송출
            중인 화면에도 바로 반영됩니다.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDraft(DEFAULT_BROADCAST_SETTINGS)}
          >
            <RotateCcw className="mr-1.5 h-4 w-4" /> 기본값으로
          </Button>
          <Button
            size="sm"
            disabled={!dirty || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-1.5 h-4 w-4" />
            )}
            {dirty ? "저장" : "저장됨"}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[440px_minmax(0,1fr)]">
        {/* ── 설정 ── */}
        <div className="space-y-4 xl:max-h-[calc(100vh-180px)] xl:overflow-y-auto xl:pr-2">
          <Section title="빠른 설정">
            <div className="grid grid-cols-3 gap-2">
              {QUICK_PRESETS.map((preset) => (
                <button
                  key={preset.key}
                  type="button"
                  onClick={() => setDraft((d) => preset.apply(d))}
                  className={`rounded-lg border p-3 text-left transition-colors ${
                    draft.preset === preset.key
                      ? "border-accent-primary bg-accent-primary/10"
                      : "border-bg-tertiary hover:bg-bg-tertiary/50"
                  }`}
                >
                  <p className="text-sm font-semibold text-text-primary">
                    {preset.label}
                  </p>
                  <p className="mt-1 text-xs text-text-tertiary">
                    {preset.desc}
                  </p>
                </button>
              ))}
            </div>
          </Section>

          <Section title="색 · 로고 · 제목">
            <div className="grid grid-cols-3 gap-3">
              <ColorField
                label="강조색"
                value={draft.colors.accent}
                fallback="#8B5CF6"
                onChange={(v) => set("colors", { ...draft.colors, accent: v })}
              />
              <ColorField
                label="블루 팀"
                value={draft.colors.blue}
                fallback="#3B82F6"
                onChange={(v) => set("colors", { ...draft.colors, blue: v })}
              />
              <ColorField
                label="레드 팀"
                value={draft.colors.red}
                fallback="#EF4444"
                onChange={(v) => set("colors", { ...draft.colors, red: v })}
              />
            </div>
            <p className="mt-2 text-xs text-text-tertiary">
              비워 두면 클랜 강조색 → 넥서스 기본색을 씁니다.
            </p>
            <div className="mt-4 flex items-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-lg border border-bg-tertiary bg-bg-tertiary/40">
                {draft.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={draft.logoUrl}
                    alt="로고"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-xs text-text-tertiary">NX</span>
                )}
              </div>
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-bg-tertiary px-3 py-2 text-sm text-text-primary hover:bg-bg-tertiary/50">
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ImagePlus className="h-4 w-4" />
                )}
                로고 올리기
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => onLogo(e.target.files?.[0])}
                />
              </label>
              {draft.logoUrl && (
                <button
                  type="button"
                  onClick={() => set("logoUrl", null)}
                  className="text-sm text-text-tertiary hover:text-accent-danger"
                >
                  지우기
                </button>
              )}
            </div>
            <TextField
              label="하단바 제목"
              placeholder="비우면 방 제목"
              value={draft.title}
              max={40}
              onChange={(v) => set("title", v)}
            />
            <TextField
              label="하단바 보조 문구"
              placeholder="비우면 진행 단계(경매 중 등)"
              value={draft.subtitle}
              max={60}
              onChange={(v) => set("subtitle", v)}
            />
          </Section>

          <Section title="보여줄 요소">
            {(
              [
                ["lowerThird", "하단바"],
                ["pool", "경매: 남은 선수 목록"],
                ["bidLog", "경매: 입찰 기록"],
                ["lotStats", "경매: 매물 선수 내전 기록"],
                ["playerBadges", "선수 소개: 랭킹 순위·칭찬"],
                ["englishLabels", "영어 머리글 (LIVE AUCTION 등)"],
              ] as const
            ).map(([key, label]) => (
              <ToggleRow
                key={key}
                label={label}
                checked={draft.show[key]}
                onChange={(v) => set("show", { ...draft.show, [key]: v })}
              />
            ))}
          </Section>

          <Section title="배경 · 크기 · 글꼴">
            <p className="mb-1.5 text-sm text-text-secondary">배경 효과</p>
            <Choice
              options={
                Object.entries(BACKGROUND_LABELS) as [
                  BroadcastSettings["background"]["type"],
                  string,
                ][]
              }
              value={draft.background.type}
              onChange={(v) =>
                set("background", { ...draft.background, type: v })
              }
            />
            {draft.background.type !== "transparent" &&
              draft.background.type !== "solid" && (
                <RangeRow
                  label="효과 세기"
                  min={0}
                  max={100}
                  step={5}
                  value={draft.background.intensity}
                  display={`${draft.background.intensity}`}
                  onChange={(v) =>
                    set("background", { ...draft.background, intensity: v })
                  }
                />
              )}
            {draft.background.type === "transparent" && (
              <p className="mt-2 text-xs text-text-tertiary">
                장면 뒤 배경을 빼고 패널만 띄웁니다. 게임·캠 화면 위에 합성할 때
                쓰세요.
              </p>
            )}
            <RangeRow
              label="크기 배율"
              min={0.8}
              max={1.2}
              step={0.05}
              value={draft.scale}
              display={`${Math.round(draft.scale * 100)}%`}
              onChange={(v) => set("scale", Math.round(v * 100) / 100)}
            />
            <p className="mb-1.5 mt-3 text-sm text-text-secondary">글꼴</p>
            <Choice
              options={
                Object.entries(FONT_LABELS) as [
                  BroadcastSettings["font"],
                  string,
                ][]
              }
              value={draft.font}
              onChange={(v) => set("font", v)}
            />
          </Section>

          <Section title="화면 전환 · 효과음">
            <p className="mb-1.5 text-sm text-text-secondary">전환 방식</p>
            <Choice
              options={
                Object.entries(TRANSITION_LABELS) as [
                  BroadcastSettings["transition"]["style"],
                  string,
                ][]
              }
              value={draft.transition.style}
              onChange={(v) =>
                set("transition", { ...draft.transition, style: v })
              }
            />
            {draft.transition.style !== "none" && (
              <>
                <p className="mb-1.5 mt-3 text-sm text-text-secondary">속도</p>
                <Choice
                  options={
                    Object.entries(SPEED_LABELS) as [
                      BroadcastSettings["transition"]["speed"],
                      string,
                    ][]
                  }
                  value={draft.transition.speed}
                  onChange={(v) =>
                    set("transition", { ...draft.transition, speed: v })
                  }
                />
                <ToggleRow
                  label="전환 때 장면 이름 띄우기"
                  checked={draft.transition.showLabel}
                  onChange={(v) =>
                    set("transition", { ...draft.transition, showLabel: v })
                  }
                />
              </>
            )}
            <ToggleRow
              label="경매 효과음 (입찰·낙찰)"
              checked={draft.sfx.enabled}
              onChange={(v) => set("sfx", { ...draft.sfx, enabled: v })}
            />
            {draft.sfx.enabled && (
              <>
                <RangeRow
                  label="효과음 볼륨"
                  min={0}
                  max={100}
                  step={5}
                  value={draft.sfx.volume}
                  display={`${draft.sfx.volume}`}
                  onChange={(v) => set("sfx", { ...draft.sfx, volume: v })}
                />
                <p className="text-xs text-text-tertiary">
                  OBS 브라우저 소스 속성에서 &quot;OBS를 통해 오디오
                  제어&quot;를 켜야 방송에 소리가 나갑니다.
                </p>
              </>
            )}
          </Section>

          <Section title="이름 표시">
            <p className="mb-1.5 text-sm text-text-secondary">선수 이름</p>
            <Choice
              options={
                Object.entries(NAME_LABELS) as [
                  BroadcastSettings["nameDisplay"],
                  string,
                ][]
              }
              value={draft.nameDisplay}
              onChange={(v) => set("nameDisplay", v)}
            />
            <p className="mb-1.5 mt-3 text-sm text-text-secondary">팀 이름</p>
            <Choice
              options={[
                ["team", "팀 이름"],
                ["captain", "팀장 이름"],
              ]}
              value={draft.teamLabel}
              onChange={(v) => set("teamLabel", v)}
            />
          </Section>

          <Section title="대기 · 휴식 화면 문구">
            <TextField
              label="방송 대기 제목"
              placeholder="곧 방송을 시작합니다"
              value={draft.idle.title}
              max={40}
              onChange={(v) => set("idle", { ...draft.idle, title: v })}
            />
            <TextField
              label="방송 대기 보조 문구"
              placeholder="Standby"
              value={draft.idle.subtitle}
              max={60}
              onChange={(v) => set("idle", { ...draft.idle, subtitle: v })}
            />
            <TextField
              label="휴식 제목"
              placeholder="잠시 후 계속됩니다"
              value={draft.breakScreen.title}
              max={40}
              onChange={(v) =>
                set("breakScreen", { ...draft.breakScreen, title: v })
              }
            />
            <TextField
              label="휴식 보조 문구"
              placeholder="Be Right Back"
              value={draft.breakScreen.subtitle}
              max={60}
              onChange={(v) =>
                set("breakScreen", { ...draft.breakScreen, subtitle: v })
              }
            />
          </Section>
        </div>

        {/* ── 미리보기 ── */}
        <div className="xl:sticky xl:top-20 xl:self-start">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {PREVIEW_SCENES.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setScene(item.key)}
                className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                  scene === item.key
                    ? "bg-accent-primary text-accent-on"
                    : "bg-bg-tertiary text-text-secondary hover:text-text-primary"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-bg-tertiary bg-black">
            <iframe
              ref={frameRef}
              key={scene}
              src={`/broadcast/sample?scene=${scene}`}
              title="방송 화면 미리보기"
              className="absolute inset-0 h-full w-full"
              onLoad={post}
            />
          </div>
          <p className="mt-2 text-xs text-text-tertiary">
            예시 데이터로 그린 미리보기입니다. 장면을 바꾸면 전환 효과도 볼 수
            있습니다.
          </p>
        </div>
      </div>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-bg-tertiary bg-bg-secondary p-4">
      <h2 className="mb-3 text-sm font-bold text-text-primary">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Choice<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly (readonly [T, string])[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(([key, label]) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          aria-pressed={value === key}
          className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
            value === key
              ? "border-accent-primary bg-accent-primary/10 text-accent-primary"
              : "border-bg-tertiary text-text-secondary hover:text-text-primary"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 py-1">
      <span className="text-sm text-text-secondary">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

function RangeRow({
  label,
  min,
  max,
  step,
  value,
  display,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  display: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="mt-3">
      <div className="mb-1 flex justify-between text-sm">
        <span className="text-text-secondary">{label}</span>
        <span className="tabular-nums text-text-primary">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[var(--accent-primary,#8B5CF6)]"
      />
    </div>
  );
}

function ColorField({
  label,
  value,
  fallback,
  onChange,
}: {
  label: string;
  value: string | null;
  fallback: string;
  onChange: (value: string | null) => void;
}) {
  return (
    <div>
      <p className="mb-1 text-xs text-text-secondary">{label}</p>
      <div className="flex items-center gap-1.5">
        <input
          type="color"
          value={value ?? fallback}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="h-9 w-12 cursor-pointer rounded border border-bg-tertiary bg-transparent"
          aria-label={`${label} 고르기`}
        />
        {value ? (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-text-tertiary hover:text-text-primary"
            aria-label={`${label} 기본값으로`}
          >
            <X className="h-4 w-4" />
          </button>
        ) : (
          <span className="text-[11px] text-text-tertiary">기본</span>
        )}
      </div>
    </div>
  );
}

function TextField({
  label,
  placeholder,
  value,
  max,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string | null;
  max: number;
  onChange: (value: string | null) => void;
}) {
  return (
    <label className="mt-3 block">
      <span className="mb-1 block text-sm text-text-secondary">{label}</span>
      <input
        type="text"
        value={value ?? ""}
        maxLength={max}
        placeholder={placeholder}
        onChange={(e) =>
          onChange(e.target.value === "" ? null : e.target.value)
        }
        className="w-full rounded-lg border border-bg-tertiary bg-bg-primary px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent-primary focus:outline-none"
      />
    </label>
  );
}
