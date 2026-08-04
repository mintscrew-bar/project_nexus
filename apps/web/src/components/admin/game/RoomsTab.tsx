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
import { XCircle } from "lucide-react";
import { Pagination, type AddToast } from "../shared";

interface AdminRoom {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  host: { username: string };
  _count: { participants: number };
}

export function RoomsTab({ addToast }: { addToast: AddToast }) {
  const [rooms, setRooms] = useState<AdminRoom[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);

  const limit = 20;
  const totalPages = Math.ceil(total / limit);

  const fetchRooms = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminApi.getRooms({
        page,
        limit,
        status: status || undefined,
      });
      setRooms(data.rooms);
      setTotal(data.total);
    } catch {
      addToast("방 목록 로드 실패", "error");
    } finally {
      setLoading(false);
    }
  }, [page, status, addToast]);

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);

  const handleClose = async (room: AdminRoom) => {
    if (
      !confirm(
        `"${room.name}" 방을 삭제하시겠습니까? 참가자는 방에서 제거됩니다.`,
      )
    )
      return;
    try {
      await adminApi.closeRoom(room.id);
      setRooms((prev) => prev.filter((r) => r.id !== room.id));
      setTotal((prev) => Math.max(0, prev - 1));
      addToast("방 삭제 완료", "success");
    } catch {
      addToast("방 삭제 실패", "error");
    }
  };

  const STATUS_LABELS: Record<string, string> = {
    WAITING: "대기",
    IN_PROGRESS: "진행중",
    COMPLETED: "완료",
  };
  const STATUS_VARIANTS: Record<string, "default" | "secondary" | "danger"> = {
    WAITING: "secondary",
    IN_PROGRESS: "default",
    COMPLETED: "default",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-text-primary">방 관리</h2>
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="px-3 py-1.5 rounded-lg bg-bg-tertiary text-text-primary text-sm focus:outline-none"
        >
          <option value="">전체</option>
          <option value="WAITING">대기</option>
          <option value="IN_PROGRESS">진행중</option>
          <option value="COMPLETED">완료</option>
        </select>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12">
              <LoadingSpinner />
            </div>
          ) : rooms.length === 0 ? (
            <p className="text-center text-text-muted py-12">방이 없습니다.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-sm">
                <thead>
                  <tr className="border-b border-bg-tertiary text-text-muted">
                    <th className="text-left px-4 py-3 font-medium">방 이름</th>
                    <th className="text-left px-4 py-3 font-medium">호스트</th>
                    <th className="text-left px-4 py-3 font-medium">참가자</th>
                    <th className="text-left px-4 py-3 font-medium">상태</th>
                    <th className="text-left px-4 py-3 font-medium">생성일</th>
                    <th className="text-left px-4 py-3 font-medium">액션</th>
                  </tr>
                </thead>
                <tbody>
                  {rooms.map((room) => (
                    <tr
                      key={room.id}
                      className="border-b border-bg-tertiary/50 hover:bg-bg-tertiary/30"
                    >
                      <td className="px-4 py-3 font-medium text-text-primary">
                        {room.name}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {room.host.username}
                      </td>
                      <td className="px-4 py-3 text-text-muted">
                        {room._count.participants}명
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={STATUS_VARIANTS[room.status] ?? "default"}
                          className="text-[10px]"
                        >
                          {STATUS_LABELS[room.status] ?? room.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-text-muted text-xs">
                        {new Date(room.createdAt).toLocaleDateString("ko-KR")}
                      </td>
                      <td className="px-4 py-3">
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => handleClose(room)}
                        >
                          <XCircle className="h-3.5 w-3.5 mr-1" />
                          {room.status === "COMPLETED" ? "삭제" : "강제종료"}
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
