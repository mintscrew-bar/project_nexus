"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Swords, X } from "lucide-react";
import { Avatar } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { useFriendStore } from "@/stores/friend-store";
import { roomPath } from "@/lib/room-links";

/** 팝업이 스스로 닫히기까지(ms). 닫혀도 초대는 친구창 대기 탭에 남는다. */
const AUTO_HIDE_MS = 30_000;

/**
 * 친구가 보낸 내전 초대 팝업 — 화면 왼쪽 아래.
 *
 * 어느 페이지에 있든 뜬다(AppShell). 위쪽 가운데는 토스트, 오른쪽은 친구창·DM
 * 창이 쓰고 있어 왼쪽 아래에 둔다. 확인을 강요하지 않는다 — 30초 뒤 닫히고,
 * 놓친 초대는 친구창 "대기" 탭에서 다시 볼 수 있다(운영자 결정, 2026-09-22).
 */
export function RoomInvitePopup() {
  const router = useRouter();
  const { addToast } = useToast();
  const invite = useFriendStore((s) =>
    s.roomInvites.find((i) => i.roomId === s.popupInviteRoomId),
  );
  const dismiss = useFriendStore((s) => s.dismissInvitePopup);
  const take = useFriendStore((s) => s.takeRoomInvite);
  const decline = useFriendStore((s) => s.declineRoomInvite);
  const [busy, setBusy] = useState(false);

  // 새 초대가 뜰 때마다 타이머를 다시 건다.
  useEffect(() => {
    if (!invite) return;
    const timer = setTimeout(dismiss, AUTO_HIDE_MS);
    return () => clearTimeout(timer);
  }, [invite?.roomId, invite?.createdAt, dismiss]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!invite) return null;

  const gameLabel = invite.gameTitle === "PUBG" ? "배그" : "롤";

  const handleJoin = () => {
    // 입장은 로비 화면이 한다. 초대가 있으면 비밀번호를 묻지 않는다.
    take(invite.roomId);
    router.push(roomPath({ id: invite.roomId, gameTitle: invite.gameTitle }));
  };

  const handleDecline = async () => {
    setBusy(true);
    try {
      await decline(invite.roomId);
    } catch {
      addToast("초대를 거절하지 못했습니다.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="내전 초대"
      className="fixed bottom-6 left-6 z-[60] w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-accent-primary/40 bg-bg-secondary p-4 shadow-2xl"
    >
      <div className="flex items-start gap-3">
        <Avatar
          src={invite.inviter.avatar}
          alt={invite.inviter.username}
          fallback={invite.inviter.username}
          size="md"
        />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-accent-primary">
            <Swords className="h-3.5 w-3.5" />
            내전 초대 · {gameLabel}
          </p>
          <p className="mt-1 text-sm text-text-primary">
            <b>{invite.inviter.username}</b>님이 같이 하자고 합니다
          </p>
          <p className="mt-0.5 truncate text-xs text-text-secondary">
            『{invite.roomName}』 {invite.playerCount}/{invite.maxParticipants}
            명
          </p>
        </div>
        <button
          onClick={dismiss}
          className="rounded-md p-1 text-text-tertiary hover:bg-bg-tertiary hover:text-text-primary"
          title="닫기 — 친구창 대기 탭에 남습니다"
          aria-label="닫기"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button
          onClick={handleDecline}
          disabled={busy}
          className="rounded-lg bg-bg-tertiary px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-elevated disabled:opacity-50"
        >
          거절
        </button>
        <button
          onClick={handleJoin}
          disabled={busy}
          className="rounded-lg bg-accent-primary px-3 py-1.5 text-sm font-semibold text-accent-on hover:bg-accent-hover disabled:opacity-50"
        >
          참가
        </button>
      </div>
    </div>
  );
}
