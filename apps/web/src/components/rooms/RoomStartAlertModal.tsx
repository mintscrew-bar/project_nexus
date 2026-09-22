"use client";

import { usePathname, useRouter } from "next/navigation";
import { Headphones, CheckSquare } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useLobbyStore } from "@/stores/lobby-store";

/** 조건별 안내 — 무엇을 하면 되는지를 한 줄로 */
const ITEM_COPY = {
  READY: {
    icon: CheckSquare,
    title: "준비 완료를 눌러주세요",
    body: "로비 아래쪽의 '준비 완료하기' 버튼입니다.",
  },
  VOICE: {
    icon: Headphones,
    title: "Discord 대기실에 들어가세요",
    body: "대기실 음성 채널에 있어야 내전을 시작할 수 있습니다.",
  },
} as const;

/**
 * 방장이 시작하려는데 내가 막고 있을 때 뜨는 확인 모달.
 *
 * 알림함에 쌓이거나 잠깐 떴다 사라지는 알림으로는 놓친다. "지금 해 달라"는
 * 요청이라 확인을 눌러야 사라지게 한다(운영자 결정, 2026-09-22). 사이트 공통
 * 화면(AppShell)에 달아, 로비 밖 다른 페이지에 있어도 뜬다.
 */
export function RoomStartAlertModal() {
  const alert = useLobbyStore((state) => state.startAlert);
  const dismiss = useLobbyStore((state) => state.dismissStartAlert);
  const router = useRouter();
  const pathname = usePathname();

  if (!alert) return null;
  const onLobby = pathname === alert.lobbyPath;

  return (
    <Modal
      isOpen
      onClose={dismiss}
      title="방장이 시작을 기다리고 있어요"
      size="sm"
      showCloseButton={false}
      // 배경 클릭·ESC 로는 닫히지 않는다. 확인을 눌러야 사라진다.
      disableBackdropClose
    >
      <div className="space-y-4">
        <p className="text-sm leading-6 text-text-secondary">
          『{alert.roomName}』 방장{" "}
          <b className="text-text-primary">{alert.hostName}</b>
          님이 내전을 시작하려고 합니다. 아래를 마치면 바로 시작됩니다.
        </p>

        <ul className="space-y-2">
          {alert.items.map((item) => {
            const copy = ITEM_COPY[item];
            const Icon = copy.icon;
            return (
              <li
                key={item}
                className="flex gap-3 rounded-xl border border-accent-warning/35 bg-accent-warning/[0.08] px-4 py-3"
              >
                <Icon className="mt-0.5 h-5 w-5 flex-none text-accent-warning" />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-text-primary">
                    {copy.title}
                  </p>
                  <p className="mt-0.5 text-xs leading-5 text-text-secondary">
                    {copy.body}
                  </p>
                  {item === "VOICE" && alert.voiceUrl && (
                    <a
                      href={alert.voiceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1.5 inline-block text-xs font-semibold text-accent-primary hover:underline"
                    >
                      Discord 대기실 열기 →
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        <div className="flex justify-end gap-2">
          {!onLobby && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                dismiss();
                router.push(alert.lobbyPath);
              }}
            >
              로비로 가기
            </Button>
          )}
          <Button variant="primary" size="sm" onClick={dismiss}>
            확인
          </Button>
        </div>
      </div>
    </Modal>
  );
}
