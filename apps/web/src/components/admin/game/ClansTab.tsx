"use client";

import { useEffect, useState } from "react";
import { adminApi } from "@/lib/api-client";
import {
  Card,
  CardContent,
  Badge,
  Button,
  LoadingSpinner,
} from "@/components/ui";
import { Search, Trash2 } from "lucide-react";
import { Pagination, type AddToast } from "../shared";
import { useAdminGameScope } from "../game-scope";
import { useConfirm } from "../ConfirmDialog";
import { useResetOn } from "@/hooks/useResetOn";
import { useQueryFieldSetter } from "@/hooks/useQuerySetter";
import { useQuery } from "@tanstack/react-query";

interface AdminClan {
  id: string;
  name: string;
  tag: string;
  createdAt: string;
  owner: { username: string };
  _count: { members: number };
}

export function ClansTab({ addToast }: { addToast: AddToast }) {
  const { confirm, dialog } = useConfirm();
  // 상단 전역 스위치가 정한 게임. 바뀌면 목록을 다시 읽는다.
  const { gameParam } = useAdminGameScope();
  /*
   * 게임이 바뀌면 첫 페이지로 돌아간다(효과 없이 — useResetOn).
   *
   * 페이지 번호는 게임마다 다른 목록에 매겨진 값이다. 롤 5페이지를 보다가
   * 배그로 바꾸면 배그에 5페이지가 없어 빈 화면이 된다.
   */
  const [page, setPage] = useResetOn(1, gameParam);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const limit = 20;

  // 서버 조회는 React Query 로 — 늦게 온 옛 응답이 새 결과를 덮지 않는 것도 키가 맡는다
  // (예전 requestId 비교를 대신한다). 삭제 직후엔 캐시를 바로 고친다(setClans).
  const clansKey = ["admin-clans", page, search, gameParam];
  const clansQuery = useQuery({
    queryKey: clansKey,
    queryFn: () =>
      adminApi.getClans({
        page,
        limit,
        search: search || undefined,
        gameTitle: gameParam,
      }) as Promise<{ clans: AdminClan[]; total: number }>,
  });
  const clans = clansQuery.data?.clans ?? [];
  const total = clansQuery.data?.total ?? 0;
  const totalPages = Math.ceil(total / limit);
  const loading = clansQuery.isLoading;
  const setClans = useQueryFieldSetter<
    { clans: AdminClan[]; total: number },
    "clans"
  >(clansKey, "clans");
  useEffect(() => {
    if (clansQuery.isError) addToast("클랜 목록 로드 실패", "error");
  }, [clansQuery.isError, addToast]);

  const handleDelete = async (clan: AdminClan) => {
    const ok = await confirm({
      title: "클랜 삭제",
      message: `"${clan.name}" 클랜을 삭제합니다. 멤버 구성과 클랜 채팅 연결이 사라지고 되돌릴 수 없습니다.`,
      confirmLabel: "삭제",
      danger: true,
      requireText: clan.name,
    });
    if (!ok) return;
    try {
      await adminApi.deleteClan(clan.id);
      setClans((prev) => prev.filter((c) => c.id !== clan.id));
      addToast("클랜 삭제 완료", "success");
    } catch {
      addToast("클랜 삭제 실패", "error");
    }
  };

  return (
    <div className="space-y-4">
      {dialog}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-text-primary">클랜 관리</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(searchInput);
            setPage(1);
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="클랜명 검색..."
            className="px-3 py-1.5 rounded-lg bg-bg-tertiary text-text-primary text-sm w-48 focus:outline-none focus:border-accent-primary"
          />
          <Button type="submit" size="sm" variant="outline">
            <Search className="h-4 w-4" />
          </Button>
        </form>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12">
              <LoadingSpinner />
            </div>
          ) : clans.length === 0 ? (
            <p className="text-center text-text-muted py-12">
              클랜이 없습니다.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-sm">
                <thead>
                  <tr className="border-b border-bg-tertiary text-text-muted">
                    <th className="text-left px-4 py-3 font-medium">클랜명</th>
                    <th className="text-left px-4 py-3 font-medium">태그</th>
                    <th className="text-left px-4 py-3 font-medium">오너</th>
                    <th className="text-left px-4 py-3 font-medium">멤버</th>
                    <th className="text-left px-4 py-3 font-medium">생성일</th>
                    <th className="text-left px-4 py-3 font-medium">액션</th>
                  </tr>
                </thead>
                <tbody>
                  {clans.map((clan) => (
                    <tr
                      key={clan.id}
                      className="border-b border-bg-tertiary/50 hover:bg-bg-tertiary/30"
                    >
                      <td className="px-4 py-3 font-medium text-text-primary">
                        {clan.name}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="default" className="text-[10px]">
                          {clan.tag}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {clan.owner.username}
                      </td>
                      <td className="px-4 py-3 text-text-muted">
                        {clan._count.members}명
                      </td>
                      <td className="px-4 py-3 text-text-muted text-xs">
                        {new Date(clan.createdAt).toLocaleDateString("ko-KR")}
                      </td>
                      <td className="px-4 py-3">
                        <Button
                          size="sm"
                          variant="danger"
                          aria-label={`${clan.name} 클랜 삭제`}
                          onClick={() => handleDelete(clan)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination page={page} totalPages={totalPages} onChange={setPage} />
        </CardContent>
      </Card>
    </div>
  );
}
