"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock3, Copy, Megaphone } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { roomApi } from "@/lib/api-client";

/** 로비 준비 현황 체크리스트 한 칸(page.tsx 의 startRequirements) */
export interface StartRequirement {
  id: string;
  label: string;
  value: string;
  complete: boolean;
  detail: string;
}

/** 서버가 시작을 거절한 사유(api start-blocked.ts) */
export interface ServerStartBlock {
  reason: "READY" | "ROSTER" | "TEAMS" | "VOICE";
  message: string;
  missingUsers: string[];
}

type NudgeReason = "READY" | "VOICE";

/** 서버 사유 코드 → 체크리스트 칸 id */
const REASON_TO_REQUIREMENT: Record<ServerStartBlock["reason"], string> = {
  READY: "ready",
  ROSTER: "roster",
  TEAMS: "teams",
  VOICE: "voice",
};

const REASON_LABEL: Record<ServerStartBlock["reason"], string> = {
  READY: "준비 완료",
  ROSTER: "참가 인원",
  TEAMS: "팀 선택",
  VOICE: "Discord 대기실",
};

/** 사람이 해결해야 하는 칸마다 방장이 할 수 있는 일 */
const REQUIREMENT_TIP: Record<string, string> = {
  roster:
    "초대 링크를 공유하거나, 방 설정에서 정원을 지금 인원에 맞게 줄일 수 있습니다.",
  teams: "팀을 안 고른 참가자에게 로비 채팅으로 알려주세요.",
  voice: "대기실에 없는 사람을 부르거나 링크를 채팅에 붙여 주세요.",
  ready: "준비를 안 누른 사람에게 요청을 보낼 수 있습니다.",
};

/**
 * 서버 판정을 화면 체크리스트에 겹친다.
 *
 * 화면은 음성 상태를 모르는 참가자를 통과로 치고, 서버는 디스코드에 직접
 * 물어본다. 그래서 화면이 "시작 가능"이라 해도 서버가 막을 수 있다. 그때는
 * 서버 쪽이 사실이다 — 해당 칸을 미완료로 바꾸고 서버가 준 이름을 싣는다.
 */
function mergeServerBlock(
  requirements: StartRequirement[],
  block: ServerStartBlock | null,
): StartRequirement[] {
  if (!block) return requirements;
  const id = REASON_TO_REQUIREMENT[block.reason];
  const detail =
    block.missingUsers.length > 0
      ? `서버 확인: ${block.missingUsers.join(", ")}`
      : block.message;
  const exists = requirements.some((item) => item.id === id);
  if (!exists) {
    return [
      ...requirements,
      {
        id,
        label: REASON_LABEL[block.reason],
        value: "확인 필요",
        complete: false,
        detail,
      },
    ];
  }
  return requirements.map((item) =>
    item.id === id ? { ...item, complete: false, detail } : item,
  );
}

interface StartBlockedModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomId: string;
  requirements: StartRequirement[];
  /** 서버가 거절했을 때만 있다. 화면 판정만으로 연 경우는 null */
  serverBlock: ServerStartBlock | null;
  /** 방 대기실 음성 채널 링크(없으면 복사 버튼을 숨긴다) */
  lobbyVoiceUrl: string | null;
}

/**
 * 시작 조건이 안 맞은 채로 방장이 "내전 시작"을 눌렀을 때 뜨는 모달.
 *
 * 사라지는 토스트로는 "오류가 떴네" 하고 넘어가 무엇을 고쳐야 하는지 몰랐다
 * (2026-09-22 운영자 제보). 시작을 누른 순간이 "왜 안 되는지" 알고 싶은
 * 순간이라, 그때 막힌 항목·사람·해결 버튼을 한 번에 보여준다. 체크리스트와
 * 같은 내용을 반복하지 않도록, 모달은 호출·링크 복사 같은 행동을 함께 준다.
 */
