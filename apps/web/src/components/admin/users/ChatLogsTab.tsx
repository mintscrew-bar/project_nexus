"use client";

import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import { adminApi } from "@/lib/api-client";
import { Card, CardContent, Button, LoadingSpinner } from "@/components/ui";
import { Search, X } from "lucide-react";
import { Pagination } from "../shared";

// DM·클랜 채팅은 개인정보보호법·통신비밀보호법상 임의 열람 위법 소지 → 제외
// 클랜 채팅은 신고 접수 건에 한해 신고 관리 탭에서 확인
type ChatLogCategory = "room";

interface ChatLog {
  id: string;
  category: ChatLogCategory;
  content: string;
  location: string;
  userId: string | null;
  username: string;
  avatar: string | null;
  createdAt: string;
}

// 방 채팅만 허용 (내전 진행 중 신고 대응 목적, 이용약관 고지됨)
const CHAT_CATEGORIES: { id: ChatLogCategory; label: string }[] = [
  { id: "room", label: "방 채팅" },
];

const LOCATION_HEADERS: Record<ChatLogCategory, string> = {
  room: "방",
};

export function ChatLogsTab() {
  const [logs, setLogs] = useState<ChatLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState<ChatLogCategory>("room");
  const [roomName, setRoomName] = useState("");
  const [userId, setUserId] = useState("");
  const [search, setSearch] = useState("");
  const [roomInput, setRoomInput] = useState("");
  const [userInput, setUserInput] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(true);

  const limit = 50;
  const totalPages = Math.ceil(total / limit);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminApi.getChatLogs({
        page,
        limit,
        category,
        roomName: category === "room" && roomName ? roomName : undefined,
        userId: userId || undefined,
        search: search || undefined,
      });
      setLogs(data.logs ?? []);
      setTotal(data.total ?? 0);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [page, category, roomName, userId, search]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleCategoryChange = (cat: ChatLogCategory) => {
    setCategory(cat);
    setPage(1);
    setRoomName("");
    setRoomInput("");
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setRoomName(roomInput);
    setUserId(userInput);
    setSearch(searchInput);
    setPage(1);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-lg font-semibold text-text-primary">채팅 로그</h2>
        <span className="text-xs text-text-muted">
          총 {total.toLocaleString()}건
        </span>
      </div>

      {/* 카테고리 탭 */}
      <div className="flex gap-1 bg-bg-tertiary/50 rounded-lg p-1 w-fit">
        {CHAT_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => handleCategoryChange(cat.id)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              category === cat.id
                ? "bg-accent-primary text-white"
                : "text-text-secondary hover:text-text-primary hover:bg-bg-tertiary"
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* 필터 */}
      <form onSubmit={handleSearch} className="flex gap-2 flex-wrap">
        {category === "room" && (
          <input
            type="text"
            value={roomInput}
            onChange={(e) => setRoomInput(e.target.value)}
            placeholder="방 이름..."
            className="px-3 py-1.5 rounded-lg bg-bg-tertiary text-text-primary text-sm w-36 focus:outline-none focus:ring-1 focus:ring-accent-primary"
          />
        )}
        <input
          type="text"
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          placeholder="유저 ID..."
          className="px-3 py-1.5 rounded-lg bg-bg-tertiary text-text-primary text-sm w-44 focus:outline-none focus:ring-1 focus:ring-accent-primary"
        />
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="내용 검색..."
          className="px-3 py-1.5 rounded-lg bg-bg-tertiary text-text-primary text-sm w-40 focus:outline-none focus:ring-1 focus:ring-accent-primary"
        />
        <Button type="submit" size="sm" variant="outline">
          <Search className="h-4 w-4" />
        </Button>
        {(roomName || userId || search) && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setRoomName("");
              setUserId("");
              setSearch("");
              setRoomInput("");
              setUserInput("");
              setSearchInput("");
              setPage(1);
            }}
          >
            <X className="h-4 w-4 mr-1" /> 초기화
          </Button>
        )}
      </form>

      {/* 테이블 */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12">
              <LoadingSpinner />
            </div>
          ) : logs.length === 0 ? (
            <p className="text-center text-text-muted py-12">
              채팅 로그가 없습니다.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-sm">
                <thead>
                  <tr className="border-b border-bg-tertiary text-text-muted">
                    <th className="text-left px-4 py-3 font-medium w-40">
                      시간
                    </th>
                    <th className="text-left px-4 py-3 font-medium w-32">
                      {LOCATION_HEADERS[category]}
                    </th>
                    <th className="text-left px-4 py-3 font-medium w-28">
                      유저
                    </th>
                    <th className="text-left px-4 py-3 font-medium">내용</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr
                      key={log.id}
                      className="border-b border-bg-tertiary/50 hover:bg-bg-tertiary/30"
                    >
                      <td className="px-4 py-2.5 text-text-muted text-xs whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString("ko-KR")}
                      </td>
                      <td
                        className="px-4 py-2.5 text-xs text-text-secondary truncate max-w-[8rem]"
                        title={log.location}
                      >
                        {log.location}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1.5">
                          {log.avatar ? (
                            <Image
                              src={log.avatar}
                              alt=""
                              width={20}
                              height={20}
                              className="w-5 h-5 rounded-full"
                            />
                          ) : (
                            <div className="w-5 h-5 rounded-full bg-bg-tertiary" />
                          )}
                          <span
                            className="text-text-secondary text-xs truncate max-w-[5rem]"
                            title={log.username}
                          >
                            {log.username}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-text-primary">
                        <p className="truncate max-w-lg" title={log.content}>
                          {log.content}
                        </p>
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
