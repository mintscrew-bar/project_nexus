"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowDown, ArrowUp, Download, Search, Table2 } from "lucide-react";
import { getChampionKoreanName } from "@nexus/types";
import type { StreamerParticipantRow } from "@/lib/api-client";
import { getChampionIcon } from "@/components/matches/match-utils";
import { userProfilePath } from "@/lib/profile-routes";
import { cn } from "@/lib/utils";

/*
 * 내전 참가자 통계표 (엑셀형) — 스트리머의 방송 내전에 뛴 시청자 전원.
 * 머리를 누르면 그 칸으로 정렬(한 번 더 누르면 반대로), 닉네임 검색.
 * 스트리머 본인은 CSV(엑셀) 로 내려받을 수 있다 — 시청자 이벤트·보상 정리용.
 */

const ROLE_KO: Record<string, string> = {
  TOP: "탑",
  JUNGLE: "정글",
  MID: "미드",
  ADC: "원딜",
  SUPPORT: "서폿",
};

/**
 * 줄무늬 바탕 — 반투명이면 가로로 밀 때 고정 칸(#·닉네임) 뒤로 다른 칸이 비친다.
 * 카드 바탕과 섞은 불투명 색을 쓴다.
 */
const ZEBRA =
  "bg-[color-mix(in_srgb,rgb(var(--color-bg-tertiary))_45%,rgb(var(--color-bg-secondary)))]";

/** 처음에 보이는 줄 수 — 「더 보기」로 늘린다 */
const PAGE_SIZE = 20;

type SortKey =
  | "username"
  | "games"
  | "wins"
  | "losses"
  | "winRate"
  | "score"
  | "kda"
  | "mvp"
  | "ace"
  | "commendations"
  | "sessions"
  | "firstAt"
  | "lastAt";

interface Column {
  key: SortKey | null;
  label: string;
  /** 숫자 칸은 오른쪽 정렬 */
  numeric?: boolean;
  title?: string;
}

const COLUMNS: Column[] = [
  { key: "username", label: "닉네임" },
  { key: "games", label: "판", numeric: true },
  { key: "wins", label: "승", numeric: true },
  { key: "losses", label: "패", numeric: true },
  { key: "winRate", label: "승률", numeric: true },
  {
    key: "score",
    label: "점수",
    numeric: true,
    title: "이 방송 내전만으로 다시 계산한 점수 (50에서 시작)",
  },
  {
    key: null,
    label: "평균 K/D/A",
    numeric: true,
    title: "Riot 기록이 있는 판의 평균",
  },
  { key: "kda", label: "KDA", numeric: true },
  { key: "mvp", label: "MVP", numeric: true },
  { key: "ace", label: "ACE", numeric: true },
  { key: "commendations", label: "칭찬", numeric: true },
  {
    key: "sessions",
    label: "방송",
    numeric: true,
    title: "참가한 방송 회차 수",
  },
  { key: "firstAt", label: "첫 참가" },
  { key: "lastAt", label: "마지막 참가" },
  { key: null, label: "라인" },
  { key: null, label: "챔피언" },
];

const winRate = (r: StreamerParticipantRow) =>
  r.games > 0 ? r.wins / r.games : -1;

function sortValue(r: StreamerParticipantRow, key: SortKey): number | string {
  switch (key) {
    case "username":
      return r.username;
    case "winRate":
      return winRate(r);
    case "kda":
      return r.kda ?? -1;
    case "firstAt":
    case "lastAt":
      return new Date(r[key]).getTime();
    default:
      return r[key];
  }
}

/** "2026-11-25T..." → "11/25" (올해가 아니면 "25.11/25") */
function shortDate(iso: string): string {
  const d = new Date(iso);
  const md = `${d.getMonth() + 1}/${d.getDate()}`;
  return d.getFullYear() === new Date().getFullYear()
    ? md
    : `${String(d.getFullYear()).slice(2)}.${md}`;
}

function percent(r: StreamerParticipantRow): string {
  return r.games > 0 ? `${Math.round((r.wins / r.games) * 100)}%` : "-";
}

