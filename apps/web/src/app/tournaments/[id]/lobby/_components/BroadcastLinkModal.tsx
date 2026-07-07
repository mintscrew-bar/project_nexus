"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Radio, Loader2, ExternalLink, Pin } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { broadcastApi } from "@/lib/api-client";

/**
 * 로비 방송 상태 모달 — 호스트 전용.
 * 방송 토큰은 유저(설정 > 방송)에서 1회 발급하고, 오버레이는 활성 방을 자동 추종한다.
 * 여기서는 "이 방이 방송에 연동됨"을 알리고, 동시에 여러 방을 열었을 때
 * 어느 방을 송출할지 고정(pin)하는 오버라이드만 제공한다.
 */
interface Props {
  isOpen: boolean;
  onClose: () => void;
  roomId: string;
}

export function BroadcastLinkModal({ isOpen, onClose, roomId }: Props) {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [hasToken, setHasToken] = useState(false);
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    broadcastApi
      .getLiveState(roomId)
      .then((res) => {
        setHasToken(res.hasToken);
        setPinned(res.pinned);
      })
      .catch(() => addToast("방송 상태를 불러오지 못했습니다.", "error"))
      .finally(() => setLoading(false));
  }, [isOpen, roomId, addToast]);

  const togglePin = useCallback(async () => {
    setBusy(true);
    try {
      const res = await broadcastApi.setLive(roomId, !pinned);
      setPinned(res.pinned);
      addToast(
        res.pinned
          ? "이 방을 방송에 고정했습니다."
          : "고정을 해제했습니다. 가장 최근 방을 자동 추종합니다.",
        "success",
      );
    } catch {
      addToast("변경에 실패했습니다.", "error");
    } finally {
      setBusy(false);
    }
  }, [roomId, pinned, addToast]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="방송 연동" size="md">
      <div className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-text-tertiary">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : !hasToken ? (
          // 토큰 미발급 → 설정으로 유도
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-sm text-text-secondary">
              <Radio className="h-4 w-4 text-accent-primary" />
              아직 방송 토큰이 없습니다. 설정에서 한 번 발급해 OBS에 등록하면,
              이후 방을 만들 때마다 자동으로 방송에 연동됩니다.
            </p>
            <Link href="/settings?tab=broadcast">
              <Button variant="secondary" size="sm">
                <ExternalLink className="mr-1 h-3.5 w-3.5" />
                설정 &gt; 방송에서 토큰 발급
              </Button>
            </Link>
          </div>
        ) : (
          // 토큰 있음 → 자동 연동 안내 + 고정 토글
          <div className="space-y-4">
            <p className="flex items-center gap-2 text-sm text-text-secondary">
              <Radio className="h-4 w-4 text-accent-primary" />이 방은 OBS
              오버레이에 <b>자동으로 연동</b>됩니다. 링크를 새로 복사할 필요가
              없습니다.
            </p>

            <div className="flex items-center justify-between gap-3 rounded-lg border border-bg-elevated bg-bg-tertiary px-4 py-3">
              <div className="flex items-start gap-2">
                <Pin className="mt-0.5 h-4 w-4 text-accent-primary" />
                <div>
                  <p className="text-sm font-medium text-text-primary">
                    이 방 고정 송출
                  </p>
                  <p className="text-xs text-text-tertiary">
                    동시에 여러 방을 열었을 때, 이 방을 방송 화면으로
                    고정합니다. 평소엔 꺼둬도 가장 최근 방이 자동 표시됩니다.
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                variant={pinned ? "primary" : "secondary"}
                onClick={togglePin}
                disabled={busy}
              >
                {busy && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                {pinned ? "고정됨" : "고정"}
              </Button>
            </div>

            <p className="text-xs text-text-tertiary">
              링크 관리·씬별 주소는{" "}
              <Link href="/settings?tab=broadcast" className="underline">
                설정 &gt; 방송
              </Link>
              에서 확인하세요.
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}
