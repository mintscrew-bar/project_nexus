"use client";

import { useEffect, useState } from "react";
import { adminApi, type AdminRoomFunnel } from "@/lib/api-client";
import type { GameTitle } from "@nexus/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { Filter } from "lucide-react";

const DAY_OPTIONS = [7, 30, 90];

/**
 * 방 깔때기. 생성 → 시작 → 결과.
 *
 * 방은 끝나면 지워지므로 기록이 쌓이기 시작한 시점부터만 센다. 기간을 못 채운
 * 상태에서 비율만 보여 주면 "방이 적다" 로 오해하니 첫 기록 시각을 같이 적는다.
 */
export function RoomFunnelCard({ game }: { game: GameTitle }) {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<AdminRoomFunnel | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setFailed(false);
    adminApi
      .getRoomFunnel({ gameTitle: game, days })
      .then((res) => !cancelled && setData(res))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [game, days]);

  const pct = (n: number, base: number) =>
    base === 0 ? "-" : `${Math.round((n / base) * 100)}%`;

  const steps = data
    ? [
        { label: "방 생성", value: data.created },
        { label: "시작", value: data.started },
        { label: "결과 기록", value: data.withResult },
      ]
    : [];

  const partial =
    data?.firstRecordAt &&
    new Date(data.firstRecordAt).getTime() > new Date(data.since).getTime();

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Filter className="h-4 w-4 text-accent-primary" />방 깔때기
          </CardTitle>
          <div className="flex gap-1">
            {DAY_OPTIONS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDays(d)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                  days === d
                    ? "bg-accent-primary text-accent-on"
                    : "bg-bg-tertiary text-text-secondary hover:text-text-primary"
                }`}
              >
                {d}일
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {failed && (
          <p className="text-sm text-text-tertiary">
            깔때기를 불러오지 못했습니다.
          </p>
        )}
        {!data && !failed && (
          <p className="text-sm text-text-tertiary">불러오는 중…</p>
        )}
        {data && data.created === 0 && (
          <p className="text-sm text-text-tertiary">
            이 기간에 기록된 방이 없습니다.
            {!data.firstRecordAt && " 방이 끝나 지워질 때부터 기록이 쌓입니다."}
          </p>
        )}
        {data && data.created > 0 && (
          <>
            <div className="space-y-2">
              {steps.map((step) => (
                <div key={step.label}>
                  <div className="flex justify-between text-xs">
                    <span className="text-text-secondary">{step.label}</span>
                    <span className="tabular-nums text-text-primary">
                      {step.value.toLocaleString()}
                      <span className="ml-1 text-text-muted">
                        ({pct(step.value, data.created)})
                      </span>
                    </span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-bg-tertiary">
                    <div
                      className="h-2 rounded-full bg-accent-primary"
                      style={{
                        width: `${Math.max(2, (step.value / data.created) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <dl className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
              <Item
                label="시작까지 대기(중앙값)"
                value={
                  data.medianWaitMinutes === null
                    ? "-"
                    : `${data.medianWaitMinutes}분`
                }
              />
              <Item
                label="시작한 방 평균 인원"
                value={
                  data.avgHumansInStarted === null
                    ? "-"
                    : `${data.avgHumansInStarted}명`
                }
              />
              <Item
                label="빈 방으로 종료"
                value={`${data.emptied.toLocaleString()} (${pct(data.emptied, data.created)})`}
              />
              <Item
                label="정원 찬 채 종료"
                value={`${data.fullAtEnd.toLocaleString()} (${pct(data.fullAtEnd, data.created)})`}
              />
            </dl>
          </>
        )}
        {data && (
          <p className="text-[11px] text-text-muted">
            봇이 연 방 {data.excludedBotRooms.toLocaleString()}개는 뺐습니다.
            {partial &&
              ` 기록은 ${new Date(data.firstRecordAt!).toLocaleDateString("ko-KR")}부터 쌓였습니다.`}
            {data.truncated && " 방이 많아 최근 5,000개까지만 집계했습니다."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-bg-tertiary/60 p-2.5">
      <dt className="text-text-muted">{label}</dt>
      <dd className="mt-0.5 font-semibold tabular-nums text-text-primary">
        {value}
      </dd>
    </div>
  );
}
