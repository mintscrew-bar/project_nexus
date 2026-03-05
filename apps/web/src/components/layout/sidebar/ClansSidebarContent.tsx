'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Shield, Crown, Users, Plus, ChevronRight, UserCheck } from 'lucide-react';
import { clanApi } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';
import { useClanStore } from '@/stores/clan-store';
import { cn } from '@/lib/utils';

interface ClanMember {
  id: string;
  userId: string;
  role: 'OWNER' | 'OFFICER' | 'MEMBER';
}

interface Clan {
  id: string;
  name: string;
  tag: string;
  logo: string | null;
  isRecruiting: boolean;
  maxMembers: number;
  members: ClanMember[];
}

const ROLE_LABEL: Record<string, string> = {
  OWNER: '클랜장',
  OFFICER: '부관',
  MEMBER: '멤버',
};

export function ClansSidebarContent() {
  const { user, isAuthenticated } = useAuthStore();
  const router = useRouter();
  const [myClan, setMyClan] = useState<Clan | null | undefined>(undefined); // undefined = 로딩 중
  const [recruitingClans, setRecruitingClans] = useState<Clan[]>([]);

  // clan-store에서 미읽음 카운트 가져오기
  const unreadCount = useClanStore((s) => s.unreadCount);

  // 내 클랜 조회
  useEffect(() => {
    if (!isAuthenticated) { setMyClan(null); return; }
    clanApi.getMyClan().then(setMyClan).catch(() => setMyClan(null));
  }, [isAuthenticated]);

  // 모집 중인 클랜 TOP3 (내 클랜 없을 때)
  useEffect(() => {
    if (myClan) return;
    clanApi.getClans({ isRecruiting: true }).then((data: Clan[]) => {
      setRecruitingClans((data || []).slice(0, 3));
    }).catch(() => {});
  }, [myClan]);

  // 내가 속한 클랜에서 내 역할 찾기
  const myRole = myClan && user
    ? myClan.members.find((m) => m.userId === user.id)?.role
    : null;

  return (
    <div className="space-y-5">
      {/* 내 클랜 */}
      {myClan ? (
        <div>
          <h2 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-3 px-2">
            내 클랜
          </h2>
          <div
            className="px-3 py-3 rounded-lg bg-bg-tertiary hover:bg-bg-elevated transition-colors cursor-pointer group"
            onClick={() => router.push(`/clans/${myClan.id}`)}
          >
            <div className="flex items-center gap-2.5">
              {/* 클랜 로고 */}
              <div className="w-9 h-9 rounded-md bg-bg-elevated flex items-center justify-center flex-shrink-0 overflow-hidden relative">
                {myClan.logo ? (
                  <Image src={myClan.logo} alt={myClan.name} fill className="object-cover" unoptimized />
                ) : (
                  <Shield className="h-5 w-5 text-text-tertiary" />
                )}
              </div>
              <div className="flex-grow min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-semibold text-text-primary truncate">
                    [{myClan.tag}] {myClan.name}
                  </p>
                  {/* 읽지 않은 메시지 배지 */}
                  {unreadCount > 0 && (
                    <span className="inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full bg-red-500 text-white text-[9px] font-bold leading-none flex-shrink-0">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-text-tertiary flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {myClan.members.length}/{myClan.maxMembers}
                  </span>
                  {myRole && (
                    <span className={cn(
                      'text-[10px] font-medium px-1.5 py-0.5 rounded',
                      myRole === 'OWNER' ? 'bg-accent-gold/20 text-accent-gold' :
                      myRole === 'OFFICER' ? 'bg-accent-primary/20 text-accent-primary' :
                      'bg-bg-elevated text-text-tertiary'
                    )}>
                      {ROLE_LABEL[myRole]}
                    </span>
                  )}
                  {myClan.isRecruiting && (
                    <span className="text-[10px] text-accent-success">모집 중</span>
                  )}
                </div>
              </div>
              <ChevronRight className="h-3.5 w-3.5 text-text-quaternary group-hover:text-accent-primary transition-colors flex-shrink-0" />
            </div>
          </div>
        </div>
      ) : myClan === null && isAuthenticated ? (
        /* 클랜 없음 → 만들기 CTA */
        <div>
          <h2 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-3 px-2">
            클랜
          </h2>
          <Link
            href="/clans/create"
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-accent-primary text-white font-medium text-sm hover:bg-accent-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span>클랜 만들기</span>
          </Link>
        </div>
      ) : myClan === null && !isAuthenticated ? (
        <div>
          <h2 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-3 px-2">
            클랜
          </h2>
        </div>
      ) : null}

      {/* 클랜 목록 링크 */}
      <div>
        <Link
          href="/clans"
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-text-secondary hover:text-text-primary hover:bg-bg-tertiary transition-colors"
        >
          <Shield className="h-4 w-4" />
          <span>전체 클랜 보기</span>
        </Link>
      </div>

      {/* 모집 중인 클랜 TOP3 (내 클랜 없을 때만) */}
      {!myClan && recruitingClans.length > 0 && (
        <div>
          <div className="flex items-center gap-1 mb-2 px-2">
            <UserCheck className="h-3.5 w-3.5 text-accent-success" />
            <h2 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">
              모집 중
            </h2>
          </div>
          <div className="space-y-1">
            {recruitingClans.map((clan) => (
              <Link
                key={clan.id}
                href={`/clans/${clan.id}`}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-bg-tertiary transition-colors group"
              >
                <div className="w-7 h-7 rounded-md bg-bg-tertiary flex items-center justify-center flex-shrink-0 overflow-hidden relative">
                  {clan.logo ? (
                    <Image src={clan.logo} alt={clan.name} fill className="object-cover" unoptimized />
                  ) : (
                    <Shield className="h-3.5 w-3.5 text-text-tertiary" />
                  )}
                </div>
                <div className="flex-grow min-w-0">
                  <p className="text-xs font-medium text-text-secondary group-hover:text-text-primary truncate">
                    [{clan.tag}] {clan.name}
                  </p>
                  <span className="text-[10px] text-text-tertiary">
                    {clan.members.length}/{clan.maxMembers}명
                  </span>
                </div>
                <ChevronRight className="h-3 w-3 text-text-quaternary group-hover:text-accent-primary flex-shrink-0" />
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
