"use client";

import Image from "next/image";
import Link from "next/link";
import { getChampionIconById } from "@/components/matches/match-utils";
import { formatRate } from "@/lib/lab-format";
import { Badge } from "@/components/ui";
import { LabEmptyState } from "@/components/lab/shared/LabEmptyState";
import { Download } from "lucide-react";

interface TieredChampion {
  championId: number;
  championName: string;
  championNameKorean: string;
  games: number;
  winRate: number;
  wilsonLower: number;
  pickRate: number;
  banRate: number;
  confidenceLevel: "high" | "moderate" | "low" | "insufficient";
  tier: string;
}

interface Props {
  rows: TieredChampion[];
  activePeriod: string;
}

/** 현재 행 목록을 CSV로 내보내기 */
function downloadCsv(rows: TieredChampion[], period: string) {
  const header = ["티어", "챔피언(한글)", "챔피언(영문)", "게임", "승률", "픽률", "밴률"].join(",");
  const body = rows
    .map((r) =>
      [
        r.tier,
        r.championNameKorean,
        r.championName,
        r.games,
        (r.winRate * 100).toFixed(1) + "%",
        r.pickRate.toFixed(2) + "%",
        r.banRate.toFixed(2) + "%",
      ].join(","),
    )
    .join("\n");
  const csv = "\uFEFF" + header + "\n" + body; // BOM 추가 (Excel 한글 깨짐 방지)
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `champion-stats-${period}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function ChampionListTable({ rows, activePeriod }: Props) {
  if (rows.length === 0) {
    return <LabEmptyState level="insufficient" section="챔피언 목록" className="mt-4" />;
  }

  return (
    <>
      {/* 다운로드 버튼 */}
      <div className="mb-2 flex justify-end">
        <button
          type="button"
          onClick={() => downloadCsv(rows, activePeriod)}
          className="flex items-center gap-1.5 rounded-lg bg-bg-primary/60 px-2.5 py-1.5 text-xs text-text-secondary transition-colors hover:bg-bg-elevated hover:text-text-primary"
        >
          <Download className="h-3 w-3" />
          CSV 다운로드
        </button>
      </div>

      {/* 데스크톱 테이블 */}
      <div className="hidden overflow-x-auto rounded-xl border border-white/10 md:block">
        <table className="min-w-full text-sm">
          <thead className="bg-bg-primary/70 text-text-tertiary">
            <tr>
              <th className="px-3 py-2 text-left">챔피언</th>
              <th className="px-3 py-2 text-right">티어</th>
              <th className="px-3 py-2 text-right">게임</th>
              <th className="px-3 py-2 text-right">승률</th>
              <th className="px-3 py-2 text-right">픽률</th>
              <th className="px-3 py-2 text-right">밴률</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.championId}
                className={`border-t border-white/10 bg-bg-secondary/40 transition-colors hover:bg-bg-elevated/60 ${
                  row.confidenceLevel === "low" ? "opacity-80" : ""
                }`}
              >
                <td className="px-3 py-2">
                  <Link
                    href={`/lab/champions/${row.championId}?period=${activePeriod}`}
                    className="flex items-center gap-2 text-left"
                  >
                    <div className="relative h-8 w-8 overflow-hidden rounded-lg border border-white/10">
                      <Image
                        src={getChampionIconById(row.championId)}
                        alt={row.championNameKorean}
                        fill
                        className="object-cover"
                        unoptimized
                      />
                    </div>
                    <span className="text-text-primary hover:text-accent-primary">
                      {row.championNameKorean}
                    </span>
                  </Link>
                </td>
                <td className="px-3 py-2 text-right">
                  <Badge variant={row.tier === "S" ? "success" : row.tier === "A" ? "default" : "secondary"}>
                    {row.tier}
                  </Badge>
                </td>
                <td className="px-3 py-2 text-right text-text-secondary">{row.games}</td>
                <td className="px-3 py-2 text-right text-text-secondary">{formatRate(row.winRate)}</td>
                <td className="px-3 py-2 text-right text-text-secondary">{row.pickRate.toFixed(2)}%</td>
                <td className="px-3 py-2 text-right text-text-secondary">{row.banRate.toFixed(2)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 모바일 카드 */}
      <div className="grid grid-cols-2 gap-3 md:hidden">
        {rows.map((row) => (
          <Link
            key={row.championId}
            href={`/lab/champions/${row.championId}?period=${activePeriod}`}
            className={`rounded-xl border border-white/10 bg-bg-secondary/40 p-3 transition-colors hover:bg-bg-elevated/60 ${
              row.confidenceLevel === "low" ? "opacity-80" : ""
            }`}
          >
            <div className="flex items-center gap-2">
              <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-white/10">
                <Image
                  src={getChampionIconById(row.championId)}
                  alt={row.championNameKorean}
                  fill
                  className="object-cover"
                  unoptimized
                />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-text-primary">{row.championNameKorean}</p>
                <Badge
                  variant={row.tier === "S" ? "success" : row.tier === "A" ? "default" : "secondary"}
                  className="mt-0.5 text-xs"
                >
                  {row.tier}
                </Badge>
              </div>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1 text-xs text-text-tertiary">
              <div>
                <p>승률</p>
                <p className="font-semibold text-text-secondary">{formatRate(row.winRate)}</p>
              </div>
              <div>
                <p>픽률</p>
                <p className="font-semibold text-text-secondary">{row.pickRate.toFixed(1)}%</p>
              </div>
              <div>
                <p>게임</p>
                <p className="font-semibold text-text-secondary">{row.games}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
