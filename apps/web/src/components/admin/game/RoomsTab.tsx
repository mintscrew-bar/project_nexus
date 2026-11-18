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
import { XCircle } from "lucide-react";
import { Pagination, type AddToast } from "../shared";
import { useAdminGameScope } from "../game-scope";
import { useConfirm } from "../ConfirmDialog";
import { useResetOn } from "@/hooks/useResetOn";
import { useQueryFieldSetter } from "@/hooks/useQuerySetter";
import { useQuery } from "@tanstack/react-query";

interface AdminRoom {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  host: { username: string };
  _count: { participants: number };
}

export function RoomsTab({ addToast }: { addToast: AddToast }) {
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
  const [status, setStatus] = useState("");

  const limit = 20;

  // 서버 조회는 React Query 로 — 늦게 온 옛 응답이 새 결과를 덮지 않는 것도 키가 맡는다
  // (예전 requestId 비교를 대신한다). 삭제 직후엔 캐시를 바로 고친다(setRooms·setTotal).
  type RoomsPage = { rooms: AdminRoom[]; total: number };
  const roomsKey = ["admin-rooms", page, status, gameParam];
  const roomsQuery = useQuery({
    queryKey: roomsKey,
    queryFn: () =>
      adminApi.getRooms({
        page,
        limit,
        status: status || undefined,
        gameTitle: gameParam,
      }) as Promise<RoomsPage>,
  });
  const rooms = roomsQuery.data?.rooms ?? [];
  const total = roomsQuery.data?.total ?? 0;
  const totalPages = Math.ceil(total / limit);
  const loading = roomsQuery.isLoading;
  const setRooms = useQueryFieldSetter<RoomsPage, "rooms">(roomsKey, "rooms");
  const setTotal = useQueryFieldSetter<RoomsPage, "total">(roomsKey, "total");
  useEffect(() => {
    if (roomsQuery.isError) addToast("방 목록 로드 실패", "error");
  }, [roomsQuery.isError, addToast]);

  const handleClose = async (room: AdminRoom) => {
    const ok = await confirm({
      title: "방 삭제",
      message: `"${room.name}" 방을 삭제합니다. 참가자는 방에서 제거되고 되돌릴 수 없습니다.`,
      confirmLabel: "삭제",
      danger: true,
    });
    if (!ok) return;
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
      {dialog}
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
