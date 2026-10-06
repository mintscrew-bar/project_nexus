"use client";

import { useCallback, useEffect, useState } from "react";
import { adminApi, type AdminAuditLogItem } from "@/lib/api-client";
import { Badge, Card, CardContent, LoadingSpinner } from "@/components/ui";
import { Pagination, type AddToast } from "../shared";

/** 관리 작업 이름. 새 액션이 생기면 여기에도 넣는다 — 없으면 원문이 그대로 보인다. */
const ACTION_LABEL: Record<string, string> = {
  USER_ROLE_CHANGE: "권한 변경",
  USER_BAN: "유저 정지",
  USER_UNBAN: "정지 해제",
  USER_RESTRICT: "이용 제한",
  USER_UNRESTRICT: "제한 해제",
  REPORT_REVIEW: "신고 처리",
  POST_DELETE: "글 삭제",
  POST_PIN: "글 고정",
  COMMENT_DELETE: "댓글 삭제",
  CLAN_DELETE: "클랜 삭제",
  ROOM_CLOSE: "방 폐쇄",
  ROOM_ADD_BOT: "방에 봇 추가",
  ANNOUNCEMENT_SEND: "공지 발송",
  APPEAL_APPROVE: "이의신청 승인",
  APPEAL_REJECT: "이의신청 거절",
  DISCORD_GUILD_LINK: "디스코드 연동",
  SCRIM_ROUND_RESET: "스크림 라운드 초기화",
  SCRIM_COLLECT_RETRY: "스크림 수집 재시도",
  SCRIM_CANCEL: "스크림 취소",
  MATCH_COLLECT_RETRY: "내전 수집 재시도",
};

const TARGET_LABEL: Record<string, string> = {
  user: "유저",
  room: "방",
  post: "글",
  comment: "댓글",
  clan: "클랜",
  scrim: "스크림",
  match: "내전",
  report: "신고",
  appeal: "이의신청",
};

const DAY_RANGES = [
  { label: "전체", days: 0 },
  { label: "24시간", days: 1 },
  { label: "7일", days: 7 },
  { label: "30일", days: 30 },
];

/**
 * 관리 기록. 누가 언제 무엇을 했는지 본다. ADMIN 전용.
 * 기록은 서버가 조치할 때 남기므로 여기서는 읽기만 한다.
 */
export function AuditLogsTab({ addToast }: { addToast: AddToast }) {
  const [logs, setLogs] = useState<AdminAuditLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("");
  const [rangeDays, setRangeDays] = useState(7);
  const [open, setOpen] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const limit = 50;
  const totalPages = Math.ceil(total / limit);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminApi.getAuditLogs({
        page,
        limit,
        action: action || undefined,
        from: rangeDays
          ? new Date(Date.now() - rangeDays * 86_400_000).toISOString()
          : undefined,
      });
      setLogs(data.logs);
      setTotal(data.total);
    } catch {
      addToast("관리 기록 로드 실패", "error");
    } finally {
      setLoading(false);
    }
  }, [page, action, rangeDays, addToast]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">관리 기록</h2>
        <p className="mt-0.5 text-xs text-text-tertiary">
          관리자·매니저가 한 조치의 기록입니다. 총 {total.toLocaleString()}건
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={action}
          onChange={(e) => {
            setPage(1);
            setAction(e.target.value);
          }}
          aria-label="작업 종류"
          className="rounded-lg border border-bg-tertiary bg-bg-secondary px-3 py-1.5 text-xs text-text-primary"
        >
          <option value="">모든 작업</option>
          {Object.entries(ACTION_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <div className="flex gap-1">
          {DAY_RANGES.map((r) => (
            <button
              key={r.label}
              type="button"
              onClick={() => {
                setPage(1);
                setRangeDays(r.days);
              }}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                rangeDays === r.days
                  ? "bg-accent-primary text-accent-on"
                  : "bg-bg-tertiary text-text-secondary hover:text-text-primary"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : logs.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-text-tertiary">
            해당하는 기록이 없습니다.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-1.5">
          {logs.map((log) => {
            const expanded = open === log.id;
            return (
              <Card key={log.id}>
                <CardContent className="py-2.5">
                  <button
                    type="button"
                    className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 text-left"
                    onClick={() => setOpen(expanded ? null : log.id)}
                    aria-expanded={expanded}
                  >
                    <Badge variant="secondary">
                      {ACTION_LABEL[log.action] ?? log.action}
                    </Badge>
                    <span className="text-sm text-text-primary">
                      {log.admin.username}
                    </span>
                    {log.targetType && (
                      <span className="text-xs text-text-tertiary">
                        {TARGET_LABEL[log.targetType] ?? log.targetType}
                        {log.targetId && ` · ${log.targetId.slice(0, 8)}`}
                      </span>
                    )}
                    <span className="ml-auto text-xs tabular-nums text-text-muted">
                      {new Date(log.createdAt).toLocaleString("ko-KR")}
                    </span>
                  </button>
                  {expanded && (
                    <div className="mt-2 space-y-1 rounded-lg bg-bg-tertiary/60 p-2.5 text-xs">
                      {log.targetId && (
                        <p className="break-all text-text-secondary">
                          대상 ID: {log.targetId}
                        </p>
                      )}
                      {log.details ? (
                        <pre className="whitespace-pre-wrap break-all text-text-secondary">
                          {JSON.stringify(log.details, null, 2)}
                        </pre>
                      ) : (
                        <p className="text-text-muted">상세 내용 없음</p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Pagination page={page} totalPages={totalPages} onChange={setPage} />
    </div>
  );
}
