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
import { MessageSquare, Ban, CheckCircle, RefreshCw } from "lucide-react";
import type { AddToast } from "../shared";

interface DiscordGuildLink {
  id: string;
  guildId: string;
  guildName: string | null;
  status: "PENDING" | "ACTIVE" | "DISABLED";
  activatedAt: string | null;
  createdAt: string;
  owner: { id: string; username: string; avatar: string | null } | null;
  clan: { id: string; name: string; tag: string } | null;
}

const GUILD_STATUS_META: Record<
  DiscordGuildLink["status"],
  { label: string; variant: "default" | "secondary" | "danger" | "success" }
> = {
  PENDING: { label: "승인 대기", variant: "secondary" },
  ACTIVE: { label: "활성", variant: "success" },
  DISABLED: { label: "비활성", variant: "danger" },
};

export function DiscordGuildLinksTab({ addToast }: { addToast: AddToast }) {
  const [links, setLinks] = useState<DiscordGuildLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [sendingTestAlert, setSendingTestAlert] = useState(false);

  const fetchLinks = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminApi.getDiscordGuildLinks();
      setLinks(data);
    } catch {
      addToast("길드 연동 목록 로드 실패", "error");
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    fetchLinks();
  }, [fetchLinks]);

  const handleApprove = async (link: DiscordGuildLink) => {
    setUpdatingId(link.id);
    try {
      await adminApi.approveDiscordGuildLink(link.id);
      setLinks((prev) =>
        prev.map((l) =>
          l.id === link.id
            ? { ...l, status: "ACTIVE", activatedAt: new Date().toISOString() }
            : l,
        ),
      );
      addToast(`${link.guildName || link.guildId} 승인 완료`, "success");
    } catch (err: any) {
      addToast(err?.response?.data?.message || "승인 실패", "error");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDisable = async (link: DiscordGuildLink) => {
    setUpdatingId(link.id);
    try {
      await adminApi.disableDiscordGuildLink(link.id);
      setLinks((prev) =>
        prev.map((l) => (l.id === link.id ? { ...l, status: "DISABLED" } : l)),
      );
      addToast(`${link.guildName || link.guildId} 비활성화`, "success");
    } catch {
      addToast("비활성화 실패", "error");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleSendTestAlert = async () => {
    setSendingTestAlert(true);
    try {
      await adminApi.sendDiscordTestAlert();
      addToast("Discord 테스트 알림을 전송했습니다.", "success");
    } catch (err: any) {
      addToast(
        err?.response?.data?.message || "Discord 테스트 알림 전송 실패",
        "error",
      );
    } finally {
      setSendingTestAlert(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold text-text-primary">
          디스코드 길드 연동
        </h2>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleSendTestAlert}
            isLoading={sendingTestAlert}
          >
            <MessageSquare className="h-4 w-4 mr-1" />
            테스트 알림
          </Button>
          <Button size="sm" variant="outline" onClick={fetchLinks}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <p className="text-sm text-text-muted">
        유저가 봇을 자신의 Discord 서버에 추가하면 필수 권한을 확인한 뒤
        자동으로 활성 연동됩니다.
      </p>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12">
              <LoadingSpinner />
            </div>
          ) : links.length === 0 ? (
            <p className="text-center text-text-muted py-12 text-sm">
              연동된 길드가 없습니다.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-sm">
                <thead>
                  <tr className="border-b border-bg-tertiary text-text-muted">
                    <th className="text-left px-4 py-3 font-medium">서버</th>
                    <th className="text-left px-4 py-3 font-medium">소유자</th>
                    <th className="text-left px-4 py-3 font-medium">클랜</th>
                    <th className="text-left px-4 py-3 font-medium">상태</th>
                    <th className="text-left px-4 py-3 font-medium">액션</th>
                  </tr>
                </thead>
                <tbody>
                  {links.map((link) => {
                    const meta = GUILD_STATUS_META[link.status];
                    return (
                      <tr
                        key={link.id}
                        className="border-b border-bg-tertiary/50 hover:bg-bg-tertiary/30"
                      >
                        <td className="px-4 py-3">
                          <span className="font-medium text-text-primary">
                            {link.guildName || "(이름 미확인)"}
                          </span>
                          <p className="text-xs text-text-muted font-mono">
                            {link.guildId}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-text-secondary">
                          {link.owner?.username ?? "-"}
                        </td>
                        <td className="px-4 py-3 text-text-secondary">
                          {link.clan
                            ? `[${link.clan.tag}] ${link.clan.name}`
                            : "-"}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={meta.variant} className="text-[10px]">
                            {meta.label}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            {link.status !== "ACTIVE" && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={updatingId === link.id}
                                onClick={() => handleApprove(link)}
                              >
                                <CheckCircle className="h-3.5 w-3.5 mr-1" />
                                승인
                              </Button>
                            )}
                            {link.status !== "DISABLED" && (
                              <Button
                                size="sm"
                                variant="danger"
                                disabled={updatingId === link.id}
                                onClick={() => handleDisable(link)}
                              >
                                <Ban className="h-3.5 w-3.5 mr-1" />
                                비활성
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
