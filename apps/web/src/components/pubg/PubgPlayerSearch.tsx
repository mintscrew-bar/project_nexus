"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Lock } from "lucide-react";
import { PUBG_PLATFORM_LABELS } from "@nexus/types";
import { pubgApi, type PubgPlayerSearchResult } from "@/lib/api-client";
import {
  Avatar,
  Badge,
  Card,
  CardContent,
  LoadingSpinner,
} from "@/components/ui";

const MIN_QUERY_LENGTH = 2;
/** 입력이 멈춘 뒤 이만큼 기다렸다가 조회한다 — 글자마다 부르지 않는다 */
const DEBOUNCE_MS = 350;

/** 입력이 잠깐 멈춘 값만 돌려준다 */
function useDebounced(value: string, ms: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

/**
 * 배그 내전 기록 검색.
 *
 * 닉네임 또는 PUBG 닉네임으로 NEXUS 유저를 찾는다. PUBG 공식 전적이 아니라 이 사이트에서
 * 치른 스크림·킬내기 기록의 주인을 찾는 것이다(PUBG API 로는 남의 내전 기록을 찾을 수 없다).
 */
export function PubgPlayerSearch({
  onSelect,
}: {
  onSelect: (result: PubgPlayerSearchResult) => void;
}) {
  const [input, setInput] = useState("");
  const query = useDebounced(input.trim(), DEBOUNCE_MS);
  const enabled = query.length >= MIN_QUERY_LENGTH;

  const { data, isFetching, isError } = useQuery({
    queryKey: ["pubgSearch", query],
    queryFn: () => pubgApi.searchPlayers(query),
    enabled,
    staleTime: 60 * 1000,
  });

  const typed = input.trim().length;
  const showHint = typed > 0 && typed < MIN_QUERY_LENGTH;
  // 입력 직후(디바운스 대기 중)에는 이전 결과를 보여주지 않는다.
  const waiting = typed >= MIN_QUERY_LENGTH && input.trim() !== query;

  const results = enabled && !waiting ? (data ?? []) : [];

  // 고르면 목록을 접는다 — 남아 있으면 고른 사람의 기록이 아래로 밀린다.
  const pick = (result: PubgPlayerSearchResult) => {
    setInput("");
    onSelect(result);
  };

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <label className="relative block">
          <span className="sr-only">닉네임 또는 PUBG 닉네임</span>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary"
            aria-hidden
          />
          <input
            type="search"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setInput("");
              if (
                event.key === "Enter" &&
                results[0] &&
                !results[0].historyHidden
              ) {
                pick(results[0]);
              }
            }}
            placeholder="닉네임 또는 PUBG 닉네임으로 내전 기록 검색"
            maxLength={30}
            autoComplete="off"
            className="h-11 w-full rounded-lg border border-bg-tertiary bg-bg-primary pl-10 pr-3 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent-primary focus:outline-none"
          />
        </label>

        {showHint && (
          <p className="text-xs text-text-tertiary">
            {MIN_QUERY_LENGTH}자 이상 입력해주세요.
          </p>
        )}

        {enabled && (isFetching || waiting) && (
          <div className="flex justify-center py-3">
            <LoadingSpinner />
          </div>
        )}

        {enabled && !isFetching && !waiting && isError && (
          <p className="text-sm text-accent-danger">
            검색에 실패했습니다. 잠시 후 다시 시도해주세요.
          </p>
        )}

        {enabled &&
          !isFetching &&
          !waiting &&
          !isError &&
          results.length === 0 && (
            <p className="py-2 text-sm text-text-secondary">
              검색 결과가 없습니다. NEXUS에 PUBG 계정을 등록한 유저만 찾을 수
              있습니다.
            </p>
          )}

        {results.length > 0 && !waiting && (
          <ul className="divide-y divide-bg-tertiary overflow-hidden rounded-lg border border-bg-tertiary">
            {results.map((result) => (
              <li key={result.userId}>
                <button
                  type="button"
                  disabled={result.historyHidden}
                  onClick={() => pick(result)}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-bg-tertiary/60 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent"
                >
                  <Avatar
                    src={result.avatar}
                    alt={result.username}
                    fallback={result.username[0]}
                    size="md"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-text-primary">
                      {result.username}
                    </span>
                    <span className="block truncate text-xs text-text-secondary">
                      {result.pubgAccount
                        ? `${result.pubgAccount.platform ? PUBG_PLATFORM_LABELS[result.pubgAccount.platform].short : "플랫폼 미확인"} · ${result.pubgAccount.playerName}`
                        : "PUBG 계정 비공개"}
                    </span>
                  </span>
                  {result.pubgAccount?.nexusTier && (
                    <Badge variant="primary">
                      NEXUS {result.pubgAccount.nexusTier}티어
                    </Badge>
                  )}
                  {result.historyHidden && (
                    <span className="flex items-center gap-1 text-xs text-text-tertiary">
                      <Lock className="h-3.5 w-3.5" aria-hidden />
                      전적 비공개
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
