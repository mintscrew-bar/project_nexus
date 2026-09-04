"use client";

import { useMemo, useState } from "react";
import { Crosshair } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { pubgApi } from "@/lib/api-client";
import { useToast } from "@/components/ui/Toast";

interface TeamRef {
  id: string;
  name: string;
}

/**
 * 배그 킬내기 결과 입력.
 *
 * 승패·다전제·대진표는 롤과 같은 흐름을 쓰고 여기서는 킬 수만 받는다.
 * 승자를 따로 고르지 않으면 킬이 많은 팀이 이긴 것으로 본다 — 킬내기의 기본 규칙이다.
 */
export function PubgKillMatchModal({
  isOpen,
  onClose,
  matchId,
  teamA,
  teamB,
  onReported,
}: {
  isOpen: boolean;
  onClose: () => void;
  matchId: string | null;
  teamA: TeamRef | null;
  teamB: TeamRef | null;
  onReported: () => void;
}) {
  const { addToast } = useToast();
  const [killsA, setKillsA] = useState(0);
  const [killsB, setKillsB] = useState(0);
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const isTie = killsA === killsB;
  // 동점이면 기계가 정할 수 없다. 그때만 승자를 직접 고르게 한다.
  const impliedWinner = useMemo(() => {
    if (isTie) return winnerId;
    return killsA > killsB ? (teamA?.id ?? null) : (teamB?.id ?? null);
  }, [isTie, killsA, killsB, teamA, teamB, winnerId]);

  const submit = async () => {
    if (!matchId || !teamA || !teamB) return;
    if (isTie && !winnerId) {
      addToast("킬 수가 같습니다. 이긴 팀을 골라주세요.", "error");
      return;
    }
    setSaving(true);
    try {
      await pubgApi.reportKillMatch(matchId, {
        winnerId: impliedWinner ?? undefined,
        teams: [
          { teamId: teamA.id, kills: killsA },
          { teamId: teamB.id, kills: killsB },
        ],
      });
      addToast("킬내기 결과를 저장했습니다.", "success");
      onReported();
      onClose();
    } catch (err: any) {
      addToast(
        err?.response?.data?.message || "결과 저장에 실패했습니다.",
        "error",
      );
    } finally {
      setSaving(false);
    }
  };

  if (!teamA || !teamB) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="킬내기 결과" size="sm">
      <div className="space-y-4">
        {[
          { team: teamA, kills: killsA, set: setKillsA },
          { team: teamB, kills: killsB, set: setKillsB },
        ].map(({ team, kills, set }) => (
          <label key={team.id} className="block">
            <span className="text-sm font-semibold text-text-primary">
              {team.name}
            </span>
            <div className="mt-1.5 flex items-center gap-2">
              <Crosshair className="h-4 w-4 text-text-tertiary" />
              <input
                type="number"
                min={0}
                max={400}
                value={kills}
                onChange={(e) => set(Math.max(0, Number(e.target.value) || 0))}
                className="w-full input"
                aria-label={`${team.name} 킬`}
              />
            </div>
          </label>
        ))}

        {isTie && (
          <div>
            <p className="text-sm text-text-secondary">
              킬 수가 같습니다. 이긴 팀을 골라주세요.
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {[teamA, teamB].map((team) => (
                <button
                  key={team.id}
                  type="button"
                  onClick={() => setWinnerId(team.id)}
                  className={`rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
                    winnerId === team.id
                      ? "border-accent-primary bg-accent-primary/10 text-accent-primary"
                      : "border-bg-tertiary text-text-secondary hover:border-bg-elevated"
                  }`}
                >
                  {team.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {!isTie && (
          <p className="text-sm text-text-secondary">
            킬이 많은{" "}
            <span className="font-bold text-accent-primary">
              {killsA > killsB ? teamA.name : teamB.name}
            </span>
            {" "}승리로 기록됩니다.
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "저장 중..." : "결과 저장"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
