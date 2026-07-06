"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, RefreshCw, Radio, Loader2 } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
} from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { broadcastApi } from "@/lib/api-client";

/**
 * 방송 토큰(OBS 오버레이) 관리 — 스트리머당 1개.
 * OBS 브라우저 소스에 한 번 등록해두면 내가 만든 방을 자동 추종한다.
 * 토큰은 hash 저장이라 원문 복구 불가 → 발급/재생성 시에만 링크를 보여준다.
 */
const SCENE_PRESETS: { key: string; label: string; scene: string }[] = [
  { key: "room", label: "전체(자동 추종)", scene: "room" },
  { key: "bracket", label: "대진표", scene: "bracket" },
  { key: "match", label: "경기 중계", scene: "match" },
];

export function BroadcastTokenSection() {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [exists, setExists] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  // 마운트 시 토큰 상태만 조회(발급은 하지 않음 — 원문은 발급 시에만 노출)
  useEffect(() => {
    let alive = true;
    broadcastApi
      .getToken()
      .then((res) => {
        if (!alive) return;
        setExists(res.exists);
      })
      .catch(() => addToast("방송 토큰 상태를 불러오지 못했습니다.", "error"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [addToast]);

  const create = useCallback(async () => {
    setBusy(true);
    try {
      const res = await broadcastApi.createToken();
      setExists(res.exists);
      setToken(res.token);
      addToast("방송 토큰을 발급했습니다. OBS에 링크를 등록하세요.", "success");
    } catch {
      addToast("발급에 실패했습니다.", "error");
    } finally {
      setBusy(false);
    }
  }, [addToast]);

  const rotate = useCallback(async () => {
    setBusy(true);
    try {
      const res = await broadcastApi.rotateToken();
      setExists(true);
      setToken(res.token);
      addToast("새 토큰을 발급했습니다. 기존 링크는 무효화됩니다.", "success");
    } catch {
      addToast("재생성에 실패했습니다.", "error");
    } finally {
      setBusy(false);
    }
  }, [addToast]);

  const revoke = useCallback(async () => {
    setBusy(true);
    try {
      await broadcastApi.revokeToken();
      setToken(null);
      setExists(false);
      addToast("방송 토큰을 비활성화했습니다.", "info");
    } catch {
      addToast("비활성화에 실패했습니다.", "error");
    } finally {
      setBusy(false);
    }
  }, [addToast]);

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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Radio className="h-5 w-5 text-accent-primary" />
          방송 오버레이 (OBS)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-text-secondary">
          아래 링크를 OBS의 <b>브라우저 소스</b>(1920×1080)에 한 번 등록해두면,
          내가 방을 만들 때마다 그 방이 자동으로 방송 화면에 나옵니다. 링크를
          매번 바꿀 필요가 없습니다.
        </p>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-text-tertiary">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <>
            {/* 아직 발급 전 */}
            {!exists && !token && (
              <Button onClick={create} disabled={busy}>
                {busy ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Radio className="mr-2 h-4 w-4" />
                )}
                방송 토큰 발급
              </Button>
            )}

            {/* 방금 발급/재생성 → 링크 표시 */}
            {token && (
              <div className="space-y-2">
                {SCENE_PRESETS.map((p) => (
                  <div
                    key={p.key}
                    className="flex items-center justify-between gap-3 rounded-lg border border-bg-elevated bg-bg-tertiary px-3 py-2"
                  >
                    <span className="text-sm font-medium text-text-primary">
                      {p.label}
                    </span>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => copy(p.scene)}
                    >
                      <Copy className="mr-1 h-3.5 w-3.5" />
                      복사
                    </Button>
                  </div>
                ))}
                <p className="pt-1 text-xs text-text-tertiary">
                  투명 배경이 기본입니다. 풀씬 배경이 필요하면 링크 끝에{" "}
                  <code className="rounded bg-bg-elevated px-1">
                    &bg=opaque
                  </code>{" "}
                  를 붙이세요.
                </p>
              </div>
            )}

            {/* 이미 발급됨(원문 분실 상태) */}
            {exists && !token && (
              <div className="rounded-lg border border-bg-elevated bg-bg-tertiary p-4 text-sm text-text-secondary">
                이미 방송 토큰이 활성화되어 있습니다. 보안상 기존 링크는 다시
                표시할 수 없으니, 링크를 분실했다면 <b>재생성</b>하세요.
              </div>
            )}

            {/* 관리 버튼 */}
            {(exists || token) && (
              <div className="flex items-center justify-between border-t border-bg-tertiary pt-3">
                <button
                  type="button"
                  onClick={revoke}
                  disabled={busy}
                  className="text-xs text-text-tertiary hover:text-accent-danger disabled:opacity-40"
                >
                  토큰 비활성화
                </button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={rotate}
                  disabled={busy}
                >
                  <RefreshCw className="mr-1 h-3.5 w-3.5" />
                  토큰 재생성
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
