"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Medal } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { medalApi, type MedalHistoryItem } from "@/lib/api-client";
import { MEDAL_LABEL } from "./catalog";

/** 원장 사유 → 화면 이름 */
export const REASON_LABEL: Record<string, string> = {
  MATCH_COMPLETE: "완주",
  MATCH_WIN: "승리",
  RIOT_VERIFIED: "Riot 확인",
  MATCH_MVP: "MVP",
  MATCH_ACE: "ACE",
  COMMEND_RECEIVED: "칭찬 받음",
  COMMEND_SESSION: "칭찬 창",
  HOST_COMPLETE: "방장 보너스",
  FIRST_MATCH: "첫 내전",
  MATCH_VOID: "결과 정정 회수",
  PURCHASE: "구매",
  REFUND: "환불",
  ADMIN_ADJUST: "운영자 지급",
};

/** 메달 쿼리 키 — 경기·칭찬이 끝난 곳에서 이 키를 무효화하면 칩이 새로 읽는다 */
export const MEDAL_QUERY_KEY = ["medals", "me"] as const;

/** 마지막으로 본 잔액 — 접속하지 않은 사이 받은 메달(소급 지급 등)도 알려 주려고 남긴다 */
const seenKey = (userId: string) => `nexus_medal_seen:${userId}`;

interface SeenState {
  balance: number;
  at: string;
}

function readSeen(userId: string): SeenState | null {
  try {
    const raw = localStorage.getItem(seenKey(userId));
    return raw ? (JSON.parse(raw) as SeenState) : null;
  } catch {
    return null;
  }
}

function writeSeen(userId: string, state: SeenState) {
  try {
    localStorage.setItem(seenKey(userId), JSON.stringify(state));
  } catch {
    /* 저장이 막힌 브라우저 — 다음에 또 알려 줄 뿐이다 */
  }
}

/** 받은 메달을 사유별로 묶는다 — 「완주 10 · 승리 10 · 방장 보너스 10」 */
function groupGains(items: MedalHistoryItem[]) {
  const sums = new Map<string, number>();
  for (const it of items) {
    if (it.amount <= 0) continue;
    const label = REASON_LABEL[it.reason] ?? it.reason;
    sums.set(label, (sums.get(label) ?? 0) + it.amount);
  }
  return [...sums.entries()];
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  return `${d}일 전`;
}

/**
 * 헤더 메달 칩 — 가진 메달을 늘 보여준다.
 *
 * - 누르면 잔액과 최근 내역이 열린다.
 * - 새로 받은 메달이 있으면 칩 위로 「+N」이 떠오르고, 아래에 사유별 내역이
 *   몇 초 동안 펼쳐진다(경기·칭찬 창이 끝난 뒤, 또는 접속하지 않은 사이 받은 것).
 */
