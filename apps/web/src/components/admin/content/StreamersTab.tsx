"use client";

import { useCallback, useEffect, useState } from "react";
import { streamerApi, type AdminStreamerItem } from "@/lib/api-client";
import {
  Card,
  CardContent,
  Badge,
  Button,
  LoadingSpinner,
} from "@/components/ui";
import { CheckCircle, RefreshCw, Search, XCircle } from "lucide-react";
import type { AddToast } from "../shared";

const PLATFORM_LABELS: Record<string, string> = {
  CHZZK: "치지직",
  SOOP: "SOOP",
  YOUTUBE: "유튜브",
};

type VerifiedFilter = "all" | "verified" | "pending";

const FILTERS: Array<{ value: VerifiedFilter; label: string }> = [
  { value: "all", label: "전체" },
  { value: "pending", label: "인증 대기" },
  { value: "verified", label: "인증됨" },
];

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function StreamersTab({ addToast }: { addToast: AddToast }) {
  const [streamers, setStreamers] = useState<AdminStreamerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<VerifiedFilter>("all");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const fetchStreamers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await streamerApi.listForAdmin({
        verified: filter,
        search: search || undefined,
      });
      setStreamers(data);
    } catch {
      addToast("스트리머 목록 로드 실패", "error");
    } finally {
      setLoading(false);
    }
  }, [filter, search, addToast]);

  useEffect(() => {
    fetchStreamers();
  }, [fetchStreamers]);

  /** 폴링(1분 주기)을 기다리지 않고 라이브 상태를 즉시 갱신한다. */
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const result = await streamerApi.refresh();
      addToast(
        `갱신 완료 — 대상 ${result.checked}명 · 방송 중 ${result.live}명${
          result.failed > 0 ? ` · 조회 실패 ${result.failed}명` : ""
        }`,
        result.failed > 0 ? "error" : "success",
      );
      await fetchStreamers();
    } catch {
      addToast("라이브 상태 갱신 실패", "error");
    } finally {
      setRefreshing(false);
    }
  };

  const handleVerify = async (streamer: AdminStreamerItem) => {
    const next = !streamer.verifiedAt;
    if (
      next &&
      !confirm(
        `"${streamer.channelName ?? streamer.username}" 채널을 수동 인증하시겠습니까?\n` +
          `채널이 실제 이 유저의 것인지 직접 확인한 경우에만 승인해주세요.`,
      )
    ) {
      return;
    }

    try {
      await streamerApi.setVerified(streamer.id, next);
      setStreamers((prev) =>
        prev.map((s) =>
          s.id === streamer.id
            ? { ...s, verifiedAt: next ? new Date().toISOString() : null }
            : s,
        ),
      );
      addToast(next ? "인증 처리 완료" : "인증 해제 완료", "success");
    } catch {
      addToast("인증 상태 변경 실패", "error");
    }
  };

  const handleToggleActive = async (streamer: AdminStreamerItem) => {
    const next = !streamer.isActive;
    try {
      await streamerApi.setActive(streamer.id, next);
      setStreamers((prev) =>
        prev.map((s) => (s.id === streamer.id ? { ...s, isActive: next } : s)),
      );
      addToast(next ? "노출 처리 완료" : "노출 해제 완료", "success");
    } catch {
      addToast("노출 상태 변경 실패", "error");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">
            스트리머 관리
          </h2>
          <p className="mt-1 text-xs text-text-muted">
            인증된 채널만 스트리머 탭과 방 목록 LIVE 뱃지에 노출됩니다.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          <RefreshCw
            className={`mr-1.5 h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
          />
          라이브 상태 갱신
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((item) => (
          <button
            key={item.value}
            onClick={() => setFilter(item.value)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === item.value
                ? "bg-accent-primary text-white"
                : "bg-bg-tertiary text-text-secondary hover:text-text-primary"
            }`}
          >
            {item.label}
          </button>
        ))}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(searchInput.trim());
          }}
          className="ml-auto flex items-center gap-2"
        >
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="유저명 · 채널명"
              className="w-48 rounded-lg border border-bg-tertiary bg-bg-secondary py-1.5 pl-8 pr-3 text-xs text-text-primary placeholder:text-text-muted focus:border-accent-primary focus:outline-none"
            />
          </div>
          <Button type="submit" size="sm" variant="outline">
            검색
          </Button>
        </form>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-16">
              <LoadingSpinner />
            </div>
          ) : streamers.length === 0 ? (
            <p className="py-16 text-center text-sm text-text-muted">
              해당하는 스트리머가 없습니다.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] text-sm">
                <thead>
                  <tr className="border-b border-bg-tertiary text-text-muted">
                    <th className="px-4 py-3 text-left font-medium">유저</th>
                    <th className="px-4 py-3 text-left font-medium">플랫폼</th>
                    <th className="px-4 py-3 text-left font-medium">채널</th>
                    <th className="px-4 py-3 text-left font-medium">상태</th>
                    <th className="px-4 py-3 text-left font-medium">
                      마지막 방송
                    </th>
                    <th className="px-4 py-3 text-left font-medium">액션</th>
                  </tr>
                </thead>
                <tbody>
                  {streamers.map((streamer) => (
                    <tr
                      key={streamer.id}
                      className="border-b border-bg-tertiary/60 last:border-0"
                    >
                      <td className="px-4 py-3 text-text-primary">
                        {streamer.username}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {PLATFORM_LABELS[streamer.platform] ??
                          streamer.platform}
                      </td>
                      <td className="max-w-[240px] px-4 py-3">
                        <a
                          href={streamer.channelUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block truncate text-accent-primary hover:underline"
                        >
                          {streamer.channelName ?? streamer.channelUrl}
                        </a>
                        {!streamer.channelId && (
                          <span className="text-[10px] text-accent-warning">
                            채널 ID 미확인 — 인증 필요
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {streamer.verifiedAt ? (
                            <Badge variant="primary">인증됨</Badge>
                          ) : (
                            <Badge variant="secondary">대기</Badge>
                          )}
                          {!streamer.isActive && (
                            <Badge variant="danger">숨김</Badge>
                          )}
                          {streamer.isLive === true && (
                            <Badge variant="danger">LIVE</Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-text-muted">
                        {formatDateTime(streamer.lastLiveAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleVerify(streamer)}
                          >
                            {streamer.verifiedAt ? (
                              <>
                                <XCircle className="mr-1 h-3.5 w-3.5" />
                                인증 해제
                              </>
                            ) : (
                              <>
                                <CheckCircle className="mr-1 h-3.5 w-3.5" />
                                수동 인증
                              </>
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleToggleActive(streamer)}
                          >
                            {streamer.isActive ? "숨기기" : "노출"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
