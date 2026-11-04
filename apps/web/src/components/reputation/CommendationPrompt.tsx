"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, ThumbsUp } from "lucide-react";
import { getChampionKoreanName } from "@nexus/types";
import { Modal } from "@/components/ui/Modal";
import { Avatar, Button } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { useAuthStore } from "@/stores/auth-store";
import { reputationApi, type PendingCommendation } from "@/lib/api-client";
import {
  COMMENDATION_TAGS,
  MAX_COMMENDATIONS_PER_MATCH,
} from "@/lib/commendation";
import { getChampionIcon } from "@/components/matches/match-utils";
import { POSITION_LABELS } from "@/app/[game]/tournaments/[id]/lobby/_components/icons";

/**
 * 진행 중인 화면에서는 띄우지 않는다 — 경매·드래프트·역할 선택·로비에서 모달이 뜨면
 * 시간 제한이 있는 조작을 가린다. 대진표·전적 등 경기 사이 화면에서 뜬다.
 */
const BLOCKED_PATH = /\/(auction|draft|role-selection|lobby|broadcast)(\/|$)/;

/** 같은 경기를 "나중에"로 닫았을 때 다시 묻기까지 */
const SNOOZE_MS = 10 * 60 * 1000;

/**
 * 경기 뒤 칭찬 창.
 *
 * 내전이 끝나면 어느 화면에 있든(진행 화면 제외) 함께 뛴 사람을 칭찬하라고 묻는다.
 * 우리 팀 → 상대 팀 두 단계로 넘어가며, 두 단계를 합쳐 최대 3명까지 고른다.
 * 고른 사람에게는 태그를 붙일 수 있다(선택). 나쁜 평가는 받지 않는다 — 신고가 따로 있다.
 *
 * 경기마다 한 번만 묻는다. "건너뛰기"·"칭찬 보내기" 모두 서버에 기록되고,
 * 창을 그냥 닫으면(X) 10분 뒤 다시 묻는다.
 */
export function CommendationPrompt() {
  const pathname = usePathname();
  const { isAuthenticated } = useAuthStore();
  const blocked = BLOCKED_PATH.test(pathname);

  const { data: pending } = useQuery({
    queryKey: ["pendingCommendation"],
    queryFn: reputationApi.getPendingCommendation,
    enabled: isAuthenticated,
    // 경기 결과가 들어오면 다음 확인 때 뜬다. 진행 화면에서 돌아올 때도 다시 본다.
    refetchInterval: 60 * 1000,
    refetchOnWindowFocus: true,
    staleTime: 30 * 1000,
  });

  // "나중에"(X)로 닫은 경기 — 10분 뒤나 새로고침하면 다시 묻는다(서버에는 안 남긴다)
  const [snoozedMatchId, setSnoozedMatchId] = useState<string | null>(null);
  useEffect(() => {
    if (!snoozedMatchId) return;
    const timer = setTimeout(() => setSnoozedMatchId(null), SNOOZE_MS);
    return () => clearTimeout(timer);
  }, [snoozedMatchId]);

  if (!pending || blocked || snoozedMatchId === pending.matchId) return null;

  return (
    <CommendationModal
      // 경기가 바뀌면 고른 상태를 새로 시작한다
      key={pending.matchId}
      pending={pending}
      onSnooze={() => setSnoozedMatchId(pending.matchId)}
    />
  );
}

