"use client";

/**
 * 프로필 롤 탭 오른쪽 칸 — "연동된 계정" + "라인별 선호 챔피언".
 *
 * 2026-11 게임 계정 관리 화면을 내 프로필로 합쳤다. 같은 카드가
 * - 남의 프로필: 보기 전용. 계정을 누르면 소환사 전적.
 * - 내 프로필: "+ 추가", 계정마다 ⋯ 메뉴(대표 지정·티어 동기화·라인/선호 챔피언 수정·소환사 전적·연동 해제),
 *   선호 챔피언 "수정"(대표 계정의 수정 창). 창은 예전 관리 화면의 것을 그대로 쓴다.
 *
 * 모양은 사이트 다른 화면과 같은 말투 — 작은 대문자 라벨 + 제목, 테두리 없는 옅은 바탕 칸.
 * 대표 계정·주 라인은 메인색 바탕, 부 라인은 그보다 옅게.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ExternalLink,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Star,
  Trash2,
} from "lucide-react";
import { ChampionImage } from "@/components/ChampionImage";
import { TierBadge } from "@/components/domain/TierBadge";
import { AddAccountModal } from "@/components/domain/AddAccountModal";
import { EditAccountModal } from "@/components/domain/EditAccountModal";
import { PositionIcon } from "@/app/[game]/tournaments/[id]/lobby/_components/icons";
import { ConfirmModal, Dropdown } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { useAuthStore } from "@/stores/auth-store";
import { useRiotStore, type RiotAccount } from "@/stores/riot-store";
import { cn } from "@/lib/utils";

const ROLE_KO: Record<string, string> = {
  TOP: "탑",
  JUNGLE: "정글",
  MID: "미드",
  ADC: "원딜",
  SUPPORT: "서포터",
};

/** 프로필 응답과 Riot 스토어가 같이 쓰는 최소 계정 모양 */
export interface SideAccount {
  id: string;
  gameName: string;
  tagLine: string;
  tier: string | null;
  rank: string | null;
  lp: number | null;
  mainRole: string | null;
  subRole: string | null;
  isPrimary: boolean;
  championPreferences?: Array<{
    role: string;
    championId: string;
    order: number;
  }>;
}

/** 대표 계정의 선호 챔피언을 라인별로 — 주 라인 → 부 라인 → 나머지, 라인당 최대 5개 */
function groupPreferred(account?: SideAccount | null) {
  if (!account?.championPreferences?.length) return [];
  const grouped: Record<string, string[]> = {};
  for (const pref of [...account.championPreferences].sort(
    (a, b) => a.order - b.order,
  )) {
    (grouped[pref.role] ??= []).push(pref.championId);
  }
  const order: string[] = [];
  if (account.mainRole) order.push(account.mainRole);
  if (account.subRole && account.subRole !== account.mainRole)
    order.push(account.subRole);
  for (const role of Object.keys(grouped))
    if (!order.includes(role)) order.push(role);
  return order
    .filter((role) => grouped[role]?.length)
    .map((role) => ({
      role,
      kind:
        role === account.mainRole
          ? "main"
          : role === account.subRole
            ? "sub"
            : "etc",
      champions: grouped[role].slice(0, 5),
    }));
}

