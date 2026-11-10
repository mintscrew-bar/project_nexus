"use client";

/**
 * 내 프로필 배그 탭의 계정 관리 — 닉네임으로 찾아 등록, 대표 지정, 공식 랭크 갱신,
 * 편성 점수 자동 산정, NEXUS 평가 입력, 연동 해제.
 *
 * 2026-11 게임 계정 관리 화면(설정 → 게임 계정 → 배그)을 내 프로필로 합치면서
 * 그 화면의 등록 카드·계정 목록·평가 창을 그대로 옮겨 왔다. 동작은 예전과 같다.
 */

import { useEffect, useState, useCallback } from "react";

import { pubgApi, type PubgPlayerLookupResult } from "@/lib/api-client";

import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Badge,
  Button,
  Skeleton,
  EmptyState,
  Modal,
} from "@/components/ui";
import { Plus, Shield, Gamepad2 } from "lucide-react";

export function PubgAccountsManager() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [playerName, setPlayerName] = useState("");
  // 등록은 두 단계다 — 닉네임으로 계정을 찾아 보여주고, 확인한 뒤에 등록한다.
  // PUBG API 는 소유권을 인증하지 않아서 "이 계정이 맞는지"를 사람이 봐야 한다.
  const [lookup, setLookup] = useState<PubgPlayerLookupResult | null>(null);
  const [looking, setLooking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scoreAccount, setScoreAccount] = useState<any | null>(null);
  const [scores, setScores] = useState({
    combatScore: 50,
    iglScore: 50,
    teamplayScore: 50,
    consistencyScore: 50,
    experienceScore: 50,
  });

  const previewScore = Math.round(
    scores.combatScore * 0.35 +
      scores.iglScore * 0.25 +
      scores.teamplayScore * 0.2 +
      scores.consistencyScore * 0.1 +
      scores.experienceScore * 0.1,
  );
  const previewTier =
    previewScore >= 85
      ? "1"
      : previewScore >= 70
        ? "2"
        : previewScore >= 55
          ? "3"
          : previewScore >= 40
            ? "4"
            : "5";

  const loadAccounts = useCallback(async () => {
    try {
      setLoading(true);
      setAccounts(await pubgApi.getAccounts());
    } catch {
      setError("PUBG 계정 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  // 내 프로필에서만 그려지므로 들어오면 바로 목록을 받는다
  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  const handleLookup = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!playerName.trim()) {
      setError("PUBG 닉네임을 입력해주세요.");
      return;
    }
    try {
      setLooking(true);
      setError(null);
      setLookup(await pubgApi.lookupPlayer(playerName.trim()));
    } catch (err: any) {
      setError(
        err?.response?.data?.message ||
          "PUBG 계정 조회에 실패했습니다. 잠시 후 다시 시도해주세요.",
      );
    } finally {
      setLooking(false);
    }
  };

  const handleRegister = async () => {
    if (!lookup?.found) return;
    try {
      setSaving(true);
      setError(null);
      const registeredAccount = await pubgApi.registerAccount({
        playerName: lookup.playerName,
      });
      setPlayerName("");
      setLookup(null);
      await loadAccounts();
      openScoreModal(registeredAccount);
    } catch (err: any) {
      setError(
        err?.response?.data?.message || "PUBG 계정 등록에 실패했습니다.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleSetPrimary = async (id: string) => {
    try {
      setAccounts(await pubgApi.setPrimary(id));
    } catch {
      setError("대표 계정 변경에 실패했습니다.");
    }
  };

  /** 공식 랭크 갱신. NEXUS 편성 등급과 다른 값이라 따로 눌러야 한다. */
  const handleSyncRank = async (id: string) => {
    setSaving(true);
    setError(null);
    try {
      await pubgApi.syncRank(id);
      await loadAccounts();
    } catch (err: any) {
      setError(
        err?.response?.data?.message || "공식 랭크를 가져오지 못했습니다.",
      );
    } finally {
      setSaving(false);
    }
  };

  /**
   * 편성 점수 자동 산정.
   *
   * 직접 넣은 점수는 서버가 덮지 않는다 — 손으로 매긴 값을 기계가 조용히
   * 지우면 왜 바뀌었는지 알 수 없다.
   */
  const handleRecompute = async (id: string) => {
    setSaving(true);
    setError(null);
    try {
      const updated = await pubgApi.recomputeBalance(id);
      if (!updated) {
        setError(
          "직접 입력한 점수가 있어 자동 산정을 건너뛰었습니다. 점수를 비우면 자동으로 매겨집니다.",
        );
      }
      await loadAccounts();
    } catch (err: any) {
      setError(
        err?.response?.data?.message || "편성 점수를 계산하지 못했습니다.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("이 PUBG 계정을 삭제할까요?")) return;
    try {
      await pubgApi.deleteAccount(id);
      await loadAccounts();
    } catch {
      setError("PUBG 계정 삭제에 실패했습니다.");
    }
  };

  const openScoreModal = (account: any) => {
    setScoreAccount(account);
    setScores({
      combatScore: account.combatScore ?? 50,
      iglScore: account.iglScore ?? 50,
      teamplayScore: account.teamplayScore ?? 50,
      consistencyScore: account.consistencyScore ?? 50,
      experienceScore: account.experienceScore ?? 50,
    });
  };

  const saveScore = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!scoreAccount) return;
    setSaving(true);
    setError(null);
    try {
      await pubgApi.updateScore(scoreAccount.id, scores);
      setScoreAccount(null);
      await loadAccounts();
    } catch (err: any) {
      setError(
        err?.response?.data?.message || "평가 점수 저장에 실패했습니다.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-accent-primary" />
            계정 등록
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={handleLookup}
            className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end"
          >
            <label className="text-sm text-text-secondary">
              닉네임
              <input
                value={playerName}
                onChange={(e) => {
                  setPlayerName(e.target.value);
                  // 닉네임을 고치면 이전 조회 결과는 더 이상 그 닉네임의 것이 아니다.
                  setLookup(null);
                }}
                placeholder="게임 내 닉네임 (대소문자 구분)"
                className="mt-2 w-full input"
                maxLength={50}
              />
            </label>
            <Button type="submit" disabled={looking || saving}>
              {looking ? "조회 중..." : "계정 찾기"}
            </Button>
          </form>

          {lookup && !lookup.found && (
            <p className="mt-4 text-sm text-accent-danger">{lookup.message}</p>
          )}

          {lookup?.found && (
            <div className="mt-4 rounded-xl border border-bg-tertiary bg-bg-primary/50 p-4">
              <div className="flex items-center gap-2 font-semibold text-text-primary">
                <Gamepad2 className="h-4 w-4 text-accent-primary" />
                {lookup.playerName}
              </div>
              <dl className="mt-3 grid gap-2 text-xs text-text-secondary sm:grid-cols-2">
                <div>
                  <dt className="text-text-tertiary">플레이 플랫폼</dt>
                  <dd className="mt-0.5 font-semibold text-text-primary">
                    {lookup.matchShard === "STEAM"
                      ? "스팀 배그 (스배)"
                      : lookup.matchShard === "KAKAO"
                        ? "카카오 배그 (카배)"
                        : "확인 안 됨"}
                  </dd>
                </div>
                <div>
                  <dt className="text-text-tertiary">최근 2주 매치</dt>
                  <dd className="mt-0.5 font-semibold text-text-primary">
                    {lookup.recentMatchCount}건
                  </dd>
                </div>
              </dl>
              {lookup.matchShard === null && (
                <p className="mt-3 text-xs text-text-tertiary">
                  최근 2주 매치가 없어 플레이 플랫폼을 정하지 못했습니다. 계정
                  등록에는 문제가 없고, 경기를 하면 자동으로 채워집니다.
                </p>
              )}
              {lookup.alreadyRegistered ? (
                <p className="mt-3 text-sm text-accent-danger">
                  이미 등록된 계정입니다.
                </p>
              ) : (
                <Button
                  type="button"
                  onClick={handleRegister}
                  disabled={saving}
                  className="mt-4"
                >
                  {saving ? "등록 중..." : "이 계정으로 등록"}
                </Button>
              )}
            </div>
          )}

          <p className="mt-3 text-xs text-text-tertiary">
            PUBG API에는 계정 소유권을 확인하는 절차가 없습니다. 등록은 먼저
            등록한 사람 기준이며, 사칭이 의심되면 문의해주세요.
          </p>
          {error && <p className="mt-3 text-sm text-accent-danger">{error}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          {/* 롤 프로필의 "연동된 Riot 계정" 과 이름·아이콘을 맞춘다. */}
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-accent-primary" />
            연동된 PUBG 계정
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-16 w-full" />
          ) : accounts.length === 0 ? (
            <EmptyState
              icon={Gamepad2}
              title="등록된 PUBG 계정이 없습니다"
              description="내전 참가에 사용할 계정을 닉네임으로 등록해주세요."
            />
          ) : (
            <div className="space-y-3">
              {accounts.map((account) => (
                <div
                  key={account.id}
                  className="flex items-center justify-between rounded-xl border border-bg-tertiary bg-bg-primary/50 p-4"
                >
                  <div>
                    <div className="flex items-center gap-2 font-semibold text-text-primary">
                      <Gamepad2 className="h-4 w-4 text-accent-primary" />
                      {account.playerName}
                    </div>
                    <p className="mt-1 text-xs text-text-secondary">
                      {account.lastMatchShard === "STEAM"
                        ? "스배"
                        : account.lastMatchShard === "KAKAO"
                          ? "카배"
                          : "플랫폼 미확인"}
                      {account.isPrimary ? " · 대표 계정" : ""}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-accent-primary">
                      {account.nexusScore == null
                        ? "평가 전"
                        : `NEXUS ${account.nexusScore}점 · ${account.nexusTier}티어`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {!account.isPrimary && (
                      <button
                        type="button"
                        onClick={() => handleSetPrimary(account.id)}
                        className="text-xs text-text-secondary hover:underline"
                      >
                        대표로
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleSyncRank(account.id)}
                      disabled={saving}
                      className="text-xs text-text-secondary hover:underline disabled:opacity-50"
                    >
                      공식 랭크 갱신
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRecompute(account.id)}
                      disabled={saving}
                      className="text-xs text-text-secondary hover:underline disabled:opacity-50"
                    >
                      자동 산정
                    </button>
                    <button
                      type="button"
                      onClick={() => openScoreModal(account)}
                      className="text-xs font-semibold text-accent-primary hover:underline"
                    >
                      직접 입력
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(account.id)}
                      className="text-xs text-accent-danger hover:underline"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Modal
        isOpen={!!scoreAccount}
        onClose={() => setScoreAccount(null)}
        title="PUBG NEXUS 평가"
        size="md"
      >
        <form onSubmit={saveScore} className="space-y-5">
          <div>
            <p className="font-bold text-text-primary">
              {scoreAccount?.playerName}
            </p>
            <p className="mt-1 text-xs text-text-tertiary">
              공식 PUBG 랭크가 아닌 내전 팀 구성용 참고 점수입니다.
            </p>
          </div>
          <div className="grid gap-4">
            {(
              [
                ["combatScore", "전투력", "샷발·킬·피해량"],
                ["iglScore", "오더", "판단·콜·운영"],
                ["teamplayScore", "팀 기여", "지원·합류·정보 공유"],
                ["consistencyScore", "안정성", "생존·기복"],
                ["experienceScore", "경험", "대회·내전 경험"],
              ] as const
            ).map(([key, label, description]) => (
              <label key={key} className="block">
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-semibold text-text-primary">
                    {label}
                    <span className="ml-2 text-xs font-normal text-text-tertiary">
                      {description}
                    </span>
                  </span>
                  <span className="font-black text-accent-primary">
                    {scores[key]}
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={scores[key]}
                  onChange={(e) =>
                    setScores((current) => ({
                      ...current,
                      [key]: Number(e.target.value),
                    }))
                  }
                  className="w-full accent-accent-primary"
                />
              </label>
            ))}
          </div>
          <div className="rounded-xl border border-accent-primary/30 bg-accent-primary/10 p-4">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-xs font-bold text-text-tertiary">
                  예상 NEXUS 점수
                </p>
                <p className="mt-1 text-3xl font-black text-text-primary">
                  {previewScore}
                  <span className="ml-1 text-sm">점</span>
                </p>
              </div>
              <Badge variant="primary">{previewTier}티어</Badge>
            </div>
            <p className="mt-2 text-xs text-text-tertiary">
              전투력 35% · 오더 25% · 팀 기여 20% · 안정성 10% · 경험 10%
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setScoreAccount(null)}
            >
              취소
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "저장 중..." : "평가 저장"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