export function StartBlockedModal({
  isOpen,
  onClose,
  roomId,
  requirements,
  serverBlock,
  lobbyVoiceUrl,
}: StartBlockedModalProps) {
  const rows = useMemo(() => {
    const merged = mergeServerBlock(requirements, serverBlock);
    // 남은 것부터 보여준다. 끝난 칸은 아래로 내려 "무엇이 남았나"가 먼저 읽힌다.
    return [
      ...merged.filter((item) => !item.complete),
      ...merged.filter((item) => item.complete),
    ];
  }, [requirements, serverBlock]);
  const remaining = rows.filter((row) => !row.complete).length;

  // 사유별 호출 상태. 쿨다운은 서버가 걸지만 버튼에도 남은 시간을 보여준다.
  const [nudge, setNudge] = useState<
    Partial<
      Record<
        NudgeReason,
        { sending: boolean; message?: string; failed?: boolean; until?: number }
      >
    >
  >({});
  const [now, setNow] = useState(() => Date.now());
  const [copied, setCopied] = useState(false);

  const hasCooldown = Object.values(nudge).some(
    (state) => state?.until && state.until > now,
  );
  useEffect(() => {
    if (!isOpen || !hasCooldown) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [isOpen, hasCooldown]);

  const sendNudge = async (reason: NudgeReason) => {
    setNudge((prev) => ({ ...prev, [reason]: { sending: true } }));
    try {
      const result = await roomApi.nudge(roomId, reason);
      setNudge((prev) => ({
        ...prev,
        [reason]: {
          sending: false,
          message:
            result.targets === 0
              ? "부를 사람이 없습니다. 방금 해결된 것 같아요."
              : `${result.targets}명에게 보냈습니다 · 사이트 알림 ${result.siteNotified}명 · 디스코드 DM ${result.dmDelivered}명`,
          until:
            result.cooldownSeconds > 0
              ? Date.now() + result.cooldownSeconds * 1000
              : undefined,
        },
      }));
      setNow(Date.now());
    } catch (error: any) {
      setNudge((prev) => ({
        ...prev,
        [reason]: {
          sending: false,
          failed: true,
          message:
            error?.response?.data?.message ?? "호출을 보내지 못했습니다.",
        },
      }));
    }
  };

  const copyVoiceLink = async () => {
    if (!lobbyVoiceUrl) return;
    try {
      await navigator.clipboard.writeText(lobbyVoiceUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // 클립보드 권한이 없으면 링크를 그대로 보여준다.
      window.prompt("대기실 링크", lobbyVoiceUrl);
    }
  };

  const nudgeButton = (reason: NudgeReason, label: string) => {
    const state = nudge[reason];
    const waitSeconds =
      state?.until && state.until > now
        ? Math.ceil((state.until - now) / 1000)
        : 0;
    return (
      <div className="flex flex-col gap-1">
        <Button
          size="sm"
          variant="primary"
          onClick={() => sendNudge(reason)}
          disabled={Boolean(state?.sending) || waitSeconds > 0}
          isLoading={state?.sending}
        >
          <Megaphone className="mr-1.5 h-4 w-4" />
          {waitSeconds > 0 ? `${waitSeconds}초 뒤 다시 호출` : label}
        </Button>
        {state?.message && (
          <p
            className={`text-[11px] leading-4 ${
              state.failed ? "text-accent-danger" : "text-text-tertiary"
            }`}
          >
            {state.message}
          </p>
        )}
      </div>
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="아직 시작할 수 없어요"
      size="md"
    >
      <div className="space-y-4">
        <p className="text-sm leading-6 text-text-secondary">
          {remaining === 0
            ? // 모달을 열어 둔 사이 다 풀렸다(참가·준비 상태는 실시간으로 바뀐다).
              "모든 조건이 갖춰졌습니다. 닫고 '내전 시작'을 누르세요."
            : serverBlock && requirements.every((item) => item.complete)
              ? "화면에서는 조건이 다 된 것으로 보였지만, 서버가 방금 다시 확인했더니 아래 항목이 남아 있었습니다."
              : `시작 조건 ${remaining}개가 남았습니다. 아래 항목을 해결하면 바로 시작할 수 있습니다.`}
        </p>

        <ul className="space-y-2.5">
          {rows.map((row) => (
            <li
              key={row.id}
              className={`rounded-xl border px-4 py-3 ${
                row.complete
                  ? "border-accent-success/20 bg-accent-success/[0.05]"
                  : "border-accent-warning/35 bg-accent-warning/[0.08]"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-sm font-bold text-text-primary">
                  {row.complete ? (
                    <CheckCircle2 className="h-4 w-4 flex-none text-accent-success" />
                  ) : (
                    <Clock3 className="h-4 w-4 flex-none text-accent-warning" />
                  )}
                  {row.label}
                </span>
                <span
                  className={`text-xs font-bold ${
                    row.complete ? "text-accent-success" : "text-accent-warning"
                  }`}
                >
                  {row.value}
                </span>
              </div>

              {!row.complete && (
                <>
                  <p className="mt-1.5 text-xs leading-5 text-text-primary">
                    {row.detail}
                  </p>
                  {REQUIREMENT_TIP[row.id] && (
                    <p className="mt-0.5 text-[11px] leading-4 text-text-tertiary">
                      {REQUIREMENT_TIP[row.id]}
                    </p>
                  )}
                  {(row.id === "voice" || row.id === "ready") && (
                    <div className="mt-3 flex flex-wrap items-start gap-2">
                      {row.id === "voice" && lobbyVoiceUrl && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={copyVoiceLink}
                        >
                          <Copy className="mr-1.5 h-4 w-4" />
                          {copied ? "복사했습니다" : "대기실 링크 복사"}
                        </Button>
                      )}
                      {row.id === "voice" &&
                        nudgeButton("VOICE", "대기실 입장 요청 보내기")}
                      {row.id === "ready" &&
                        nudgeButton("READY", "준비 요청 보내기")}
                    </div>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>

        <p className="text-[11px] leading-4 text-text-tertiary">
          요청은 사이트 알림과 디스코드 DM으로 함께 갑니다. 같은 요청은 1분에 한
          번 보낼 수 있습니다.
        </p>

        <div className="flex justify-end">
          <Button variant="secondary" size="sm" onClick={onClose}>
            닫기
          </Button>
        </div>
      </div>
    </Modal>
  );
}
