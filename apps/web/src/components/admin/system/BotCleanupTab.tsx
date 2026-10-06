"use client";

import { useCallback, useEffect, useState } from "react";
import { adminApi } from "@/lib/api-client";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  LoadingSpinner,
} from "@/components/ui";
import { Bot } from "lucide-react";
import type { AddToast } from "../shared";
import { useConfirm } from "../ConfirmDialog";

/**
 * 테스트 봇이 남긴 방·기록 정리. ADMIN 전용.
 *
 * 봇 계정은 지우지 않는다(경매 리허설이 계속 쓴다). 지우는 건 봇이 연 방과
 * **참가자가 전부 봇인** 끝난 내전 기록뿐이다. 사람이 한 명이라도 섞였거나 참가자
 * 정보가 끊긴 기록은 대상이 아니다. 한 번에 200건까지라 남으면 다시 누른다.
 */
export function BotCleanupTab({ addToast }: { addToast: AddToast }) {
  const [preview, setPreview] = useState<{
    rooms: number;
    matches: number;
  } | null>(null);
  const [rooms, setRooms] = useState(true);
  const [matches, setMatches] = useState(false);
  const [busy, setBusy] = useState(false);
  const { confirm, dialog } = useConfirm();

  const load = useCallback(async () => {
    try {
      setPreview(await adminApi.getBotCleanupPreview());
    } catch {
      addToast("봇 정리 현황 로드 실패", "error");
    }
  }, [addToast]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async () => {
    const targets = [rooms && "방", matches && "내전 기록"]
      .filter(Boolean)
      .join("과 ");
    const ok = await confirm({
      title: "봇 데이터 정리",
      message: `봇이 만든 ${targets}을(를) 지웁니다. 되돌릴 수 없습니다. 봇 계정은 남습니다.`,
      confirmLabel: "정리",
      danger: true,
      requireText: "정리",
    });
    if (!ok) return;

    setBusy(true);
    try {
      const res = await adminApi.cleanupBotData({ rooms, matches });
      addToast(
        `방 ${res.roomsDeleted}개, 기록 ${res.matchesDeleted}건 정리`,
        "success",
      );
      setPreview(res.remaining);
    } catch (error: any) {
      addToast(error?.response?.data?.message ?? "정리 실패", "error");
    } finally {
      setBusy(false);
    }
  };

  if (!preview)
    return (
      <div className="flex justify-center py-20">
        <LoadingSpinner />
      </div>
    );

  const nothing =
    (rooms ? preview.rooms : 0) + (matches ? preview.matches : 0) === 0;

  return (
    <div className="space-y-4">
      {dialog}
      <div>
        <h2 className="text-lg font-semibold text-text-primary">봇 정리</h2>
        <p className="mt-0.5 text-xs text-text-tertiary">
          테스트 봇이 남긴 방과 기록을 정리합니다. 봇 계정은 지우지 않습니다.
        </p>
      </div>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Bot className="h-4 w-4 text-accent-primary" />
            정리 대상
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="flex items-start gap-3 text-sm text-text-primary">
            <input
              type="checkbox"
              checked={rooms}
              onChange={(e) => setRooms(e.target.checked)}
              className="mt-1"
            />
            <span>
              봇이 연 방 <b className="tabular-nums">{preview.rooms}</b>개
              <span className="block text-xs text-text-tertiary">
                지금 열려 있는 방. 참가자는 방에서 제거됩니다.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-3 text-sm text-text-primary">
            <input
              type="checkbox"
              checked={matches}
              onChange={(e) => setMatches(e.target.checked)}
              className="mt-1"
            />
            <span>
              봇끼리만 한 내전 기록{" "}
              <b className="tabular-nums">{preview.matches}</b>건
              <span className="block text-xs text-text-tertiary">
                참가자가 전부 봇인 끝난 경기. 사람이 섞인 기록은 건드리지
                않습니다.
              </span>
            </span>
          </label>
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="danger"
              disabled={busy || nothing || (!rooms && !matches)}
              onClick={run}
            >
              {busy ? "정리 중…" : "선택한 항목 정리"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