export function MedalChip() {
  const { isAuthenticated, user } = useAuthStore();
  const userId = user?.id;

  const { data } = useQuery({
    queryKey: MEDAL_QUERY_KEY,
    queryFn: medalApi.getMine,
    enabled: isAuthenticated && Boolean(userId),
    // 경기가 끝나면 칭찬 창이 이 키를 무효화한다. 놓친 경우를 위해 1분마다도 본다
    refetchInterval: 60 * 1000,
    refetchOnWindowFocus: true,
    staleTime: 30 * 1000,
  });
  const balance = data?.balance;

  const [open, setOpen] = useState(false);
  const [gain, setGain] = useState<{
    total: number;
    groups: [string, number][];
  } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // 잔액이 마지막으로 본 값보다 늘었으면 그 사이 내역을 모아 알려 준다
  useEffect(() => {
    if (balance === undefined || !userId) return;
    const seen = readSeen(userId);
    const now = new Date().toISOString();
    if (!seen) {
      // 처음 보는 기기 — 지금 잔액을 기준으로 삼고 조용히 넘어간다
      writeSeen(userId, { balance, at: now });
      return;
    }
    if (balance <= seen.balance) {
      if (balance !== seen.balance) writeSeen(userId, { balance, at: now });
      return;
    }
    let cancelled = false;
    medalApi
      .getHistory({ limit: 50 })
      .then(({ items }) => {
        if (cancelled) return;
        const fresh = items.filter(
          (it) => new Date(it.createdAt) > new Date(seen.at),
        );
        setGain({ total: balance - seen.balance, groups: groupGains(fresh) });
        writeSeen(userId, { balance, at: now });
      })
      .catch(() => {
        if (!cancelled) setGain({ total: balance - seen.balance, groups: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [balance, userId]);

  // 받은 메달 알림은 6초 뒤 접는다
  useEffect(() => {
    if (!gain) return;
    const t = setTimeout(() => setGain(null), 6000);
    return () => clearTimeout(t);
  }, [gain]);

  // 바깥을 누르면 내역을 닫는다
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const history = useQuery({
    queryKey: ["medals", "history", "recent"],
    queryFn: () => medalApi.getHistory({ limit: 8 }),
    enabled: open,
    staleTime: 10 * 1000,
  });

  if (!isAuthenticated || balance === undefined) return null;

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          setGain(null);
        }}
        title={`가진 ${MEDAL_LABEL}`}
        aria-label={`가진 ${MEDAL_LABEL} ${balance.toLocaleString()}개`}
        className={cn(
          "relative inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-black tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary",
          open || gain
            ? "bg-amber-400/15 text-amber-200"
            : "bg-bg-tertiary/60 text-text-primary hover:bg-bg-tertiary",
        )}
      >
        <Medal className="h-4 w-4 text-amber-300" />
        {balance.toLocaleString()}
        {/* 받은 순간 칩 위로 떠오르는 숫자 */}
        <AnimatePresence>
          {gain && (
            <motion.span
              key={gain.total}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: [0, 1, 1, 0], y: -26 }}
              transition={{ duration: 1.8, ease: "easeOut" }}
              className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 whitespace-nowrap text-sm font-black text-amber-300"
            >
              +{gain.total.toLocaleString()}
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      <AnimatePresence>
        {/* 받은 메달 내역 — 몇 초 뒤 저절로 접힌다 */}
        {gain && !open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl bg-bg-secondary p-4 shadow-xl ring-1 ring-white/5"
          >
            <div className="flex items-center gap-2 text-lg font-black text-amber-300">
              <Medal className="h-5 w-5" />+{gain.total.toLocaleString()}{" "}
              {MEDAL_LABEL}
            </div>
            {gain.groups.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {gain.groups.map(([label, amount]) => (
                  <span
                    key={label}
                    className="rounded-md bg-bg-tertiary px-2 py-0.5 text-xs font-bold text-text-secondary"
                  >
                    {label} <span className="text-amber-200">+{amount}</span>
                  </span>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* 눌렀을 때 — 잔액과 최근 내역 */}
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="absolute right-0 top-full z-50 mt-2 w-72 rounded-xl bg-bg-secondary p-4 shadow-xl ring-1 ring-white/5"
          >
            <div className="text-xs font-bold text-text-tertiary">
              가진 {MEDAL_LABEL}
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-2xl font-black tabular-nums text-text-primary">
              <Medal className="h-6 w-6 text-amber-300" />
              {balance.toLocaleString()}
            </div>
            <p className="mt-1 text-xs text-text-tertiary">
              내전을 끝까지 하면 받아요.
            </p>
            <Link
              href="/shop"
              onClick={() => setOpen(false)}
              className="mt-3 flex h-9 items-center justify-center rounded-lg bg-accent-primary text-sm font-black text-accent-on transition hover:brightness-110"
            >
              {MEDAL_LABEL} 상점 가기
            </Link>

            <div className="mt-3 space-y-1">
              {history.isLoading && (
                <div className="py-3 text-center text-xs text-text-tertiary">
                  불러오는 중…
                </div>
              )}
              {history.data?.items.length === 0 && (
                <div className="py-3 text-center text-xs text-text-tertiary">
                  아직 받은 {MEDAL_LABEL}이 없어요
                </div>
              )}
              {history.data?.items.map((it) => (
                <div
                  key={it.id}
                  className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm hover:bg-bg-tertiary/50"
                >
                  <span className="text-text-secondary">
                    {REASON_LABEL[it.reason] ?? it.reason}
                    {it.retro && (
                      <span className="ml-1 text-[10px] text-text-tertiary">
                        소급
                      </span>
                    )}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-[11px] text-text-tertiary">
                      {relativeTime(it.createdAt)}
                    </span>
                    <span
                      className={cn(
                        "w-12 text-right font-black tabular-nums",
                        it.amount > 0
                          ? "text-amber-200"
                          : it.amount < 0
                            ? "text-accent-danger"
                            : "text-text-tertiary",
                      )}
                    >
                      {/* 0 줄 = 하루 상한(180)에 걸려 못 받은 지급 */}
                      {it.amount > 0
                        ? `+${it.amount}`
                        : it.amount === 0
                          ? "상한"
                          : it.amount}
                    </span>
                  </span>
                </div>
              ))}
            </div>
            <Link
              href="/shop/medals"
              onClick={() => setOpen(false)}
              className="mt-2 block rounded-lg py-1.5 text-center text-xs font-bold text-text-tertiary transition-colors hover:bg-bg-tertiary/50 hover:text-text-secondary"
            >
              전체 내역 보기
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
