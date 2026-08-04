"use client";

import { useEffect, useState, useCallback } from "react";
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

interface AdminClan {
  id: string;
  name: string;
  tag: string;
  createdAt: string;
  owner: { username: string };
  _count: { members: number };
}

export function ClansTab({ addToast }: { addToast: AddToast }) {
  const [clans, setClans] = useState<AdminClan[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(true);

  const limit = 20;
  const totalPages = Math.ceil(total / limit);

  const fetchClans = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminApi.getClans({
        page,
        limit,
        search: search || undefined,
      });
      setClans(data.clans);
      setTotal(data.total);
    } catch {
      addToast("클랜 목록 로드 실패", "error");
    } finally {
      setLoading(false);
    }
  }, [page, search, addToast]);

  useEffect(() => {
    fetchClans();
  }, [fetchClans]);

  const handleDelete = async (clan: AdminClan) => {
    if (!confirm(`"${clan.name}" 클랜을 삭제하시겠습니까?`)) return;
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