function CommendationModal({
  pending,
  onSnooze,
}: {
  pending: PendingCommendation;
  onSnooze: () => void;
}) {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const teammates = pending.players.filter((p) => p.isTeammate);
  const opponents = pending.players.filter((p) => !p.isTeammate);
  // 한쪽이 비어 있으면(1:N 같은 특이한 판) 그 단계를 건너뛴다
  const steps = [
    { key: "team", title: "우리 팀", players: teammates },
    { key: "enemy", title: "상대 팀", players: opponents },
  ].filter((step) => step.players.length > 0);

  const [stepIndex, setStepIndex] = useState(0);
  // 고른 사람 → 붙인 태그
  const [selected, setSelected] = useState<Map<string, Set<string>>>(
    () => new Map(),
  );
  const [error, setError] = useState<string | null>(null);

  const submit = useMutation({
    mutationFn: (skip: boolean) =>
      reputationApi.submitCommendations({
        matchId: pending.matchId,
        commendations: skip
          ? []
          : [...selected.entries()].map(([targetUserId, tags]) => ({
              targetUserId,
              tags: [...tags],
            })),
      }),
    onSuccess: (_data, skip) => {
      if (!skip && selected.size > 0) {
        addToast(`${selected.size}명에게 칭찬을 보냈습니다`, "success");
      }
      queryClient.invalidateQueries({ queryKey: ["pendingCommendation"] });
    },
    onError: (err: any) => {
      // 이미 끝낸 경기면(다른 탭에서 제출 등) 조용히 닫는다
      if (err?.response?.status === 409) {
        queryClient.invalidateQueries({ queryKey: ["pendingCommendation"] });
        return;
      }
      setError(
        err?.response?.data?.message ||
          "칭찬을 보내지 못했습니다. 다시 시도해 주세요.",
      );
    },
  });

  const togglePlayer = (userId: string) => {
    setError(null);
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        if (next.size >= MAX_COMMENDATIONS_PER_MATCH) {
          setError(
            `한 판에 ${MAX_COMMENDATIONS_PER_MATCH}명까지 칭찬할 수 있습니다.`,
          );
          return prev;
        }
        next.set(userId, new Set());
      }
      return next;
    });
  };

  const toggleTag = (userId: string, tag: string) => {
    setSelected((prev) => {
      const next = new Map(prev);
      const tags = new Set(next.get(userId));
      if (tags.has(tag)) tags.delete(tag);
      else tags.add(tag);
      next.set(userId, tags);
      return next;
    });
  };

  const step = steps[stepIndex];
  const isLast = stepIndex === steps.length - 1;
  const subtitle = [
    pending.roomName,
    pending.gameNumber && pending.gameNumber > 1
      ? `${pending.gameNumber}세트`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Modal
      isOpen
      onClose={onSnooze}
      title="같이 뛴 사람 칭찬하기"
      size="md"
      disableBackdropClose
    >
      <div className="space-y-4">
        {/* 진행 상황 — 단계와 고른 인원 */}
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            {subtitle && (
              <p className="truncate text-sm text-text-secondary">{subtitle}</p>
            )}
            <div className="mt-1 flex items-center gap-2 text-xs">
              {steps.map((s, i) => (
                <span
                  key={s.key}
                  className={
                    i === stepIndex
                      ? "font-bold text-accent-primary"
                      : "text-text-tertiary"
                  }
                >
                  {i + 1}. {s.title}
                </span>
              ))}
            </div>
          </div>
          <span className="flex-shrink-0 rounded-full bg-bg-tertiary px-3 py-1 text-xs text-text-secondary">
            {selected.size} / {MAX_COMMENDATIONS_PER_MATCH}
          </span>
        </div>

        <p className="text-sm text-text-secondary">
          {step.key === "team"
            ? "이번 판 우리 팀에서 좋았던 사람을 골라 주세요."
            : "상대 팀에서도 매너 좋았던 사람이 있었나요?"}
        </p>

        {/* 선수 목록 — 누르면 고르고, 고른 사람 아래에 태그가 열린다 */}
        <div className="space-y-2">
          {step.players.map((player) => {
            const tags = selected.get(player.userId);
            const on = !!tags;
            return (
              <div key={player.userId}>
                <button
                  type="button"
                  onClick={() => togglePlayer(player.userId)}
                  aria-pressed={on}
                  className={`flex w-full items-center gap-3 rounded-lg border p-2.5 text-left transition-colors ${
                    on
                      ? "border-accent-primary bg-accent-primary/10"
                      : "border-bg-tertiary bg-bg-secondary hover:bg-bg-tertiary/60"
                  }`}
                >
                  <Avatar
                    src={player.avatar}
                    alt={player.username}
                    fallback={player.username.charAt(0)}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-text-primary">
                      {player.username}
                    </p>
                    <p className="flex items-center gap-1.5 text-xs text-text-tertiary">
                      {player.role && (
                        <span>
                          {POSITION_LABELS[player.role] ?? player.role}
                        </span>
                      )}
                      {player.championName && (
                        <>
                          <Image
                            src={getChampionIcon(player.championName)}
                            alt=""
                            width={14}
                            height={14}
                            className="h-3.5 w-3.5 rounded-sm"
                          />
                          {getChampionKoreanName(player.championName)}
                        </>
                      )}
                    </p>
                  </div>
                  {on ? (
                    <ThumbsUp className="h-5 w-5 flex-shrink-0 text-accent-primary" />
                  ) : (
                    <Plus className="h-5 w-5 flex-shrink-0 text-text-tertiary" />
                  )}
                </button>
                {on && (
                  <div className="flex flex-wrap gap-1.5 pb-1 pl-12 pt-2">
                    {COMMENDATION_TAGS.map((tag) => {
                      const active = tags.has(tag.key);
                      return (
                        <button
                          key={tag.key}
                          type="button"
                          onClick={() => toggleTag(player.userId, tag.key)}
                          aria-pressed={active}
                          className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                            active
                              ? "border-accent-primary bg-accent-primary/15 text-accent-primary"
                              : "border-bg-elevated text-text-secondary hover:text-text-primary"
                          }`}
                        >
                          {tag.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {error && <p className="text-sm text-accent-danger">{error}</p>}

        <div className="flex items-center justify-between gap-2 border-t border-bg-tertiary pt-4">
          <span className="text-xs text-text-tertiary">
            불편한 일이 있었다면 프로필에서 신고해 주세요
          </span>
          <div className="flex flex-shrink-0 gap-2">
            {stepIndex > 0 ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setStepIndex((i) => i - 1)}
              >
                이전
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                disabled={submit.isPending}
                onClick={() => submit.mutate(true)}
              >
                건너뛰기
              </Button>
            )}
            {isLast ? (
              <Button
                size="sm"
                disabled={submit.isPending}
                onClick={() => submit.mutate(selected.size === 0)}
              >
                {selected.size === 0 ? "칭찬 없이 끝내기" : "칭찬 보내기"}
              </Button>
            ) : (
              <Button size="sm" onClick={() => setStepIndex((i) => i + 1)}>
                다음
              </Button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
