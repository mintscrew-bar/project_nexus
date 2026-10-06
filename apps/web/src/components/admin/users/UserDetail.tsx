"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui";
import { ChevronDown, Bot } from "lucide-react";
import {
  type AdminUser,
  ROLE_LABELS,
  ROLE_VARIANTS,
  PRESENCE_LABELS,
  PRESENCE_VARIANTS,
} from "./user-types";

// 등록된 라이엇 계정 표시 — 주 계정만 노출, 추가 계정은 드롭다운으로 펼침
export function RiotAccountsCell({
  accounts,
}: {
  accounts: AdminUser["riotAccounts"];
}) {
  const [open, setOpen] = useState(false);

  if (!accounts || accounts.length === 0) {
    return <span className="text-xs text-text-muted">-</span>;
  }

  // 주 계정 우선, 없으면 첫 번째
  const primary = accounts.find((a) => a.isPrimary) ?? accounts[0];
  const others = accounts.filter((a) => a.id !== primary.id);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => others.length > 0 && setOpen((v) => !v)}
        className={`inline-flex items-center gap-1 text-xs ${
          others.length > 0
            ? "hover:text-accent-primary cursor-pointer"
            : "cursor-default"
        } text-text-primary`}
      >
        <span className="font-medium">
          {primary.gameName}#{primary.tagLine}
        </span>
        {others.length > 0 && (
          <span className="flex items-center gap-0.5 text-text-muted">
            <span className="text-[10px]">+{others.length}</span>
            <ChevronDown
              className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
            />
          </span>
        )}
      </button>
      {open && others.length > 0 && (
        <>
          {/* 바깥 클릭 시 닫힘 */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 z-20 min-w-[180px] rounded-lg border border-bg-tertiary bg-bg-secondary shadow-lg py-1">
            {others.map((acc) => (
              <div
                key={acc.id}
                className="px-3 py-1.5 text-xs text-text-primary hover:bg-bg-tertiary/50"
              >
                <span className="font-medium">
                  {acc.gameName}#{acc.tagLine}
                </span>
                <span className="ml-2 text-text-muted">
                  {acc.tier}
                  {acc.rank ? ` ${acc.rank}` : ""}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function UserDetailContent({ user }: { user: AdminUser }) {
  const primaryRiot = user.riotAccounts.find((account) => account.isPrimary);
  const activeStreams = (user.streamerProfiles ?? []).filter(
    (profile) => profile.isActive,
  );
  const providers =
    user.authProviders.map((provider) => provider.provider).join(", ") || "-";

  return (
    <div className="space-y-4 text-sm">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg bg-bg-tertiary/60 p-3">
          <p className="text-xs text-text-muted">닉네임</p>
          <p className="mt-1 font-semibold text-text-primary">
            {user.username}
          </p>
        </div>
        <div className="rounded-lg bg-bg-tertiary/60 p-3">
          <p className="text-xs text-text-muted">권한</p>
          <div className="mt-1">
            <Badge variant={ROLE_VARIANTS[user.role]}>
              {ROLE_LABELS[user.role]}
            </Badge>
          </div>
        </div>
        <div className="rounded-lg bg-bg-tertiary/60 p-3">
          <p className="text-xs text-text-muted">이메일</p>
          <p className="mt-1 break-all text-text-primary">
            {user.email ?? "-"}
          </p>
        </div>
        <div className="rounded-lg bg-bg-tertiary/60 p-3">
          <p className="text-xs text-text-muted">가입일</p>
          <p className="mt-1 text-text-primary">
            {new Date(user.createdAt).toLocaleString("ko-KR")}
          </p>
        </div>
        <div className="rounded-lg bg-bg-tertiary/60 p-3">
          <p className="text-xs text-text-muted">로그인 제공자</p>
          <p className="mt-1 text-text-primary">{providers}</p>
        </div>
        <div className="rounded-lg bg-bg-tertiary/60 p-3">
          <p className="text-xs text-text-muted">접속 상태</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Badge variant={PRESENCE_VARIANTS[user.status]}>
              {PRESENCE_LABELS[user.status]}
            </Badge>
            {user.lastSeenAt && (
              <span className="text-xs text-text-muted">
                최근 {new Date(user.lastSeenAt).toLocaleString("ko-KR")}
              </span>
            )}
          </div>
        </div>
        <div className="rounded-lg bg-bg-tertiary/60 p-3">
          <p className="text-xs text-text-muted">신고 받은 수</p>
          <p className="mt-1 font-semibold text-text-primary">
            {user._count.reportsReceived.toLocaleString()}건
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-bg-tertiary p-3">
        <p className="mb-2 text-xs font-semibold text-text-muted">상태</p>
        <div className="flex flex-wrap gap-2">
          {user.isBanned ? (
            <Badge variant="danger">밴</Badge>
          ) : (
            <Badge variant="default">밴 아님</Badge>
          )}
          {user.isRestricted ? (
            <Badge variant="secondary">제재 중</Badge>
          ) : (
            <Badge variant="default">제재 없음</Badge>
          )}
          {user.isBot && <Badge variant="secondary">테스트 봇</Badge>}
        </div>
        {user.banReason && (
          <p className="mt-2 text-xs text-text-secondary">
            밴 사유: {user.banReason}
          </p>
        )}
        {user.restrictedUntil && (
          <p className="mt-1 text-xs text-text-secondary">
            제재 종료: {new Date(user.restrictedUntil).toLocaleString("ko-KR")}
          </p>
        )}
      </div>

      <div className="rounded-lg border border-bg-tertiary p-3">
        <p className="mb-2 text-xs font-semibold text-text-muted">
          라이엇 계정
        </p>
        {user.riotAccounts.length === 0 ? (
          <p className="text-xs text-text-muted">연동된 계정 없음</p>
        ) : (
          <div className="space-y-2">
            {user.riotAccounts.map((account) => (
              <div
                key={account.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-bg-tertiary/50 px-3 py-2"
              >
                <div>
                  <p className="font-medium text-text-primary">
                    {account.gameName}#{account.tagLine}
                    {account.isPrimary && (
                      <span className="ml-2 text-xs text-accent-primary">
                        주 계정
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-text-muted">
                    {account.tier}
                    {account.rank ? ` ${account.rank}` : ""}
                  </p>
                </div>
                {account.puuid && (
                  <span className="max-w-[180px] truncate text-[10px] text-text-muted">
                    {account.puuid}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-bg-tertiary p-3">
        <p className="mb-2 text-xs font-semibold text-text-muted">
          방송/프로필
        </p>
        <p className="text-xs text-text-secondary">
          주 라이엇:{" "}
          {primaryRiot ? `${primaryRiot.gameName}#${primaryRiot.tagLine}` : "-"}
        </p>
        {activeStreams.length > 0 ? (
          <div className="mt-2 space-y-1">
            {activeStreams.map((profile) => (
              <a
                key={`${profile.platform}-${profile.channelUrl}`}
                href={profile.channelUrl}
                target="_blank"
                rel="noreferrer"
                className="block truncate text-xs text-accent-primary underline"
              >
                {profile.platform} · {profile.channelName ?? profile.channelUrl}
              </a>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-xs text-text-muted">활성 방송 프로필 없음</p>
        )}
      </div>

      <div className="rounded-lg bg-bg-tertiary/60 p-3">
        <p className="text-xs text-text-muted">User ID</p>
        <p className="mt-1 break-all font-mono text-xs text-text-secondary">
          {user.id}
        </p>
      </div>
    </div>
  );
}
