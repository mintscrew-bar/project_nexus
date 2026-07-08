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
  { key: "control", label: "컨트롤 모드", scene: "control" },
  { key: "room", label: "방 상태 자동", scene: "room" },
  { key: "bracket", label: "대진표", scene: "bracket" },
  { key: "match", label: "경기 중계", scene: "match" },
];

export function BroadcastTokenSection() {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [exists, setExists] = useState(false);
  const [controlExists, setControlExists] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [controlToken, setControlToken] = useState<string | null>(null);

  // 마운트 시 토큰 상태만 조회(발급은 하지 않음 — 원문은 발급 시에만 노출)
  useEffect(() => {
    let alive = true;
    broadcastApi
      .getToken()
      .then((res) => {
        if (!alive) return;
        setExists(res.exists);
        setControlExists(res.controlExists);
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
      setControlToken(null);
      setExists(false);
      setControlExists(false);
      addToast("방송 토큰을 비활성화했습니다.", "info");
    } catch {
      addToast("비활성화에 실패했습니다.", "error");
    } finally {
      setBusy(false);
    }
  }, [addToast]);

  const createControlToken = useCallback(async () => {
    setBusy(true);
    try {
      const res = await broadcastApi.createControlToken();
      setControlExists(res.exists);
      setControlToken(res.token);
      addToast("방송 조작 토큰을 발급했습니다.", "success");
    } catch {
      addToast("조작 토큰 발급에 실패했습니다.", "error");
    } finally {
      setBusy(false);
    }
  }, [addToast]);

  const rotateControlToken = useCallback(async () => {
    setBusy(true);
    try {
      const res = await broadcastApi.rotateControlToken();
      setControlExists(true);
      setControlToken(res.token);
      addToast("새 방송 조작 토큰을 발급했습니다.", "success");
    } catch {
      addToast("조작 토큰 재생성에 실패했습니다.", "error");
    } finally {
      setBusy(false);
    }
  }, [addToast]);

  const revokeControlToken = useCallback(async () => {
    setBusy(true);
    try {
      await broadcastApi.revokeControlToken();
      setControlToken(null);
      setControlExists(false);
      addToast("방송 조작 토큰을 비활성화했습니다.", "info");
    } catch {
      addToast("조작 토큰 비활성화에 실패했습니다.", "error");
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

  const copyControlWebhook = useCallback(
    async (scene: string) => {
      if (!controlToken) return;
      const url = `${window.location.origin}/api/broadcast/control/${controlToken}/action`;
      await navigator.clipboard.writeText(
        `POST ${url}\nContent-Type: application/json\n\n{"scene":"${scene}"}`,
      );
      addToast("외부 장비용 webhook 예시를 복사했습니다.", "success");
    },
    [controlToken, addToast],
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
                <p className="text-xs text-text-tertiary">
                  컨트롤 모드는 별도 조작 패널이나 외부 장비 명령에 따라 한 OBS
                  소스 안에서 장면을 전환합니다.
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

            <div className="space-y-3 border-t border-bg-tertiary pt-4">
              <div>
                <p className="text-sm font-bold text-text-primary">
                  외부 조작 토큰
                </p>
                <p className="mt-1 text-xs text-text-tertiary">
                  Stream Deck, Ulanzi 브릿지, 자동화 스크립트에서 방송 장면만
                  바꾸는 제한 토큰입니다. OBS 출력 토큰과 별도입니다.
                </p>
              </div>

              {!controlExists && !controlToken ? (
                <Button size="sm" variant="secondary" onClick={createControlToken} disabled={busy}>
                  {busy ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Radio className="mr-2 h-4 w-4" />
                  )}
                  조작 토큰 발급
                </Button>
              ) : (
                <div className="space-y-2">
                  {controlToken ? (
                    <div className="grid gap-2 sm:grid-cols-3">
                      {["auto", "bracket", "match"].map((scene) => (
                        <Button
                          key={scene}
                          size="sm"
                          variant="secondary"
                          onClick={() => copyControlWebhook(scene)}
                        >
                          <Copy className="mr-1 h-3.5 w-3.5" />
                          {scene}
                        </Button>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-bg-elevated bg-bg-tertiary p-3 text-sm text-text-secondary">
                      조작 토큰이 활성화되어 있습니다. 원문은 다시 표시할 수
                      없으니 분실했다면 재생성하세요.
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={revokeControlToken}
                      disabled={busy}
                      className="text-xs text-text-tertiary hover:text-accent-danger disabled:opacity-40"
                    >
                      조작 토큰 비활성화
                    </button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={rotateControlToken}
                      disabled={busy}
                    >
                      <RefreshCw className="mr-1 h-3.5 w-3.5" />
                      조작 토큰 재생성
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
