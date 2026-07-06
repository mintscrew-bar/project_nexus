"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, RefreshCw, Radio, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { broadcastApi } from "@/lib/api-client";

/**
 * 방송 링크(OBS 오버레이) 관리 모달 — 호스트 전용.
 * 토큰은 hash 저장이라 원문 복구 불가 → 생성/재생성 시에만 링크를 보여준다.
 */
interface Props {
  isOpen: boolean;
  onClose: () => void;
  roomId: string;
}

const SCENE_PRESETS: { key: string; label: string; scene: string }[] = [
  { key: "room", label: "전체(자동 추종)", scene: "room" },
  { key: "bracket", label: "대진표", scene: "bracket" },
  { key: "match", label: "경기 중계", scene: "match" },
];

export function BroadcastLinkModal({ isOpen, onClose, roomId }: Props) {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [exists, setExists] = useState(false);

  // 모달 열릴 때 토큰 상태 조회(없으면 생성)
  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    broadcastApi
      .createToken(roomId)
      .then((res) => {
        setExists(res.exists);
        setToken(res.token);
      })
      .catch(() => addToast("방송 링크를 불러오지 못했습니다.", "error"))
      .finally(() => setLoading(false));
  }, [isOpen, roomId, addToast]);

  const rotate = useCallback(async () => {
    setLoading(true);
    try {
      const res = await broadcastApi.rotateToken(roomId);
      setToken(res.token);
      setExists(true);
      addToast("새 방송 링크를 발급했습니다. 기존 링크는 무효화됩니다.", "success");
    } catch {
      addToast("재생성에 실패했습니다.", "error");
    } finally {
      setLoading(false);
    }
  }, [roomId, addToast]);

  const revoke = useCallback(async () => {
    setLoading(true);
    try {
      await broadcastApi.revokeToken(roomId);
      setToken(null);
      setExists(false);
      addToast("방송 링크를 비활성화했습니다.", "info");
    } catch {
      addToast("비활성화에 실패했습니다.", "error");
    } finally {
      setLoading(false);
    }
  }, [roomId, addToast]);

  const copy = useCallback(
    async (scene: string) => {
      if (!token) return;
      const url = `${window.location.origin}/broadcast/${token}?scene=${scene}`;
      await navigator.clipboard.writeText(url);
      addToast("OBS 브라우저 소스용 링크를 복사했습니다.", "success");
    },
    [token, addToast],
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="방송용 오버레이 링크" size="md">
      <div className="space-y-4">
        <p className="flex items-center gap-2 text-sm text-text-secondary">
          <Radio className="h-4 w-4 text-accent-primary" />
          OBS의 <b>브라우저 소스</b>에 아래 링크를 넣으면 방송 화면이 나옵니다. (1920×1080)
        </p>

        {loading && (
          <div className="flex items-center justify-center py-8 text-text-tertiary">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        )}

        {!loading && token && (
          <div className="space-y-2">
            {SCENE_PRESETS.map((p) => (
              <div
                key={p.key}
                className="flex items-center justify-between gap-3 rounded-lg border border-bg-elevated bg-bg-tertiary px-3 py-2"
              >
                <span className="text-sm font-medium text-text-primary">
                  {p.label}
                </span>
                <Button size="sm" variant="secondary" onClick={() => copy(p.scene)}>
                  <Copy className="mr-1 h-3.5 w-3.5" />
                  복사
                </Button>
              </div>
            ))}
            <p className="pt-1 text-xs text-text-tertiary">
              투명 배경이 기본입니다. 풀씬 배경이 필요하면 링크 끝에{" "}
              <code className="rounded bg-bg-elevated px-1">&bg=opaque</code> 를 붙이세요.
            </p>
          </div>
        )}

        {!loading && !token && exists && (
          <div className="rounded-lg border border-bg-elevated bg-bg-tertiary p-4 text-sm text-text-secondary">
            이미 방송 링크가 활성화되어 있습니다. 보안상 기존 링크는 다시 표시할 수
            없으니, 링크를 분실했다면 <b>재생성</b>하세요.
          </div>
        )}

        <div className="flex items-center justify-between border-t border-bg-tertiary pt-3">
          <button
            type="button"
            onClick={revoke}
            disabled={loading || (!token && !exists)}
            className="text-xs text-text-tertiary hover:text-accent-danger disabled:opacity-40"
          >
            방송 링크 비활성화
          </button>
          <Button size="sm" variant="secondary" onClick={rotate} disabled={loading}>
            <RefreshCw className="mr-1 h-3.5 w-3.5" />
            링크 재생성
          </Button>
        </div>
      </div>
    </Modal>
  );
}
