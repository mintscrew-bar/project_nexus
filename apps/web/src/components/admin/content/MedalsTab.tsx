"use client";

/**
 * 관리자 「메달·원장」 탭 (리텐션 기획서 13절, Task 17). ADMIN 전용.
 *
 * - 사용자 검색 → 그 사람의 잔액·합계·사유별, 가진 상품(환불), 지급·회수
 * - 원장 — 전체 또는 고른 사람, 사유 필터, 최신순 "더 보기"
 *
 * 원장은 지우거나 고치지 않는다. 지급·회수·환불은 모두 새 원장 줄 + 감사 기록으로 남는다.
 * 잔액보다 큰 회수는 서버가 기본으로 막고, "마이너스 잔액 허용" 을 체크하고 확인 글자를
 * 입력해야만 보낸다(부정 획득 회수용).
 */
import { useEffect, useRef, useState } from "react";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import Image from "next/image";
import { Medal, RotateCcw, Search } from "lucide-react";
import { Card, CardContent, LoadingSpinner } from "@/components/ui";
import {
  adminApi,
  adminMedalApi,
  type AdminMedalLedgerItem,
  type AdminMedalUser,
} from "@/lib/api-client";
import { cn, getApiErrorMessage } from "@/lib/utils";
import { REASON_LABEL } from "@/components/cosmetics/MedalChip";
import { SLOT_LABEL, findCosmetic } from "@/components/cosmetics/catalog";
import { useConfirm } from "../ConfirmDialog";
import { MedalCampaignPanel } from "./MedalCampaignPanel";
import { refreshMedalViews } from "@/components/cosmetics/medal-sync";
import type { AddToast } from "../shared";

const AVATAR_FALLBACK = "/images/placeholders/non-avatar-256.png";

/** 원장 사유 필터 — 서버 MedalReason 순서 */
const REASONS = Object.keys(REASON_LABEL);

interface PickedUser {
  id: string;
  username: string;
  avatar: string | null;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

function Amount({ v }: { v: number }) {
  return (
    <span
      className={cn(
        "font-bold tabular-nums",
        v > 0
          ? "text-amber-300"
          : v < 0
            ? "text-accent-danger"
            : "text-text-tertiary",
      )}
    >
      {v > 0 ? `+${v.toLocaleString()}` : v === 0 ? "상한" : v.toLocaleString()}
    </span>
  );
}

/** 원장 줄의 메모·출처 — 관리자 조정은 사유, 구매·환불은 상품 이름 */
function ledgerNote(row: AdminMedalLedgerItem) {
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  const memo = typeof meta.memo === "string" ? meta.memo : "";
  const itemCode = typeof meta.itemCode === "string" ? meta.itemCode : "";
  const item = itemCode ? (findCosmetic(itemCode)?.name ?? itemCode) : "";
  return [item, memo].filter(Boolean).join(" · ");
}

export function MedalsTab({ addToast }: { addToast: AddToast }) {
  const { confirm, dialog } = useConfirm();

  /* ── 사용자 검색 ── */
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  // 입력이 0.3초 멈춘 뒤의 검색어 — 타이머 안에서만 바꾸므로 효과 안에서 바로 상태를 바꾸지 않는다
  const [debounced, setDebounced] = useState("");
  const [picked, setPicked] = useState<PickedUser | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);
  const search = useQuery({
    queryKey: ["admin-medal", "search", debounced],
    queryFn: async () => {
      const data = await adminApi.getUsers({
        search: debounced,
        limit: 8,
        kind: "all",
      });
      return (data.users ?? []).map((u: PickedUser) => ({
        id: u.id,
        username: u.username,
        avatar: u.avatar,
      })) as PickedUser[];
    },
    enabled: debounced.length > 0,
    staleTime: 30 * 1000,
  });
  // 입력을 지우면(또는 사람을 고르면) 결과를 숨긴다 — 상태로 지우지 않고 그릴 때 거른다
  const results: PickedUser[] = query.trim() && search.data ? search.data : [];
  const searching = search.isFetching;

