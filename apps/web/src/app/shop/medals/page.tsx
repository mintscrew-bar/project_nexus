"use client";

import Link from "next/link";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Medal } from "lucide-react";
import { MEDAL_LABEL } from "@/components/cosmetics/catalog";
import { REASON_LABEL } from "@/components/cosmetics/MedalChip";
import { useAuthStore } from "@/stores/auth-store";
import { medalApi, type MedalHistoryItem } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const PAGE = 30;

/** KST 기준 날짜 머리 — 「오늘」「어제」「11월 3일 (월)」 */
function dayLabel(iso: string) {
  const fmt = (d: Date) =>
    d.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });
  const d = new Date(iso);
  const now = new Date();
  if (fmt(d) === fmt(now)) return "오늘";
  if (fmt(d) === fmt(new Date(now.getTime() - 86400000))) return "어제";
  return d.toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    // 24시간제 — 「오후 04:32」는 칸이 좁아 두 줄로 꺾인다
    hourCycle: "h23",
  });
}

/** 내역을 날짜(KST)별로 묶는다 — 이미 최신순이라 순서는 그대로 */
function groupByDay(items: MedalHistoryItem[]) {
  const groups: { label: string; items: MedalHistoryItem[] }[] = [];
  for (const it of items) {
    const label = dayLabel(it.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(it);
    else groups.push({ label, items: [it] });
  }
  return groups;
}

/** 금액 칸 — 받은 것은 금색, 나간 것은 빨강, 0 은 하루 상한에 걸린 지급 */
function Amount({ value }: { value: number }) {
  return (
    <span
      className={cn(
        "w-16 text-right font-black tabular-nums",
        value > 0
          ? "text-amber-200"
          : value < 0
            ? "text-accent-danger"
            : "text-text-tertiary",
      )}
    >
      {value > 0 ? `+${value.toLocaleString()}` : value === 0 ? "상한" : value}
    </span>
  );
}

/**
 * 메달 내역 전체 화면 (Task 22).
 *
 * 헤더 칩 팝오버는 최근 8줄만 보여 준다. 여기서는 잔액·오늘 상한 진행·사유별 합계와
 * 전체 내역을 날짜별로 본다. 내역은 서버 커서 페이지(한 번에 30줄)로 이어 읽는다.
 */
export default function MedalHistoryPage() {
  const { isAuthenticated } = useAuthStore();

  const summary = useQuery({
    queryKey: ["medals", "summary"],
    queryFn: medalApi.getSummary,
    enabled: isAuthenticated,
  });

  const history = useInfiniteQuery({
    queryKey: ["medals", "history", "all"],
    queryFn: ({ pageParam }) =>
      medalApi.getHistory({ cursor: pageParam, limit: PAGE }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: isAuthenticated,
  });

  if (!isAuthenticated) {
    return (
      <div className="container mx-auto max-w-3xl px-6 py-20 text-center">
        <Medal className="mx-auto h-10 w-10 text-amber-300" />
        <p className="mt-4 text-sm text-text-secondary">
          로그인하면 {MEDAL_LABEL} 내역을 볼 수 있어요.
        </p>
        <Link
          href="/auth/login"
          className="mt-6 inline-flex h-10 items-center rounded-lg bg-accent-primary px-5 text-sm font-black text-accent-on"
        >
          로그인
        </Link>
      </div>
    );
  }

  const s = summary.data;
  const items = history.data?.pages.flatMap((p) => p.items) ?? [];
  const todayPct = s
    ? Math.min(100, Math.round((s.today.earned / s.today.cap) * 100))
    : 0;

  return (
    <div className="container mx-auto max-w-3xl space-y-6 px-4 py-6 md:px-6">
      <div>
        <Link
          href="/shop"
          className="inline-flex items-center gap-1 text-xs font-bold text-text-tertiary hover:text-text-secondary"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {MEDAL_LABEL} 상점
        </Link>
        <h1 className="mt-1 text-2xl font-black text-text-primary">
          {MEDAL_LABEL} 내역
        </h1>
      </div>

      {/* 요약 — 잔액·오늘 상한·받은/쓴 합계 */}
      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-amber-400/10 p-4">
          <div className="text-xs font-bold text-text-tertiary">
            가진 {MEDAL_LABEL}
          </div>
          <div className="mt-1 flex items-center gap-2 text-2xl font-black tabular-nums text-text-primary">
            <Medal className="h-6 w-6 text-amber-300" />
            {s ? s.balance.toLocaleString() : "–"}
          </div>
        </div>
        <div className="rounded-xl bg-bg-secondary p-4">
          <div className="text-xs font-bold text-text-tertiary">
            오늘 받은 양 (하루 상한)
          </div>
          <div className="mt-1 text-2xl font-black tabular-nums text-text-primary">
            {s ? s.today.earned : "–"}
            <span className="text-sm font-bold text-text-tertiary">
              {" "}
              / {s?.today.cap ?? "–"}
            </span>
          </div>
          {/* 하루 상한 진행 — 첫 내전 보너스·구매·운영자 지급은 상한 밖이라 여기 안 잡힌다 */}
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-bg-tertiary">
            <div
              className={cn(
                "h-full rounded-full",
                todayPct >= 100 ? "bg-text-tertiary" : "bg-amber-300",
              )}
              style={{ width: `${todayPct}%` }}
            />
          </div>
        </div>
        <div className="rounded-xl bg-bg-secondary p-4">
          <div className="text-xs font-bold text-text-tertiary">지금까지</div>
          <div className="mt-1 space-y-0.5 text-sm">
            <div className="flex justify-between">
              <span className="text-text-secondary">받은 것</span>
              <span className="font-black tabular-nums text-amber-200">
                {s ? `+${s.earned.toLocaleString()}` : "–"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-secondary">쓴 것</span>
              <span className="font-black tabular-nums text-text-primary">
                {s ? s.spent.toLocaleString() : "–"}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* 사유별 합계 — 무엇으로 많이 받았는지 */}
      {s && s.byReason.length > 0 && (
        <section className="flex flex-wrap gap-1.5">
          {s.byReason.map((r) => (
            <span
              key={r.reason}
              className="rounded-md bg-bg-tertiary/70 px-2 py-1 text-xs font-bold text-text-secondary"
            >
              {REASON_LABEL[r.reason] ?? r.reason}{" "}
              <span
                className={
                  r.amount > 0 ? "text-amber-200" : "text-accent-danger"
                }
              >
                {r.amount > 0 ? `+${r.amount.toLocaleString()}` : r.amount}
              </span>
            </span>
          ))}
        </section>
      )}

      {/* 전체 내역 — 날짜별 */}
      <section className="space-y-5">
        {history.isLoading && (
          <div className="py-10 text-center text-sm text-text-tertiary">
            불러오는 중…
          </div>
        )}
        {!history.isLoading && items.length === 0 && (
          <div className="rounded-xl bg-bg-secondary py-12 text-center text-sm text-text-tertiary">
            아직 받은 {MEDAL_LABEL}이 없어요. 내전을 끝까지 하면 받아요.
          </div>
        )}
        {groupByDay(items).map((g) => {
          const dayNet = g.items.reduce((sum, it) => sum + it.amount, 0);
          return (
            <div key={g.label}>
              <div className="mb-1.5 flex items-baseline justify-between px-1">
                <span className="text-xs font-black text-text-tertiary">
                  {g.label}
                </span>
                <span className="text-xs font-bold tabular-nums text-text-tertiary">
                  {dayNet > 0 ? `+${dayNet}` : dayNet}
                </span>
              </div>
              <div className="space-y-1 rounded-xl bg-bg-secondary p-1.5">
                {g.items.map((it) => (
                  <div
                    key={it.id}
                    className="flex items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-bg-tertiary/50"
                  >
                    <span className="flex items-center gap-2 text-text-secondary">
                      <span className="w-11 text-[11px] tabular-nums text-text-tertiary">
                        {timeLabel(it.createdAt)}
                      </span>
                      {REASON_LABEL[it.reason] ?? it.reason}
                      {it.retro && (
                        <span className="rounded bg-bg-tertiary px-1 text-[10px] text-text-tertiary">
                          소급
                        </span>
                      )}
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="hidden text-[11px] tabular-nums text-text-tertiary sm:inline">
                        잔액 {it.balanceAfter.toLocaleString()}
                      </span>
                      <Amount value={it.amount} />
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {history.hasNextPage && (
          <button
            type="button"
            onClick={() => history.fetchNextPage()}
            disabled={history.isFetchingNextPage}
            className="h-10 w-full rounded-lg bg-bg-tertiary/60 text-sm font-bold text-text-secondary hover:bg-bg-tertiary disabled:opacity-60"
          >
            {history.isFetchingNextPage ? "불러오는 중…" : "더 보기"}
          </button>
        )}
      </section>
    </div>
  );
}
