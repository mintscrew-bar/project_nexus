"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, RefreshCw, Radio, Loader2, SlidersHorizontal, ExternalLink } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
} from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { broadcastApi } from "@/lib/api-client";
import { openBroadcastControlWindow } from "@/lib/open-broadcast-control";

/**
 * 방송 토큰(OBS 오버레이) 관리 — 스트리머당 1개.
 * OBS 브라우저 소스에 한 번 등록해두면 내가 만든 방을 자동 추종한다.
 * 토큰은 hash 저장이라 원문 복구 불가 → 발급/재생성 시에만 링크를 보여준다.
 */
const SCENE_PRESETS: {
  key: string;
  label: string;
  scene: string;
  recommended?: boolean;
  desc: string;
}[] = [
  {
    key: "control",
    label: "컨트롤 모드",
    scene: "control",
    recommended: true,
    desc: "OBS에 이 링크 하나만 등록하세요. 조작 패널·외부 장비(스트림덱 등)로 대기·경매·대진표·경기 장면을 실시간 전환합니다. 대부분 이거 하나면 충분합니다.",
  },
  {
    key: "room",
    label: "방 상태 자동",
    scene: "room",
    desc: "방의 진행 단계(대기 → 경매/드래프트 → 역할 선택)를 자동으로 따라가며 표시합니다. 조작 없이 방송하고 싶을 때 쓰세요.",
  },
  {
    key: "bracket",
    label: "대진표",
    scene: "bracket",
    desc: "토너먼트 대진표만 고정으로 띄웁니다. 경기 사이 브레이크 화면이나 별도 소스로 항상 대진표를 보여줄 때 유용합니다.",
  },
  {
    key: "match",
    label: "경기 중계",
    scene: "match",
    desc: "현재 진행 중인 경기(진영·팀)를 띄웁니다. 특정 경기를 고정하려면 로비의 방송 버튼에서 중계 경기를 지정하세요.",
  },
];

// 외부 조작 토큰 webhook 프리셋 — 컨트롤 모드 OBS 소스의 장면을 바꾸는 명령
const CONTROL_SCENE_PRESETS: { scene: string; label: string; desc: string }[] =
  [
    {
      scene: "auto",
      label: "auto (자동)",
      desc: "방 진행 단계에 맞춰 장면을 자동 전환합니다.",
    },
    {
      scene: "bracket",
      label: "bracket (대진표)",
      desc: "대진표 화면으로 고정합니다.",
    },
    {
      scene: "match",
      label: "match (경기)",
      desc: "현재 중계 경기 화면으로 고정합니다.",
    },
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

        {/* OBS 등록 방법 — 항상 노출되는 사용 가이드 */}
        <div className="rounded-lg border border-bg-elevated bg-bg-tertiary/60 p-3 text-xs text-text-secondary">
          <p className="mb-1 font-semibold text-text-primary">OBS 등록 방법</p>
          <ol className="list-decimal space-y-0.5 pl-4">
            <li>OBS → 소스 → + → <b>브라우저</b> 추가</li>
            <li>
              아래에서 원하는 링크를 <b>복사</b>해 URL에 붙여넣기
            </li>
            <li>
              너비 <b>1920</b> / 높이 <b>1080</b> 입력 후 확인
            </li>
          </ol>
          <p className="mt-1.5 text-text-tertiary">
            어떤 링크를 써야 할지 모르겠으면 <b>컨트롤 모드</b> 하나만
            등록하세요. 나머지는 특정 화면만 따로 띄우고 싶을 때 쓰는
            선택지입니다.
          </p>
        </div>

        {/* 웹 조작 패널 바로가기 — OBS 옆에 새 창으로 띄워두고 장면을 전환한다 */}
        <div className="flex items-center justify-between gap-3 rounded-lg border border-accent-primary/30 bg-accent-primary/5 p-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-bold text-text-primary">
              <SlidersHorizontal className="h-4 w-4 text-accent-primary" />
              방송 조작 패널
            </p>
            <p className="mt-0.5 text-xs text-text-tertiary">
              경기 중 장면 전환·하단바·공지를 여기서 조작합니다. 새 창으로
              띄워 OBS 옆에 두고 쓰세요.
            </p>
          </div>
          <button
            type="button"
            onClick={() => openBroadcastControlWindow()}
            className="inline-flex flex-shrink-0 items-center justify-center whitespace-nowrap rounded-lg bg-accent-primary px-3 py-1.5 text-sm font-medium text-white transition-colors duration-150 hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent-primary focus:ring-offset-2 focus:ring-offset-bg-primary"
          >
            <ExternalLink className="mr-1 h-3.5 w-3.5" />
            조작 패널 열기
          </button>
        </div>

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
                    className="flex items-start justify-between gap-3 rounded-lg border border-bg-elevated bg-bg-tertiary px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium text-text-primary">
                          {p.label}
                        </span>
                        {p.recommended && (
                          <span className="rounded bg-accent-primary/15 px-1.5 py-0.5 text-[10px] font-bold text-accent-primary">
                            추천
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs leading-relaxed text-text-tertiary">
                        {p.desc}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="flex-shrink-0"
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
                <p className="mt-1.5 text-xs text-text-tertiary">
                  <b className="text-text-secondary">사용법:</b> 위{" "}
                  <b>컨트롤 모드</b> 링크를 OBS에 띄워둔 상태에서, 아래 명령을
                  장비 버튼(또는 스크립트)에 등록하면 그 소스의 장면이 즉시
                  바뀝니다. 각 버튼을 누르면 해당 명령의 POST 요청 예시가
                  복사됩니다.
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
                      {CONTROL_SCENE_PRESETS.map((p) => (
                        <div
                          key={p.scene}
                          className="flex flex-col gap-1.5 rounded-lg border border-bg-elevated bg-bg-tertiary/60 p-2.5"
                        >
                          <span className="text-xs font-medium text-text-primary">
                            {p.label}
                          </span>
                          <p className="text-[11px] leading-relaxed text-text-tertiary">
                            {p.desc}
                          </p>
                          <Button
                            size="sm"
                            variant="secondary"
                            className="mt-auto"
                            onClick={() => copyControlWebhook(p.scene)}
                          >
                            <Copy className="mr-1 h-3.5 w-3.5" />
                            명령 복사
                          </Button>
                        </div>
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