  /* ── 고른 사람의 상세 ── */
  const detailQuery = useQuery({
    queryKey: ["admin-medal", "user", picked?.id],
    queryFn: () => adminMedalApi.user(picked!.id),
    enabled: Boolean(picked),
  });
  const detail: AdminMedalUser | null = picked
    ? (detailQuery.data ?? null)
    : null;

  /* ── 원장 ── */
  const [reason, setReason] = useState("");
  const ledger = useInfiniteQuery({
    queryKey: ["admin-medal", "ledger", picked?.id ?? "all", reason],
    queryFn: ({ pageParam }) =>
      adminMedalApi.ledger({
        userId: picked?.id,
        reason: reason || undefined,
        cursor: pageParam,
        limit: 50,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const rows: AdminMedalLedgerItem[] =
    ledger.data?.pages.flatMap((pg) => pg.items) ?? [];
  const loading = ledger.isLoading;
  const loadingMore = ledger.isFetchingNextPage;
  const loadError = ledger.error ?? detailQuery.error;

  // 지급·회수·환불 뒤 — 이 탭의 조회(사람 상세·원장)를 전부 새로 읽는다
  const refreshAll = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin-medal"] });
    // 나 자신에게 줬을 때 헤더 메달 칩·상점 잔액도 바로(남에게 준 건 소켓 알림으로 그 사람 화면이 바뀐다)
    refreshMedalViews(queryClient);
  };

  /* ── 지급·회수 ── */
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [allowNegative, setAllowNegative] = useState(false);
  // 같은 조정을 두 번 보내도 한 번만 들어가게 — 누를 때 만들고, 성공하거나 입력이 바뀌면 버린다.
  // 실패 뒤 다시 누르면 같은 값이라 서버가 중복을 걸러 준다
  const requestId = useRef<string | null>(null);
  const [adjusting, setAdjusting] = useState(false);
  const amountNum = Number.parseInt(amount, 10);
  const balance = detail?.summary.balance ?? 0;
  const goesNegative = Number.isFinite(amountNum) && balance + amountNum < 0;

  const submitAdjust = async () => {
    if (!picked || !Number.isFinite(amountNum) || amountNum === 0) return;
    if (!memo.trim()) {
      addToast("사유를 적어 주세요.", "error");
      return;
    }
    if (goesNegative && !allowNegative) {
      addToast(
        "잔액보다 큰 회수예요. 마이너스 잔액을 허용하려면 체크해 주세요.",
        "error",
      );
      return;
    }
    const ok = await confirm({
      title: amountNum > 0 ? "메달 지급" : "메달 회수",
      message: (
        <div className="space-y-1 text-sm">
          <p>
            <b>{picked.username}</b> 님에게 <Amount v={amountNum} /> 메달
          </p>
          <p className="text-text-tertiary">
            잔액 {balance.toLocaleString()} →{" "}
            {(balance + amountNum).toLocaleString()}
          </p>
          <p className="text-text-tertiary">사유: {memo}</p>
        </div>
      ),
      confirmLabel: amountNum > 0 ? "지급" : "회수",
      danger: amountNum < 0,
      // 마이너스 잔액은 되돌리기 어려운 조치라 글자를 입력하게 한다
      requireText: goesNegative ? "마이너스" : undefined,
    });
    if (!ok) return;
    setAdjusting(true);
    try {
      await adminMedalApi.adjust({
        userId: picked.id,
        amount: amountNum,
        memo: memo.trim(),
        requestId: (requestId.current ??= crypto.randomUUID()),
        allowNegative: goesNegative ? true : undefined,
      });
      addToast(amountNum > 0 ? "지급했어요." : "회수했어요.", "success");
      requestId.current = null;
      setAmount("");
      setMemo("");
      setAllowNegative(false);
      refreshAll();
    } catch (err) {
      addToast(getApiErrorMessage(err, "조정하지 못했어요."), "error");
    } finally {
      setAdjusting(false);
    }
  };

  /* ── 환불 ── */
  const [refundMemo, setRefundMemo] = useState<Record<string, string>>({});
  const [refunding, setRefunding] = useState<string | null>(null);
  const refund = async (itemCode: string, paid: number) => {
    if (!picked) return;
    const why = (refundMemo[itemCode] ?? "").trim();
    if (!why) {
      addToast("환불 사유를 적어 주세요.", "error");
      return;
    }
    const name = findCosmetic(itemCode)?.name ?? itemCode;
    const ok = await confirm({
      title: "구매 환불",
      message: (
        <div className="space-y-1 text-sm">
          <p>
            <b>{picked.username}</b> 님의 「{name}」을 환불할까요?
          </p>
          <p className="text-text-tertiary">
            {paid.toLocaleString()} 메달을 돌려주고 상품과 장착을 지웁니다. 다시
            사려면 새로 사야 해요.
          </p>
          <p className="text-text-tertiary">사유: {why}</p>
        </div>
      ),
      confirmLabel: "환불",
      danger: true,
    });
    if (!ok) return;
    setRefunding(itemCode);
    try {
      const res = await adminMedalApi.refund({
        userId: picked.id,
        itemCode,
        memo: why,
      });
      addToast(
        `${res.refunded.toLocaleString()} 메달을 돌려줬어요.`,
        "success",
      );
      setRefundMemo((m) => ({ ...m, [itemCode]: "" }));
      refreshAll();
    } catch (err) {
      addToast(getApiErrorMessage(err, "환불하지 못했어요."), "error");
    } finally {
      setRefunding(null);
    }
  };

  return (
    <div className="space-y-4">
      {dialog}
      <div>
        <h2 className="flex items-center gap-2 text-lg font-bold text-text-primary">
          <Medal className="h-5 w-5 text-amber-300" />
          메달·원장
        </h2>
        <p className="mt-1 text-sm text-text-secondary">
          원장은 지우거나 고치지 않아요. 지급·회수·환불은 새 줄과 관리 기록으로
          남습니다.
        </p>
      </div>

      {/* 가입자 전체 일괄 보상 */}
      <MedalCampaignPanel addToast={addToast} confirm={confirm} />

      {/* 사용자 고르기 */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="닉네임으로 사람 찾기"
                className="h-10 w-full rounded-lg bg-bg-tertiary pl-9 pr-3 text-sm text-text-primary outline-none focus:ring-2 focus:ring-accent-primary"
              />
            </div>
            {picked && (
              <button
                type="button"
                onClick={() => setPicked(null)}
                className="h-10 rounded-lg bg-bg-tertiary px-3 text-xs font-bold text-text-secondary hover:text-text-primary"
              >
                전체 원장 보기
              </button>
            )}
          </div>
          {searching && <p className="text-xs text-text-tertiary">찾는 중…</p>}
          {results.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {results.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => {
                    setPicked(u);
                    setQuery("");
                    setDebounced("");
                  }}
                  className="flex items-center gap-2 rounded-lg bg-bg-tertiary px-2.5 py-1.5 text-sm text-text-primary hover:bg-bg-elevated"
                >
                  <span className="relative h-6 w-6 overflow-hidden rounded-full bg-bg-elevated">
                    <Image
                      src={u.avatar || AVATAR_FALLBACK}
                      alt=""
                      fill
                      unoptimized
                      className="object-cover"
                    />
                  </span>
                  {u.username}
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 고른 사람 */}
      {picked && detail && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardContent className="space-y-4 p-4">
              <div className="flex items-center gap-3">
                <span className="relative h-10 w-10 overflow-hidden rounded-full bg-bg-elevated">
                  <Image
                    src={detail.user.avatar || AVATAR_FALLBACK}
                    alt=""
                    fill
                    unoptimized
                    className="object-cover"
                  />
                </span>
                <div>
                  <p className="font-bold text-text-primary">
                    {detail.user.username}
                  </p>
                  <p className="text-xs text-text-tertiary">
                    가입{" "}
                    {new Date(detail.user.createdAt).toLocaleDateString(
                      "ko-KR",
                    )}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2 text-center">
                {[
                  ["잔액", detail.summary.balance.toLocaleString()],
                  ["받은 것", `+${detail.summary.earned.toLocaleString()}`],
                  ["쓴 것", detail.summary.spent.toLocaleString()],
                  [
                    "오늘",
                    `${detail.summary.today.earned}/${detail.summary.today.cap}`,
                  ],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-lg bg-bg-tertiary/60 py-2"
                  >
                    <p className="text-[11px] text-text-tertiary">{label}</p>
                    <p className="font-bold tabular-nums text-text-primary">
                      {value}
                    </p>
                  </div>
                ))}
              </div>
              {detail.summary.byReason.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {detail.summary.byReason.map((r) => (
                    <span
                      key={r.reason}
                      className="rounded-md bg-bg-tertiary/70 px-2 py-0.5 text-xs text-text-secondary"
                    >
                      {REASON_LABEL[r.reason] ?? r.reason}{" "}
                      <Amount v={r.amount} />
                    </span>
                  ))}
                </div>
              )}

              {/* 지급·회수 */}
              <div className="space-y-2 rounded-lg bg-bg-tertiary/40 p-3">
                <p className="text-sm font-bold text-text-primary">지급·회수</p>
                <div className="flex gap-2">
                  <input
                    value={amount}
                    onChange={(e) => {
                      requestId.current = null;
                      setAmount(e.target.value.replace(/[^\d-]/g, ""));
                    }}
                    inputMode="numeric"
                    placeholder="+100 / -50"
                    className="h-9 w-28 rounded-lg bg-bg-tertiary px-3 text-sm tabular-nums text-text-primary outline-none focus:ring-2 focus:ring-accent-primary"
                  />
                  <input
                    value={memo}
                    onChange={(e) => {
                      requestId.current = null;
                      setMemo(e.target.value);
                    }}
                    maxLength={300}
                    placeholder="사유 (필수, 관리 기록에 남음)"
                    className="h-9 flex-1 rounded-lg bg-bg-tertiary px-3 text-sm text-text-primary outline-none focus:ring-2 focus:ring-accent-primary"
                  />
                  <button
                    type="button"
                    onClick={submitAdjust}
                    disabled={
                      adjusting ||
                      !Number.isFinite(amountNum) ||
                      amountNum === 0
                    }
                    className="h-9 rounded-lg bg-accent-primary px-4 text-sm font-bold text-accent-on disabled:opacity-50"
                  >
                    {Number.isFinite(amountNum) && amountNum < 0
                      ? "회수"
                      : "지급"}
                  </button>
                </div>
                {goesNegative && (
                  <label className="flex items-center gap-2 text-xs text-accent-danger">
                    <input
                      type="checkbox"
                      checked={allowNegative}
                      onChange={(e) => setAllowNegative(e.target.checked)}
                    />
                    잔액({balance.toLocaleString()})보다 큰 회수 — 마이너스 잔액
                    허용 (부정 획득 회수일 때만)
                  </label>
                )}
              </div>
            </CardContent>
          </Card>

          {/* 가진 상품 */}
          <Card>
            <CardContent className="space-y-2 p-4">
              <p className="text-sm font-bold text-text-primary">
                가진 상품 {detail.cosmetics.items.length}개
              </p>
              {detail.cosmetics.items.length === 0 && (
                <p className="py-6 text-center text-sm text-text-tertiary">
                  산 상품이 없어요.
                </p>
              )}
              {detail.cosmetics.items.map((it) => {
                const def = findCosmetic(it.itemCode);
                return (
                  <div
                    key={it.itemCode}
                    className="space-y-2 rounded-lg bg-bg-tertiary/40 px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <div className="min-w-0">
                        <span className="font-bold text-text-primary">
                          {def?.name ?? it.itemCode}
                        </span>
                        <span className="ml-1.5 text-xs text-text-tertiary">
                          {it.slot ? SLOT_LABEL[it.slot] : "알 수 없는 자리"} ·{" "}
                          {it.source === "PURCHASE" ? "구매" : "운영자 지급"} ·{" "}
                          {fmtTime(it.acquiredAt)}
                        </span>
                        {it.equipped && (
                          <span className="ml-1.5 rounded bg-accent-success/20 px-1.5 text-[10px] font-bold text-accent-success">
                            장착 중
                          </span>
                        )}
                      </div>
                      <span className="shrink-0 text-xs tabular-nums text-text-secondary">
                        {it.paid !== null
                          ? `${it.paid.toLocaleString()} 메달`
                          : "—"}
                      </span>
                    </div>
                    {it.refundable && it.paid !== null && (
                      <div className="flex gap-2">
                        <input
                          value={refundMemo[it.itemCode] ?? ""}
                          onChange={(e) =>
                            setRefundMemo((m) => ({
                              ...m,
                              [it.itemCode]: e.target.value,
                            }))
                          }
                          maxLength={300}
                          placeholder="환불 사유"
                          className="h-8 flex-1 rounded-lg bg-bg-tertiary px-2.5 text-xs text-text-primary outline-none focus:ring-2 focus:ring-accent-primary"
                        />
                        <button
                          type="button"
                          onClick={() => refund(it.itemCode, it.paid!)}
                          disabled={refunding === it.itemCode}
                          className="flex h-8 items-center gap-1 rounded-lg bg-bg-elevated px-3 text-xs font-bold text-text-secondary hover:text-accent-danger disabled:opacity-50"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          환불
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      )}

      {/* 불러오기 실패 — 예전엔 토스트였는데 조회는 화면에 남겨 두는 편이 덜 놓친다 */}
      {loadError && (
        <p className="rounded-lg bg-accent-danger/10 px-4 py-2 text-sm text-accent-danger">
          {getApiErrorMessage(loadError, "메달 정보를 못 불러왔어요.")}
        </p>
      )}

      {/* 원장 */}
      <Card>
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-bg-tertiary px-4 py-3">
            <p className="text-sm font-bold text-text-primary">
              {picked ? `${picked.username} 님의 원장` : "전체 원장"}
            </p>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="h-8 rounded-lg bg-bg-tertiary px-2 text-xs text-text-primary"
            >
              <option value="">모든 사유</option>
              {REASONS.map((r) => (
                <option key={r} value={r}>
                  {REASON_LABEL[r]}
                </option>
              ))}
            </select>
          </div>
          {loading ? (
            <div className="flex justify-center py-10">
              <LoadingSpinner />
            </div>
          ) : rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-text-tertiary">
              원장이 비어 있어요.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-text-tertiary">
                    <th className="px-4 py-2 font-medium">시각</th>
                    {!picked && <th className="px-2 py-2 font-medium">사람</th>}
                    <th className="px-2 py-2 font-medium">사유</th>
                    <th className="px-2 py-2 text-right font-medium">금액</th>
                    <th className="px-2 py-2 text-right font-medium">잔액</th>
                    <th className="px-4 py-2 font-medium">메모·상품</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t border-bg-tertiary/60">
                      <td className="whitespace-nowrap px-4 py-2 tabular-nums text-text-tertiary">
                        {fmtTime(r.createdAt)}
                      </td>
                      {!picked && (
                        <td className="px-2 py-2">
                          {r.user ? (
                            <button
                              type="button"
                              onClick={() => setPicked(r.user!)}
                              className="text-text-primary hover:underline"
                            >
                              {r.user.username}
                            </button>
                          ) : (
                            <span className="text-text-tertiary">탈퇴</span>
                          )}
                        </td>
                      )}
                      <td className="whitespace-nowrap px-2 py-2 text-text-secondary">
                        {/* 관리자 조정은 부호로 지급·회수를 가른다 */}
                        {r.reason === "ADMIN_ADJUST" && r.amount < 0
                          ? "운영자 회수"
                          : (REASON_LABEL[r.reason] ?? r.reason)}
                        {r.retro && (
                          <span className="ml-1 text-[10px] text-text-tertiary">
                            소급
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <Amount v={r.amount} />
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-text-secondary">
                        {r.balanceAfter.toLocaleString()}
                      </td>
                      <td className="max-w-[320px] truncate px-4 py-2 text-xs text-text-tertiary">
                        {ledgerNote(r)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {ledger.hasNextPage && !loading && (
            <button
              type="button"
              onClick={() => void ledger.fetchNextPage()}
              disabled={loadingMore}
              className="w-full border-t border-bg-tertiary py-2.5 text-sm font-bold text-text-secondary hover:bg-bg-tertiary/40 disabled:opacity-60"
            >
              {loadingMore ? "불러오는 중…" : "더 보기"}
            </button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