/** CSV 한 칸 — 쉼표·따옴표·줄바꿈이 있으면 감싼다 */
function csvCell(value: string | number | null): string {
  const s = value === null ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** 엑셀에서 한글이 깨지지 않게 BOM 을 붙여 내려받는다 */
function downloadCsv(rows: StreamerParticipantRow[], streamerName: string) {
  const header = [
    "닉네임",
    "판",
    "승",
    "패",
    "승률",
    "점수",
    "평균 킬",
    "평균 데스",
    "평균 어시",
    "KDA",
    "MVP",
    "ACE",
    "받은 칭찬",
    "참가 방송",
    "첫 참가",
    "마지막 참가",
    "라인",
    "챔피언",
  ];
  const lines = rows.map((r) =>
    [
      r.username,
      r.games,
      r.wins,
      r.losses,
      percent(r),
      r.score.toFixed(1),
      r.avgKills,
      r.avgDeaths,
      r.avgAssists,
      r.kda,
      r.mvp,
      r.ace,
      r.commendations,
      r.sessions,
      r.firstAt.slice(0, 10),
      r.lastAt.slice(0, 10),
      r.roles.map((x) => `${ROLE_KO[x.role] ?? x.role} ${x.games}`).join(" / "),
      r.champions
        .map((c) => `${getChampionKoreanName(c.name)} ${c.games}`)
        .join(" / "),
    ]
      .map(csvCell)
      .join(","),
  );
  const csv = "﻿" + [header.join(","), ...lines].join("\n");
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `${streamerName}_내전참가자_${new Date()
    .toISOString()
    .slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function ParticipantsTable({
  rows,
  isOwner,
  streamerName,
}: {
  rows: StreamerParticipantRow[];
  isOwner: boolean;
  streamerName: string;
}) {
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({
    key: "games",
    desc: true,
  });
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE);

  const sorted = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? rows.filter((r) => r.username.toLowerCase().includes(q))
      : rows;
    return [...filtered].sort((a, b) => {
      const va = sortValue(a, sort.key);
      const vb = sortValue(b, sort.key);
      const cmp =
        typeof va === "string" && typeof vb === "string"
          ? va.localeCompare(vb, "ko")
          : (va as number) - (vb as number);
      // 같으면 판수 많은 순으로 고정 — 정렬을 바꿔도 줄이 들쭉날쭉하지 않게
      return (sort.desc ? -cmp : cmp) || b.games - a.games;
    });
  }, [rows, sort, query]);

  const onSort = (key: SortKey) =>
    setSort((prev) =>
      prev.key === key
        ? { key, desc: !prev.desc }
        : // 닉네임은 가나다순, 나머지는 큰 값부터
          { key, desc: key !== "username" },
    );

  if (rows.length === 0) return null;

  return (
    <div className="mt-4 rounded-xl border border-bg-tertiary bg-bg-secondary p-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="flex items-center gap-2 text-xl font-bold text-text-primary">
          <Table2 className="h-5 w-5 text-accent-primary" />
          내전 참가자 통계
          <span className="text-sm font-medium text-text-tertiary">
            {rows.length}명
          </span>
        </h2>
        <div className="ml-auto flex items-center gap-2">
          <label className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setLimit(PAGE_SIZE);
              }}
              placeholder="닉네임 검색"
              className="w-40 rounded-lg border border-bg-elevated bg-bg-tertiary py-1.5 pl-8 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-primary focus:outline-none"
            />
          </label>
          {isOwner && (
            <button
              type="button"
              onClick={() => downloadCsv(sorted, streamerName)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-bg-tertiary px-3 py-1.5 text-sm font-bold text-text-primary transition-colors hover:bg-bg-elevated"
              title="지금 보이는 정렬·검색 그대로 엑셀 파일(CSV)로 받기"
            >
              <Download className="h-4 w-4" />
              엑셀로 받기
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg">
        <table className="w-full min-w-[1080px] border-collapse text-sm tabular-nums">
          <thead>
            <tr className="bg-bg-tertiary text-xs text-text-secondary">
              <th className="sticky left-0 z-10 w-10 bg-bg-tertiary px-2 py-2.5 text-center font-bold">
                #
              </th>
              {COLUMNS.map((col) => {
                const active = col.key !== null && sort.key === col.key;
                return (
                  <th
                    key={col.label}
                    title={col.title}
                    className={cn(
                      "whitespace-nowrap px-3 py-2.5 font-bold",
                      col.numeric ? "text-right" : "text-left",
                      col.key === "username" &&
                        "sticky left-10 z-10 bg-bg-tertiary",
                    )}
                  >
                    {col.key ? (
                      <button
                        type="button"
                        onClick={() => onSort(col.key!)}
                        className={cn(
                          "inline-flex items-center gap-0.5 transition-colors hover:text-text-primary",
                          active && "text-accent-primary",
                        )}
                      >
                        {col.label}
                        {active &&
                          (sort.desc ? (
                            <ArrowDown className="h-3 w-3" />
                          ) : (
                            <ArrowUp className="h-3 w-3" />
                          ))}
                      </button>
                    ) : (
                      col.label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, limit).map((r, i) => (
              <tr
                key={r.userId}
                // 줄무늬로 줄을 가른다 — 칸 사이 세로줄 없이 엑셀처럼 읽히게
                className={cn(
                  "transition-colors hover:bg-accent-primary/[0.08]",
                  i % 2 === 1 && ZEBRA,
                )}
              >
                <td
                  className={cn(
                    "sticky left-0 px-2 py-2 text-center text-xs text-text-tertiary",
                    i % 2 === 1 ? ZEBRA : "bg-bg-secondary",
                  )}
                >
                  {i + 1}
                </td>
                <td
                  className={cn(
                    "sticky left-10 max-w-[160px] px-3 py-2",
                    i % 2 === 1 ? ZEBRA : "bg-bg-secondary",
                  )}
                >
                  <Link
                    href={userProfilePath(r.userId)}
                    className="block truncate font-bold text-text-primary hover:text-accent-primary"
                  >
                    {r.username}
                  </Link>
                </td>
                <td className="px-3 py-2 text-right font-bold text-text-primary">
                  {r.games}
                </td>
                <td className="px-3 py-2 text-right text-accent-success">
                  {r.wins}
                </td>
                <td className="px-3 py-2 text-right text-accent-danger">
                  {r.losses}
                </td>
                <td className="px-3 py-2 text-right text-text-primary">
                  {percent(r)}
                </td>
                <td className="px-3 py-2 text-right font-bold text-accent-primary">
                  {r.score.toFixed(1)}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right text-text-secondary">
                  {r.avgKills === null ? (
                    <span className="text-text-muted">-</span>
                  ) : (
                    <>
                      {r.avgKills} /{" "}
                      <span className="text-accent-danger">{r.avgDeaths}</span>{" "}
                      / {r.avgAssists}
                    </>
                  )}
                </td>
                <td
                  className={cn(
                    "px-3 py-2 text-right font-bold",
                    r.kda === null
                      ? "text-text-muted"
                      : r.kda >= 4
                        ? "text-accent-gold"
                        : r.kda >= 3
                          ? "text-accent-primary"
                          : "text-text-primary",
                  )}
                >
                  {r.kda === null ? "-" : r.kda.toFixed(2)}
                </td>
                <td className="px-3 py-2 text-right">
                  {r.mvp > 0 ? (
                    <span className="font-bold text-accent-gold">{r.mvp}</span>
                  ) : (
                    <span className="text-text-muted">0</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  {r.ace > 0 ? (
                    <span className="font-bold text-accent-primary">
                      {r.ace}
                    </span>
                  ) : (
                    <span className="text-text-muted">0</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right text-text-primary">
                  {r.commendations}
                </td>
                <td className="px-3 py-2 text-right text-text-primary">
                  {r.sessions}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-text-secondary">
                  {shortDate(r.firstAt)}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-text-secondary">
                  {shortDate(r.lastAt)}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-text-secondary">
                  {r.roles.length === 0 ? (
                    <span className="text-text-muted">-</span>
                  ) : (
                    r.roles
                      .slice(0, 2)
                      .map((x) => ROLE_KO[x.role] ?? x.role)
                      .join(" · ")
                  )}
                </td>
                <td className="px-3 py-2">
                  {r.champions.length === 0 ? (
                    <span className="text-text-muted">-</span>
                  ) : (
                    <span className="flex gap-1">
                      {r.champions.map((c) => (
                        <Image
                          key={c.name}
                          src={getChampionIcon(c.name)}
                          alt={getChampionKoreanName(c.name)}
                          title={`${getChampionKoreanName(c.name)} ${c.games}판`}
                          width={22}
                          height={22}
                          className="h-[22px] w-[22px] rounded"
                        />
                      ))}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sorted.length === 0 && (
        <p className="py-8 text-center text-sm text-text-tertiary">
          「{query}」 와 맞는 참가자가 없어요.
        </p>
      )}
      {sorted.length > limit && (
        <div className="mt-3 text-center">
          <button
            type="button"
            onClick={() => setLimit((n) => n + PAGE_SIZE)}
            className="rounded-lg bg-bg-tertiary px-4 py-2 text-sm font-bold text-text-secondary transition-colors hover:bg-bg-elevated hover:text-text-primary"
          >
            더 보기 ({sorted.length - limit}명 남음)
          </button>
        </div>
      )}
      <p className="mt-3 text-xs text-text-tertiary">
        스트리머 본인은 빼고 셉니다 · K/D/A·KDA·챔피언은 Riot 기록이 있는 판만
      </p>
    </div>
  );
}
