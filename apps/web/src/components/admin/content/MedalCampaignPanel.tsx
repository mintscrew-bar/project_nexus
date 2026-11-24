"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Gift, Search } from "lucide-react";
import { Button, Card, CardContent } from "@/components/ui";
import {
  adminMedalApi,
  type MedalCampaignInput,
  type MedalCampaignPreview,
} from "@/lib/api-client";
import { getApiErrorMessage } from "@/lib/utils";
import { MEDAL_LABEL } from "@/components/cosmetics/catalog";
import type { AddToast } from "../shared";
import type { useConfirm } from "../ConfirmDialog";

const inputCls =
  "mt-1 w-full rounded-lg bg-bg-tertiary px-3 py-2 text-sm text-text-primary focus:outline-none";

/** 오늘 날짜로 기본 이름표 — 같은 날 두 번 만들 땐 바꿔 쓴다 */
const defaultKey = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `reward-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/**
 * 일괄 보상 지급 (2026-11-20) — 가입한 모든 유저(정지·테스트 봇 제외)에게
 * 기본 메달 + 완주한 내전 수에 비례한 메달을 한 번에 준다.
 *
 * 먼저 미리보기로 몇 명·총 얼마·가장 많이 받는 사람을 보고, 확인한 뒤 보낸다.
 * 이름표가 원장 키에 들어가서 같은 이름표로 다시 보내도 이미 받은 사람은 건너뛴다
 * (중간에 끊겼으면 같은 설정으로 다시 누르면 못 받은 사람만 마저 받는다).
 */
export function MedalCampaignPanel({
  addToast,
  confirm,
}: {
  addToast: AddToast;
  confirm: ReturnType<typeof useConfirm>["confirm"];
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    key: defaultKey(),
    title: "",
    base: "300",
    perMatch: "20",
    matchCap: "30",
    notify: true,
  });
  const [preview, setPreview] = useState<MedalCampaignPreview | null>(null);
  // 설정을 바꾸면 예전 미리보기는 지운다 — 본 숫자와 실제로 나가는 숫자가 어긋나지 않게
  const set = (patch: Partial<typeof form>) => {
    setForm((f) => ({ ...f, ...patch }));
    setPreview(null);
  };
  const body = (): MedalCampaignInput => ({
    key: form.key.trim(),
    title: form.title.trim(),
    base: Math.round(Number(form.base) || 0),
    perMatch: Math.round(Number(form.perMatch) || 0),
    matchCap: Math.round(Number(form.matchCap) || 0),
    notify: form.notify,
  });

  const check = useMutation({
    mutationFn: () => adminMedalApi.campaignPreview(body()),
    onSuccess: setPreview,
    onError: (e) =>
      addToast(getApiErrorMessage(e, "미리보기를 못 했어요."), "error"),
  });
  const run = useMutation({
    mutationFn: () => adminMedalApi.campaignRun(body()),
    onSuccess: (r) => {
      addToast(
        `${r.granted.toLocaleString()}명에게 ${r.total.toLocaleString()} ${MEDAL_LABEL}을 보냈어요` +
          (r.skipped ? ` (이미 받은 ${r.skipped}명 건너뜀)` : "") +
          (r.failed
            ? ` · 실패 ${r.failed}명 — 같은 설정으로 다시 누르세요`
            : ""),
        r.failed ? "error" : "success",
      );
      setPreview(null);
      void queryClient.invalidateQueries({ queryKey: ["admin-medal"] });
      void queryClient.invalidateQueries({ queryKey: ["medals"] });
    },
    onError: (e) =>
      addToast(getApiErrorMessage(e, "보내지 못했어요."), "error"),
  });

  const b = body();
  const ready = Boolean(b.key && b.title && (b.base > 0 || b.perMatch > 0));

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold text-text-primary">
            <Gift className="h-4 w-4 text-amber-300" />
            일괄 보상 지급
          </h3>
          <p className="mt-1 text-xs text-text-tertiary">
            가입한 모든 유저(정지·테스트 봇 제외)에게{" "}
            <b>기본 + 완주한 내전 수 × 판당</b>만큼 줍니다. 판 수는 상한까지만
            쳐 줍니다. 일일 상한은 적용되지 않아요.
          </p>
          <p className="mt-1 text-xs text-text-tertiary">
            완주한 내전은 <b>메달 출시 전 경기까지</b> 경기 기록에서 셉니다 —
            끝난 내전 중 15분 이상, 참가자 80% 이상이 사람인 판만 치고, 무효
            처리한 판은 뺍니다.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="block">
            <span className="text-xs text-text-muted">
              받는 사람에게 보일 제목
            </span>
            <input
              value={form.title}
              onChange={(e) => set({ title: e.target.value })}
              maxLength={60}
              placeholder="예: 메달 상점 오픈 감사 보상"
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="text-xs text-text-muted">
              이름표 (같은 이름표는 한 사람에게 한 번만)
            </span>
            <input
              value={form.key}
              onChange={(e) => set({ key: e.target.value.toLowerCase() })}
              maxLength={40}
              className={`${inputCls} font-mono`}
            />
          </label>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {(
            [
              ["base", "기본 (모두에게)"],
              ["perMatch", "완주 1판당"],
              ["matchCap", "판 수 상한"],
            ] as const
          ).map(([k, label]) => (
            <label key={k} className="block">
              <span className="text-xs text-text-muted">{label}</span>
              <input
                type="number"
                min={0}
                value={form[k]}
                onChange={(e) => set({ [k]: e.target.value })}
                className={`${inputCls} tabular-nums`}
              />
            </label>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-text-secondary">
          <input
            type="checkbox"
            checked={form.notify}
            onChange={(e) => set({ notify: e.target.checked })}
          />
          받은 사람에게 알림 보내기
        </label>

        {preview && (
          <div className="space-y-2 rounded-lg bg-bg-tertiary/50 p-3 text-xs">
            <p className="text-sm text-text-primary">
              <b>{preview.users.toLocaleString()}명</b>에게 총{" "}
              <b className="text-amber-300">
                {preview.total.toLocaleString()} {MEDAL_LABEL}
              </b>
              <span className="ml-2 text-xs text-text-muted">
                한 사람 {preview.min.toLocaleString()} ~{" "}
                {preview.max.toLocaleString()} · 내전 해 본 사람{" "}
                {preview.activeUsers}명
              </span>
            </p>
            {/* 어디서 얼마가 나가는지 — 기본 몫과 판당 몫을 나눠 본다 */}
            <p className="text-text-secondary">
              기본{" "}
              <b className="tabular-nums text-text-primary">
                {preview.baseTotal.toLocaleString()}
              </b>{" "}
              + 판당{" "}
              <b className="tabular-nums text-text-primary">
                {preview.perMatchTotal.toLocaleString()}
              </b>
              <span className="ml-2 text-text-muted">
                완주 {preview.countedMatches.toLocaleString()}판을 셈
                {preview.cappedUsers > 0 &&
                  ` · 상한 ${form.matchCap}판에 걸린 사람 ${preview.cappedUsers}명`}
              </span>
            </p>
            {preview.activeUsers === 0 && Number(form.perMatch) > 0 && (
              <p className="text-amber-300">
                완주한 내전이 있는 사람이 없어 판당 몫이 0이에요 — 경기 기록을
                확인해 주세요.
              </p>
            )}
            {preview.alreadyGranted > 0 && (
              <p className="text-amber-300">
                이 이름표로 이미 {preview.alreadyGranted}명이 받았어요 — 그
                사람들은 건너뜁니다.
              </p>
            )}
            <RecipientList
              recipients={preview.recipients}
              matchCap={Number(form.matchCap) || 0}
              base={Number(form.base) || 0}
            />
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={!ready || check.isPending}
            onClick={() => check.mutate()}
          >
            미리보기
          </Button>
          <Button
            size="sm"
            disabled={!preview || run.isPending}
            onClick={async () => {
              if (
                !preview ||
                !(await confirm({
                  title: "일괄 보상 지급",
                  message: (
                    <>
                      {preview.users.toLocaleString()}명에게 총{" "}
                      {preview.total.toLocaleString()} {MEDAL_LABEL}을 보냅니다.
                      원장에 남고 되돌리려면 한 사람씩 회수해야 해요.
                    </>
                  ),
                  confirmLabel: "보내기",
                }))
              )
                return;
              run.mutate();
            }}
          >
            {run.isPending ? "보내는 중…" : "보내기"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

type Recipient = MedalCampaignPreview["recipients"][number];
type SortKey = "amount" | "matches" | "name";
type FilterKey = "all" | "active" | "capped" | "baseOnly";

/**
 * 받는 사람 전체 목록 — 미리보기에서 상위 몇 명만 보이면 나머지가 제대로 받는지 알 수 없다.
 * 이름 검색, 정렬(받는 양·판 수·이름), 걸러 보기(내전 해 본 사람·상한에 걸린 사람·기본만 받는 사람).
 * 가입자 수백 명 규모라 전부 받아 화면에서 거른다. 칸은 높이를 정해 두고 안에서 스크롤한다.
 */
function RecipientList({
  recipients,
  matchCap,
  base,
}: {
  recipients: Recipient[];
  matchCap: number;
  base: number;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("amount");
  const [filter, setFilter] = useState<FilterKey>("all");

  // 걸러 보기 칩마다 몇 명인지 — 누르기 전에 규모를 알 수 있게
  const counts = useMemo(
    () => ({
      all: recipients.length,
      active: recipients.filter((r) => r.matches > 0).length,
      capped: recipients.filter((r) => r.matches > matchCap).length,
      baseOnly: recipients.filter((r) => r.matches === 0).length,
    }),
    [recipients, matchCap],
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = recipients.filter((r) => {
      if (q && !r.username.toLowerCase().includes(q)) return false;
      if (filter === "active") return r.matches > 0;
      if (filter === "capped") return r.matches > matchCap;
      if (filter === "baseOnly") return r.matches === 0;
      return true;
    });
    const sorted = [...filtered];
    if (sort === "matches")
      sorted.sort((a, b) => b.matches - a.matches || b.amount - a.amount);
    else if (sort === "name")
      sorted.sort((a, b) => a.username.localeCompare(b.username, "ko"));
    else sorted.sort((a, b) => b.amount - a.amount || b.matches - a.matches);
    return sorted;
  }, [recipients, query, sort, filter, matchCap]);

  const chips: [FilterKey, string][] = [
    ["all", "전체"],
    ["active", "내전 해 본 사람"],
    ["capped", "상한 걸린 사람"],
    ["baseOnly", "기본만 받는 사람"],
  ];

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="닉네임 찾기"
            className="w-40 rounded-md bg-bg-secondary py-1 pl-7 pr-2 text-xs text-text-primary focus:outline-none"
          />
        </label>
        {chips.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
              filter === key
                ? "bg-accent-primary/20 text-accent-primary"
                : "bg-bg-secondary text-text-secondary hover:text-text-primary"
            }`}
          >
            {label}{" "}
            <span className="tabular-nums opacity-70">{counts[key]}</span>
          </button>
        ))}
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="ml-auto rounded-md bg-bg-secondary px-2 py-1 text-xs text-text-primary focus:outline-none"
          aria-label="정렬"
        >
          <option value="amount">받는 양 많은 순</option>
          <option value="matches">완주 판 수 많은 순</option>
          <option value="name">닉네임 순</option>
        </select>
      </div>

      <div className="max-h-80 overflow-y-auto rounded-md bg-bg-secondary">
        <table className="w-full table-fixed text-xs">
          <thead className="sticky top-0 bg-bg-secondary text-text-muted">
            <tr>
              <th className="w-1/2 px-3 py-1.5 text-left font-normal">
                닉네임
              </th>
              <th className="w-1/4 px-3 py-1.5 text-right font-normal">완주</th>
              <th className="w-1/4 px-3 py-1.5 text-right font-normal">
                받는 양 (기본 {base.toLocaleString()} 포함)
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.userId} className="border-t border-bg-tertiary/60">
                <td className="max-w-0 truncate px-3 py-1 text-text-secondary">
                  {r.username}
                </td>
                <td className="whitespace-nowrap px-3 py-1 text-right tabular-nums text-text-secondary">
                  {r.matches}판
                  {r.matches > matchCap && (
                    <span className="text-text-muted"> ({matchCap}판까지)</span>
                  )}
                </td>
                <td className="px-3 py-1 text-right font-semibold tabular-nums text-text-primary">
                  {r.amount.toLocaleString()}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={3}
                  className="px-3 py-4 text-center text-text-muted"
                >
                  맞는 사람이 없어요.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-text-muted">
        {rows.length.toLocaleString()}명 표시 · 전체{" "}
        {recipients.length.toLocaleString()}명
      </p>
    </div>
  );
}