function SideCard({
  label,
  title,
  action,
  children,
}: {
  label: string;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-bg-elevated/40 bg-bg-secondary p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-tertiary">
            {label}
          </p>
          <h2 className="mt-0.5 text-base font-bold tracking-[-0.02em] text-text-primary">
            {title}
          </h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function PillButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Plus;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent-primary/15 px-2.5 py-1 text-[11px] font-bold text-accent-primary transition-colors hover:bg-accent-primary/25"
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

export function LolAccountsSide({
  accounts: profileAccounts,
  own,
  showAccounts = true,
  showPreferred = true,
  gamePrefix,
  getChampionKey,
  getChampionName,
  onChanged,
}: {
  /** 프로필 응답의 계정 (남의 프로필·첫 화면용) */
  accounts: SideAccount[];
  /** 내 프로필이면 관리 버튼·창을 붙인다 */
  own: boolean;
  /** 공개 설정 — Riot 계정 공개 / 챔피언 통계 공개 (내 프로필은 항상 보인다) */
  showAccounts?: boolean;
  showPreferred?: boolean;
  gamePrefix: string;
  getChampionKey: (championId: string) => string;
  getChampionName: (championId: string) => string;
  /** 계정이 바뀌면 — 프로필을 다시 불러오게 한다 */
  onChanged: () => void;
}) {
  const router = useRouter();
  const { addToast } = useToast();
  const { fetchUser } = useAuthStore();
  const {
    accounts: storeAccounts,
    fetchAccounts,
    setPrimaryAccount,
    syncAccount,
    deleteAccount,
  } = useRiotStore();
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<RiotAccount | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // 내 프로필이면 관리용 최신 목록(Riot 스토어)을 받는다
  useEffect(() => {
    if (own) void fetchAccounts();
  }, [own, fetchAccounts]);

  const accounts: SideAccount[] =
    own && storeAccounts.length > 0
      ? (storeAccounts as unknown as SideAccount[])
      : profileAccounts;
  const sorted = [...accounts].sort(
    (a, b) => Number(b.isPrimary) - Number(a.isPrimary),
  );
  const primary = sorted[0] ?? null;
  const preferred = groupPreferred(primary);

  const refresh = useCallback(async () => {
    await Promise.all([fetchAccounts(), fetchUser()]);
    onChanged();
  }, [fetchAccounts, fetchUser, onChanged]);

  const run = async (
    id: string,
    job: () => Promise<unknown>,
    ok: string,
    fail: string,
  ) => {
    setBusyId(id);
    try {
      await job();
      await refresh();
      if (ok) addToast(ok, "success");
    } catch {
      addToast(fail, "error");
    } finally {
      setBusyId(null);
    }
  };

  /** 수정 창은 Riot 스토어의 계정 객체가 필요하다 */
  const openEdit = (id: string) => {
    const target = storeAccounts.find((a) => a.id === id);
    if (target) setEditing(target);
  };

  const showAccountCard = own || (showAccounts && accounts.length > 0);
  const showPreferredCard = own
    ? preferred.length > 0 || accounts.length > 0
    : showPreferred && preferred.length > 0;
  if (!showAccountCard && !showPreferredCard) return null;

  return (
    <>
      {showAccountCard && (
        <SideCard
          label={`Riot accounts · ${accounts.length}`}
          title="연동된 계정"
          action={
            own ? (
              <PillButton
                icon={Plus}
                label="추가"
                onClick={() => setShowAdd(true)}
              />
            ) : undefined
          }
        >
          {accounts.length === 0 ? (
            <p className="rounded-xl bg-bg-elevated/20 px-3 py-4 text-center text-xs text-text-tertiary">
              연동한 Riot 계정이 없습니다
            </p>
          ) : (
            <div className="space-y-1.5">
              {sorted.map((a) => {
                const summonerHref = `${gamePrefix}/matches/summoner/${encodeURIComponent(a.gameName)}/${encodeURIComponent(a.tagLine)}`;
                const body = (
                  <>
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-bold tracking-[-0.02em] text-text-primary">
                        {a.gameName}
                      </span>
                      <span className="shrink-0 text-xs text-text-tertiary">
                        #{a.tagLine}
                      </span>
                      {a.isPrimary && (
                        <span className="shrink-0 rounded-full bg-accent-primary/20 px-2 py-0.5 text-[10px] font-bold text-accent-primary">
                          대표
                        </span>
                      )}
                      <span className="ml-auto shrink-0">
                        {own ? (
                          <Dropdown
                            align="right"
                            trigger={
                              <button
                                type="button"
                                disabled={busyId === a.id}
                                className="flex h-7 w-7 items-center justify-center rounded-lg text-text-tertiary hover:bg-bg-tertiary hover:text-text-primary disabled:opacity-50"
                                aria-label={`${a.gameName} 계정 메뉴`}
                              >
                                {busyId === a.id ? (
                                  <RefreshCw className="h-4 w-4 animate-spin" />
                                ) : (
                                  <MoreHorizontal className="h-4 w-4" />
                                )}
                              </button>
                            }
                            items={[
                              ...(a.isPrimary
                                ? []
                                : [
                                    {
                                      key: "primary",
                                      label: "대표 계정으로 지정",
                                      icon: <Star className="h-4 w-4" />,
                                      onClick: () =>
                                        void run(
                                          a.id,
                                          () => setPrimaryAccount(a.id),
                                          "대표 계정이 변경되었습니다.",
                                          "대표 계정 설정에 실패했습니다.",
                                        ),
                                    },
                                  ]),
                              {
                                key: "sync",
                                label: "티어 동기화",
                                icon: <RefreshCw className="h-4 w-4" />,
                                onClick: () =>
                                  void run(
                                    a.id,
                                    () => syncAccount(a.id),
                                    "",
                                    "계정 동기화에 실패했습니다.",
                                  ),
                              },
                              {
                                key: "edit",
                                label: "라인·챔피언 수정",
                                icon: <Pencil className="h-4 w-4" />,
                                onClick: () => openEdit(a.id),
                              },
                              {
                                key: "open",
                                label: "소환사 전적 보기",
                                icon: <ExternalLink className="h-4 w-4" />,
                                onClick: () => router.push(summonerHref),
                              },
                              {
                                key: "delete",
                                label: "연동 해제",
                                icon: <Trash2 className="h-4 w-4" />,
                                danger: true,
                                onClick: () => setConfirmDeleteId(a.id),
                              },
                            ]}
                          />
                        ) : (
                          <ExternalLink className="h-3.5 w-3.5 text-text-tertiary" />
                        )}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 text-xs text-text-secondary">
                      <TierBadge
                        tier={a.tier ?? undefined}
                        rank={a.rank ?? undefined}
                        size="sm"
                      />
                      {a.tier && (
                        <span className="font-semibold tabular-nums">
                          {a.lp ?? 0} LP
                        </span>
                      )}
                      <span
                        className="ml-auto flex items-center gap-1 text-text-tertiary"
                        title={[a.mainRole, a.subRole]
                          .filter(Boolean)
                          .map((r) => ROLE_KO[r!] ?? r)
                          .join(" / ")}
                      >
                        {[a.mainRole, a.subRole].filter(Boolean).map((r) => (
                          <PositionIcon
                            key={r}
                            position={r!}
                            className="!h-3.5 !w-3.5"
                          />
                        ))}
                      </span>
                    </div>
                  </>
                );
                const tileClass = cn(
                  "block rounded-xl px-3 py-2 transition-colors",
                  a.isPrimary
                    ? "bg-accent-primary/[0.08]"
                    : "bg-bg-elevated/20",
                );
                // 남의 프로필은 칸 전체가 소환사 전적 링크, 내 프로필은 메뉴로 동작
                return own ? (
                  <div key={a.id} className={tileClass}>
                    {body}
                  </div>
                ) : (
                  <Link
                    key={a.id}
                    href={summonerHref}
                    className={cn(tileClass, "hover:bg-bg-elevated/40")}
                    title="소환사 전적 보기"
                  >
                    {body}
                  </Link>
                );
              })}
            </div>
          )}
        </SideCard>
      )}

      {showPreferredCard && (
        <SideCard
          label="Preferred champions"
          title="라인별 선호 챔피언"
          action={
            own && primary ? (
              <PillButton
                icon={Pencil}
                label="수정"
                onClick={() => openEdit(primary.id)}
              />
            ) : undefined
          }
        >
          {preferred.length === 0 ? (
            <p className="rounded-xl bg-bg-elevated/20 px-3 py-4 text-center text-xs text-text-tertiary">
              대표 계정에 선호 챔피언을 등록하면 여기에 보입니다
            </p>
          ) : (
            <div className="space-y-1.5">
              {preferred.map((g) => (
                <div
                  key={g.role}
                  className={cn(
                    "flex items-center gap-2.5 rounded-xl px-2.5 py-2",
                    g.kind === "main"
                      ? "bg-accent-primary/[0.1]"
                      : g.kind === "sub"
                        ? "bg-accent-primary/[0.045]"
                        : "bg-bg-elevated/20",
                  )}
                >
                  <div className="flex w-[68px] shrink-0 items-center gap-1.5">
                    <PositionIcon
                      position={g.role}
                      className={cn(
                        "!h-4 !w-4",
                        g.kind === "main"
                          ? "text-accent-primary"
                          : g.kind === "sub"
                            ? "text-accent-primary/70"
                            : "",
                      )}
                    />
                    <span
                      className={cn(
                        "text-xs font-bold",
                        g.kind === "main"
                          ? "text-accent-primary"
                          : g.kind === "sub"
                            ? "text-accent-primary/80"
                            : "text-text-secondary",
                      )}
                    >
                      {ROLE_KO[g.role] ?? g.role}
                    </span>
                    {g.kind !== "etc" && (
                      <span className="text-[10px] font-semibold text-text-tertiary">
                        {g.kind === "main" ? "주" : "부"}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-1">
                    {g.champions.map((id) => (
                      <span
                        key={id}
                        title={getChampionName(id)}
                        className="block overflow-hidden rounded-md"
                      >
                        <ChampionImage
                          championKey={getChampionKey(id)}
                          size={30}
                          className="block rounded-md"
                        />
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </SideCard>
      )}

      {own && (
        <>
          <AddAccountModal
            isOpen={showAdd}
            onClose={() => setShowAdd(false)}
            onAccountAdded={() => {
              setShowAdd(false);
              void refresh();
            }}
          />
          <EditAccountModal
            isOpen={!!editing}
            onClose={() => setEditing(null)}
            onAccountUpdated={() => void refresh()}
            account={editing}
          />
          <ConfirmModal
            isOpen={!!confirmDeleteId}
            onClose={() => setConfirmDeleteId(null)}
            onConfirm={async () => {
              const id = confirmDeleteId;
              setConfirmDeleteId(null);
              if (id)
                await run(
                  id,
                  () => deleteAccount(id),
                  "계정 연동을 해제했습니다.",
                  "계정 삭제에 실패했습니다.",
                );
            }}
            title="계정 연동 해제"
            message="이 Riot 계정의 연동을 해제할까요? 다시 쓰려면 새로 연동해야 합니다."
            confirmText="해제"
            cancelText="취소"
            variant="danger"
            isLoading={!!busyId}
          />
        </>
      )}
    </>
  );
}
