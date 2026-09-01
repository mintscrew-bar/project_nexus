"use client";

import { useCallback, useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { adminApi } from "@/lib/api-client";
import { Button, Card, CardContent, LoadingSpinner } from "@/components/ui";
import { Pagination } from "../shared";

interface ClientErrorLog {
  id: string;
  message: string;
  path: string | null;
  source: string | null;
  userAgent: string | null;
  createdAt: string;
  user: { id: string; username: string; role: string } | null;
}

export function ErrorLogsTab() {
  const [logs, setLogs] = useState<ClientErrorLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(true);
  const limit = 50;

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminApi.getErrorLogs({
        page,
        limit,
        search: search || undefined,
      });
      setLogs(data.logs ?? []);
      setTotal(data.total ?? 0);
    } catch {
      setLogs([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    void fetchLogs();
  }, [fetchLogs]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">오류 로그</h2>
          <p className="mt-1 text-xs text-text-muted">
            사용자 화면에서 숨긴 클라이언트 오류 원문입니다.
          </p>
        </div>
        <span className="text-xs text-text-muted">
          총 {total.toLocaleString()}건
        </span>
      </div>

      <form
        className="flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setSearch(searchInput);
          setPage(1);
        }}
      >
        <input
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="메시지, 경로, 사용자 검색..."
          className="w-64 rounded-lg bg-bg-tertiary px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
        />
        <Button type="submit" size="sm" variant="outline" aria-label="검색">
          <Search className="h-4 w-4" />
        </Button>
        {search && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setSearch("");
              setSearchInput("");
              setPage(1);
            }}
          >
            <X className="mr-1 h-4 w-4" /> 초기화
          </Button>
        )}
      </form>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12">
              <LoadingSpinner />
            </div>
          ) : logs.length === 0 ? (
            <p className="py-12 text-center text-text-muted">
              기록된 오류가 없습니다.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[840px] text-sm">
                <thead>
                  <tr className="border-b border-bg-tertiary text-left text-text-muted">
                    <th className="w-40 px-4 py-3 font-medium">시간</th>
                    <th className="w-36 px-4 py-3 font-medium">사용자</th>
                    <th className="w-52 px-4 py-3 font-medium">경로</th>
                    <th className="px-4 py-3 font-medium">오류 원문</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr
                      key={log.id}
                      className="border-b border-bg-tertiary/60 align-top"
                    >
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-text-muted">
                        {new Date(log.createdAt).toLocaleString("ko-KR")}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {log.user?.username ?? "비로그인"}
                      </td>
                      <td className="break-all px-4 py-3 font-mono text-xs text-accent-primary">
                        {log.path ?? "-"}
                      </td>
                      <td className="break-words px-4 py-3 text-text-primary">
                        {log.message}
                        {log.source && (
                          <span className="ml-2 rounded bg-bg-tertiary px-1.5 py-0.5 text-[10px] text-text-muted">
                            {log.source}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Pagination
        page={page}
        totalPages={Math.ceil(total / limit)}
        onChange={setPage}
      />
    </div>
  );
}
