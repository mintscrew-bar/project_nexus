"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Megaphone } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui";
import { useAuthStore } from "@/stores/auth-store";
import { useNotificationStore } from "@/stores/notification-store";
import { notificationApi, type PopupNotice } from "@/lib/api-client";

/**
 * 진행 화면에서는 띄우지 않는다 — 경매·드래프트·역할 선택·로비에서 모달이 뜨면
 * 시간 제한이 있는 조작을 가린다. 방송 오버레이에는 절대 띄우지 않는다.
 * (칭찬 창과 같은 기준)
 */
const BLOCKED_PATH = /\/(auction|draft|role-selection|lobby|broadcast)(\/|$)/;

const POPUP_QUERY_KEY = ["noticePopups"];

/**
 * 운영자 공지 모달.
 *
 * 개인 공지는 항상, 전체 공지는 발송할 때 "모달로 띄우기"를 고른 경우에만
 * 알림 data.popup 이 붙는다. 읽지 않은 그런 공지가 있으면 화면 가운데 모달로 띄운다.
 *  - "확인" / "자세히 보기" → 알림을 읽음 처리 → 다시 뜨지 않는다 (🔔 개수도 줄어든다)
 *  - X(닫기) → 이번 접속에서만 숨긴다. 새로고침하거나 다음에 접속하면 다시 뜬다
 *  - 🔔 에서 먼저 읽어도 다시 뜨지 않는다
 * 여러 개가 쌓였으면 먼저 온 것부터 하나씩 띄운다.
 */
export function NoticePopup() {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuthStore();
  const markAsRead = useNotificationStore((s) => s.markAsRead);
  const latestNotification = useNotificationStore((s) => s.notifications[0]);
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const blocked = BLOCKED_PATH.test(pathname);

  const { data: popups } = useQuery({
    queryKey: POPUP_QUERY_KEY,
    queryFn: notificationApi.getPopups,
    enabled: isAuthenticated,
    refetchInterval: 2 * 60 * 1000,
    refetchOnWindowFocus: true,
    staleTime: 30 * 1000,
  });

  // 실시간: 모달 공지가 새로 들어오거나, 🔔 에서 읽어 안 읽은 수가 바뀌면 다시 확인한다
  const latestId = latestNotification?.data?.popup
    ? latestNotification.id
    : null;
  useEffect(() => {
    if (!isAuthenticated) return;
    void queryClient.invalidateQueries({ queryKey: POPUP_QUERY_KEY });
  }, [latestId, unreadCount, isAuthenticated, queryClient]);

  // X 로 닫은 공지 — 이번 접속에서만 숨긴다
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const current = (popups ?? []).find((p) => !hiddenIds.includes(p.id));
  if (!isAuthenticated || blocked || !current) return null;

  const total = (popups ?? []).filter((p) => !hiddenIds.includes(p.id)).length;

  /** 읽음 처리하고 목록에서 뺀다 */
  const acknowledge = async () => {
    setBusy(true);
    try {
      await markAsRead(current.id);
    } finally {
      // 실패해도 이번 접속에서는 다시 띄우지 않는다(다음 접속에 다시 뜬다)
      queryClient.setQueryData<PopupNotice[]>(POPUP_QUERY_KEY, (prev) =>
        (prev ?? []).filter((p) => p.id !== current.id),
      );
      setBusy(false);
    }
  };

  const openLink = async () => {
    const link = current.link;
    await acknowledge();
    if (!link) return;
    if (/^https?:\/\//i.test(link)) {
      window.open(link, "_blank", "noopener,noreferrer");
    } else {
      router.push(link);
    }
  };

  return (
    <Modal
      isOpen
      onClose={() => setHiddenIds((prev) => [...prev, current.id])}
      size="md"
      disableBackdropClose
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-primary/15 text-accent-primary">
            <Megaphone className="h-5 w-5" />
          </span>
          <div className="min-w-0 pr-6">
            <p className="text-xs font-semibold text-accent-primary">
              운영자 공지
              {total > 1 && (
                <span className="ml-1.5 text-text-muted">· {total}개 남음</span>
              )}
            </p>
            <h2 className="mt-0.5 break-words text-lg font-bold text-text-primary">
              {current.title}
            </h2>
            <p className="mt-0.5 text-xs text-text-muted">
              {new Date(current.createdAt).toLocaleString("ko-KR", {
                month: "long",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
        </div>
        <div className="max-h-[50vh] overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-bg-tertiary p-4 text-sm leading-relaxed text-text-secondary">
          {current.message}
        </div>
        <div className="flex justify-end gap-2">
          {current.link && (
            <Button variant="secondary" onClick={openLink} disabled={busy}>
              자세히 보기
            </Button>
          )}
          <Button onClick={acknowledge} disabled={busy}>
            확인
          </Button>
        </div>
      </div>
    </Modal>
  );
}
