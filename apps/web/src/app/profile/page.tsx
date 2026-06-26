"use client";

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useAuthStore } from '@/stores/auth-store';
import { useRiotStore } from '@/stores/riot-store';
import { useDdragonStore } from '@/stores/ddragon-store';
import { userApi, matchApi, statsApi, reputationApi, type StreamerPlatform, type StreamerProfile, type StreamerLink } from '@/lib/api-client';
import { AddAccountModal } from '@/components/domain/AddAccountModal';
import { EditAccountModal } from '@/components/domain/EditAccountModal';
import { ChampionImage } from '@/components/ChampionImage';
import { PositionIcon, POSITION_LABELS } from '@/app/tournaments/[id]/lobby/_components/icons';
import { getChampionIcon } from '@/components/matches/match-utils';
import { LoadingSpinner, Card, CardHeader, CardTitle, CardContent, Badge, Button, Skeleton, EmptyState, ConfirmModal, StatusSelector, Tabs, TabsList, TabsTrigger, TabsContent, Dropdown } from '@/components/ui';
import { Star, Plus, RefreshCw, Shield, TrendingUp, Loader2, History, Clock, Settings, User, BarChart3, Pencil, Trash2, Swords, Gavel, Camera, Check, X, MoreVertical, Activity, Calendar, Trophy, Target, Radio, ExternalLink } from 'lucide-react';
import { TierBadge } from '@/components/domain/TierBadge';
import { ReputationSummary, SummaryChip, WinRateSparkline } from '@/components/domain/ProfileStats';
import { useToast } from '@/components/ui/Toast';
import { usePresence } from '@/hooks/usePresence';
import { getChampionKoreanName, searchChampionsByQuery } from '@nexus/types';

const ROLE_LABELS: Record<string, string> = {
  TOP: '탑',
  JUNGLE: '정글',
  MID: '미드',
  ADC: '원딜',
  SUPPORT: '서포터',
};

const PROFILE_ACCENT = '#667EEA';

const STREAMER_PLATFORM_OPTIONS: Array<{
  value: StreamerPlatform;
  label: string;
  placeholder: string;
}> = [
  {
    value: 'CHZZK',
    label: '치지직',
    placeholder: 'https://chzzk.naver.com/...',
  },
  {
    value: 'SOOP',
    label: 'SOOP',
    placeholder: 'https://ch.sooplive.co.kr/...',
  },
  {
    value: 'YOUTUBE',
    label: '유튜브',
    placeholder: 'https://www.youtube.com/@...',
  },
];

const STREAMER_PLATFORM_LABELS: Record<StreamerPlatform, string> = {
  CHZZK: '치지직',
  SOOP: 'SOOP',
  YOUTUBE: '유튜브',
};

// 플랫폼별 인라인 편집 행
function StreamerRow({
  entry,
  isNew,
  usedPlatforms,
  onSave,
  onDelete,
  onCancel,
}: {
  entry: StreamerProfile | null;
  isNew: boolean;
  usedPlatforms: StreamerPlatform[];
  onSave: (data: { platform: StreamerPlatform; channelUrl: string; channelName?: string }) => Promise<void>;
  onDelete: (platform: StreamerPlatform) => Promise<void>;
  onCancel?: () => void;
}) {
  const availablePlatforms = STREAMER_PLATFORM_OPTIONS.filter(
    (opt) => !usedPlatforms.includes(opt.value) || opt.value === entry?.platform,
  );
  const [editing, setEditing] = useState(isNew);
  const [platform, setPlatform] = useState<StreamerPlatform>(
    entry?.platform ?? availablePlatforms[0]?.value ?? 'CHZZK',
  );
  const [channelUrl, setChannelUrl] = useState(entry?.channelUrl ?? '');
  const [channelName, setChannelName] = useState(entry?.channelName ?? '');
  const [saving, setSaving] = useState(false);

  const selectedOpt = STREAMER_PLATFORM_OPTIONS.find((o) => o.value === platform) ?? STREAMER_PLATFORM_OPTIONS[0];

  const handleSave = async () => {
    if (!channelUrl.trim()) return;
    setSaving(true);
    try {
      await onSave({ platform, channelUrl: channelUrl.trim(), channelName: channelName.trim() || undefined });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!entry || !confirm(`${STREAMER_PLATFORM_LABELS[entry.platform]} 채널을 제거할까요?`)) return;
    setSaving(true);
    try {
      await onDelete(entry.platform);
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <div className="flex items-center gap-3 rounded-lg bg-bg-tertiary/50 px-3 py-2.5">
        <span className="w-16 flex-shrink-0 text-xs font-bold text-text-secondary">
          {STREAMER_PLATFORM_LABELS[entry!.platform]}
        </span>
        <a
          href={entry!.channelUrl}
          target="_blank"
          rel="noreferrer"
          className="min-w-0 flex-1 truncate text-sm font-semibold text-accent-primary hover:underline"
        >
          {entry!.channelName || entry!.channelUrl}
        </a>
        <div className="flex flex-shrink-0 gap-1">
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setEditing(true)}>
            수정
          </Button>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-accent-danger hover:text-accent-danger" onClick={handleDelete} disabled={saving}>
            삭제
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-2 rounded-lg bg-bg-tertiary/50 p-2.5 sm:grid-cols-[120px_1fr_140px_auto]">
      <select
        value={platform}
        onChange={(e) => setPlatform(e.target.value as StreamerPlatform)}
        disabled={!isNew}
        className="rounded-lg border border-bg-tertiary bg-bg-primary px-3 py-2 text-sm font-semibold text-text-primary outline-none focus:border-accent-primary disabled:opacity-60"
      >
        {availablePlatforms.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <input
        value={channelUrl}
        onChange={(e) => setChannelUrl(e.target.value)}
        placeholder={selectedOpt.placeholder}
        className="min-w-0 rounded-lg border border-bg-tertiary bg-bg-primary px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-tertiary focus:border-accent-primary"
      />
      <input
        value={channelName}
        onChange={(e) => setChannelName(e.target.value)}
        placeholder="채널명 (선택)"
        className="min-w-0 rounded-lg border border-bg-tertiary bg-bg-primary px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-tertiary focus:border-accent-primary"
      />
      <div className="flex gap-1.5">
        <Button
          variant="ghost"
          size="sm"
          className="h-9 px-2"
          onClick={() => { if (isNew && onCancel) { onCancel(); } else { setEditing(false); } }}
          disabled={saving}
        >
          취소
        </Button>
        <Button size="sm" className="h-9 px-3" onClick={handleSave} disabled={saving || !channelUrl.trim()}>
          {saving ? '저장 중' : '저장'}
        </Button>
      </div>
    </div>
  );
}

function StreamerRegistrationCard({
  profiles,
  onSaved,
  addToast,
}: {
  profiles: StreamerProfile[];
  onSaved: () => Promise<void>;
  addToast: (message: string, type: 'success' | 'error') => void;
}) {
  const [addingNew, setAddingNew] = useState(false);

  const usedPlatforms = profiles.map((p) => p.platform);
  // 3개 플랫폼이 모두 등록됐으면 추가 버튼 숨김
  const canAdd = profiles.length < 3 && !addingNew;

  const handleSave = async (data: { platform: StreamerPlatform; channelUrl: string; channelName?: string }) => {
    try {
      await userApi.upsertStreamerProfile(data);
      await onSaved();
      setAddingNew(false);
      addToast('스트리머 채널이 저장되었습니다.', 'success');
    } catch (error: any) {
      const message = error?.response?.data?.message;
      addToast(Array.isArray(message) ? message[0] : message || '저장에 실패했습니다.', 'error');
      throw error;
    }
  };

  const handleDelete = async (platform: StreamerPlatform) => {
    try {
      await userApi.deleteStreamerProfile(platform);
      await onSaved();
      addToast('채널을 제거했습니다.', 'success');
    } catch {
      addToast('채널 제거에 실패했습니다.', 'error');
      throw new Error();
    }
  };

  return (
    <Card className="overflow-hidden rounded-lg border-accent-gold/25 bg-bg-secondary p-0">
      <CardContent className="p-4 md:p-5">
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Badge variant="gold" className="gap-1 rounded-md px-2 py-1 text-xs font-black">
              <Radio className="h-3.5 w-3.5" />
              streamer
            </Badge>
            <span className="text-sm font-bold text-text-primary">방송 채널</span>
            <span className="text-xs text-text-tertiary">{profiles.length}/3</span>
          </div>
          {canAdd && (
            <Button variant="outline" size="sm" className="h-7 gap-1 px-2.5 text-xs" onClick={() => setAddingNew(true)}>
              <Plus className="h-3.5 w-3.5" />
              채널 추가
            </Button>
          )}
        </div>

        {profiles.length === 0 && !addingNew && (
          <div className="rounded-lg border border-dashed border-bg-elevated bg-bg-tertiary/40 px-3 py-4">
            <p className="text-sm font-bold text-text-primary">방송 채널을 연결하면 streamer 태그가 표시됩니다.</p>
            <p className="mt-1 text-xs text-text-muted">치지직, SOOP, 유튜브 채널을 최대 3개까지 등록할 수 있습니다.</p>
          </div>
        )}

        <div className="flex flex-col gap-2">
          {profiles.map((profile) => (
            <StreamerRow
              key={profile.platform}
              entry={profile}
              isNew={false}
              usedPlatforms={usedPlatforms}
              onSave={handleSave}
              onDelete={handleDelete}
            />
          ))}
          {addingNew && (
            <StreamerRow
              entry={null}
              isNew={true}
              usedPlatforms={usedPlatforms}
              onSave={handleSave}
              onDelete={handleDelete}
              onCancel={() => setAddingNew(false)}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function StreamerLinkRow({
  link,
  isNew,
  order,
  onSave,
  onDelete,
  onCancel,
  addToast,
}: {
  link: StreamerLink | null;
  isNew: boolean;
  order: number;
  onSave: (
    linkId: string | null,
    data: { label: string; url: string; order: number },
    image?: File | null,
  ) => Promise<void>;
  onDelete: (linkId: string) => Promise<void>;
  onCancel?: () => void;
  addToast: (message: string, type: 'success' | 'error') => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(isNew);
  const [label, setLabel] = useState(link?.label ?? '');
  const [url, setUrl] = useState(link?.url ?? '');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(link?.imageUrl ?? null);
  const [saving, setSaving] = useState(false);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.match(/^image\/(jpeg|jpg|png|gif|webp)$/)) {
      addToast('지원하지 않는 이미지 형식입니다. (jpg, png, gif, webp만 가능)', 'error');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      addToast('이미지 크기는 5MB 이하여야 합니다.', 'error');
      return;
    }
    setImageFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleSave = async () => {
    if (!label.trim() || !url.trim()) {
      addToast('링크 이름과 주소를 입력해주세요.', 'error');
      return;
    }

    setSaving(true);
    try {
      await onSave(link?.id ?? null, { label: label.trim(), url: url.trim(), order }, imageFile);
      setEditing(false);
      setImageFile(null);
    } finally {
      setSaving(false);
    }
  };

  if (!editing && link) {
    return (
      <div className="flex flex-col gap-3 rounded-lg bg-bg-tertiary/50 px-3 py-2.5 sm:flex-row sm:items-center">
        <div className="relative h-12 w-16 flex-shrink-0 overflow-hidden rounded-md bg-bg-primary">
          {link.imageUrl ? (
            <Image src={link.imageUrl} alt={link.label} fill className="object-cover" unoptimized />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <ExternalLink className="h-4 w-4 text-text-tertiary" />
            </div>
          )}
        </div>
        <a href={link.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-text-primary">{link.label}</p>
          <p className="truncate text-xs text-text-tertiary">{link.url}</p>
        </a>
        <div className="flex flex-shrink-0 justify-end gap-1">
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setEditing(true)}>
            수정
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-accent-danger hover:text-accent-danger"
            onClick={() => onDelete(link.id)}
          >
            삭제
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-2 rounded-lg bg-bg-tertiary/50 p-2.5 sm:grid-cols-[40px_minmax(120px,160px)_1fr_auto] sm:items-center">
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className="relative h-12 w-full shrink-0 overflow-hidden rounded-lg border border-bg-tertiary bg-bg-primary text-text-tertiary transition-colors hover:border-accent-primary hover:text-text-primary sm:h-9 sm:w-9"
      >
        {previewUrl ? (
          <Image src={previewUrl} alt="링크 이미지" fill className="object-cover" unoptimized />
        ) : (
          <span className="flex h-full w-full items-center justify-center">
            <Camera className="h-4 w-4" />
          </span>
        )}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
        onChange={handleFileChange}
        className="hidden"
      />
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="링크 이름"
        className="w-full rounded-lg border border-bg-tertiary bg-bg-primary px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-tertiary focus:border-accent-primary"
      />
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://discord.gg/..."
        className="min-w-0 flex-1 rounded-lg border border-bg-tertiary bg-bg-primary px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-tertiary focus:border-accent-primary"
      />
      <div className="flex shrink-0 justify-end gap-1.5">
        <Button
          variant="ghost"
          size="sm"
          className="h-9 px-2"
          onClick={() => { if (isNew && onCancel) { onCancel(); } else { setEditing(false); } }}
          disabled={saving}
        >
          취소
        </Button>
        <Button size="sm" className="h-9 px-3" onClick={handleSave} disabled={saving}>
          {saving ? '저장 중' : '저장'}
        </Button>
      </div>
    </div>
  );
}

function StreamerLinksCard({
  links,
  onSaved,
  addToast,
}: {
  links: StreamerLink[];
  onSaved: () => Promise<void>;
  addToast: (message: string, type: 'success' | 'error') => void;
}) {
  const [addingNew, setAddingNew] = useState(false);
  const canAdd = links.length < 12 && !addingNew;

  const handleSave = async (
    linkId: string | null,
    data: { label: string; url: string; order: number },
    image?: File | null,
  ) => {
    try {
      const saved = linkId
        ? await userApi.updateStreamerLink(linkId, data)
        : await userApi.createStreamerLink(data);
      if (image) {
        await userApi.uploadStreamerLinkImage(saved.id, image);
      }
      await onSaved();
      setAddingNew(false);
      addToast('링크가 저장되었습니다.', 'success');
    } catch (error: any) {
      const message = error?.response?.data?.message;
      addToast(Array.isArray(message) ? message[0] : message || '링크 저장에 실패했습니다.', 'error');
      throw error;
    }
  };

  const handleDelete = async (linkId: string) => {
    if (!confirm('링크를 삭제할까요?')) return;
    try {
      await userApi.deleteStreamerLink(linkId);
      await onSaved();
      addToast('링크를 삭제했습니다.', 'success');
    } catch {
      addToast('링크 삭제에 실패했습니다.', 'error');
    }
  };

  return (
    <Card className="overflow-hidden rounded-lg border-bg-tertiary bg-bg-secondary p-0">
      <CardContent className="p-4 md:p-5">
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-text-primary">추가 링크</span>
              <span className="text-xs text-text-tertiary">{links.length}/12</span>
            </div>
            <p className="mt-1 text-xs text-text-muted">디스코드 채널, 공지, 팬카페처럼 방송에 필요한 링크를 이미지 카드로 추가합니다.</p>
          </div>
          {canAdd && (
            <Button variant="outline" size="sm" className="h-7 gap-1 px-2.5 text-xs" onClick={() => setAddingNew(true)}>
              <Plus className="h-3.5 w-3.5" />
              링크 추가
            </Button>
          )}
        </div>

        <div className="flex flex-col gap-2">
          {links.map((link, index) => (
            <StreamerLinkRow
              key={link.id}
              link={link}
              isNew={false}
              order={index}
              onSave={handleSave}
              onDelete={handleDelete}
              addToast={addToast}
            />
          ))}
          {addingNew && (
            <StreamerLinkRow
              link={null}
              isNew={true}
              order={links.length}
              onSave={handleSave}
              onDelete={handleDelete}
              onCancel={() => setAddingNew(false)}
              addToast={addToast}
            />
          )}
          {links.length === 0 && !addingNew && (
            <div className="rounded-lg border border-dashed border-bg-elevated bg-bg-tertiary/40 px-3 py-4">
              <p className="text-sm font-bold text-text-primary">디스코드, 공지, 팬카페 링크를 모아둘 수 있습니다.</p>
              <p className="mt-1 text-xs text-text-muted">각 링크마다 작은 이미지를 붙여 공개 프로필에서 더 잘 보이게 만들 수 있습니다.</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── 헬퍼 함수 ───────────────────────────────────────────────

function getRecentMetrics(matches: any[]) {
  const games = matches.length;
  const wins = matches.filter((m) => m.participant?.win).length;
  const kills = matches.reduce((s, m) => s + (m.participant?.kills ?? 0), 0);
  const deaths = matches.reduce((s, m) => s + (m.participant?.deaths ?? 0), 0);
  const assists = matches.reduce((s, m) => s + (m.participant?.assists ?? 0), 0);
  return {
    games,
    winRate: games > 0 ? Math.round((wins / games) * 100) : 0,
    avgKda: games > 0 ? (deaths === 0 ? kills + assists : (kills + assists) / deaths) : 0,
    avgKills: games > 0 ? kills / games : 0,
    avgDeaths: games > 0 ? deaths / games : 0,
    avgAssists: games > 0 ? assists / games : 0,
  };
}

function formatTimeAgo(value?: string) {
  if (!value) return "";
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(diff / 60_000));
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}


export default function ProfilePage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading, fetchUser } = useAuthStore();
  const {
    accounts,
    selectedAccount,
    isLoading,
    fetchAccounts,
    setPrimaryAccount,
    syncAccount,
    selectAccount,
    deleteAccount,
  } = useRiotStore();
  const { championMap, fetchChampions } = useDdragonStore();
  const { myStatus, setStatus } = usePresence();

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<any>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingAccountId, setDeletingAccountId] = useState<string | null>(null);
  const { addToast } = useToast();
  const [profileData, setProfileData] = useState<any>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [positionStats, setPositionStats] = useState<any[]>([]);
  const [recentMatches, setRecentMatches] = useState<any[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [championStats, setChampionStats] = useState<any[]>([]);
  const [rankedChampStats, setRankedChampStats] = useState<any[]>([]);
  // 챔피언 검색 필터 (한글/영문 모두 지원)
  const [championFilter, setChampionFilter] = useState('');
  const [auctionStats, setAuctionStats] = useState<any>(null);
  const [rep, setRep] = useState<any>(null);

  // 프로필 인라인 편집
  const [editUsername, setEditUsername] = useState("");
  const [editBio, setEditBio] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [profileDirty, setProfileDirty] = useState(false);

  const fetchProfile = useCallback(async () => {
    if (!user?.id) return;
    setProfileLoading(true);
    try {
      const data = await userApi.getProfile(user.id);
      setProfileData(data);
    } catch {
      // Profile data is supplementary, don't block on error
    } finally {
      setProfileLoading(false);
    }
  }, [user?.id]);

  // user가 로드되면 편집 필드 초기화
  useEffect(() => {
    if (user) {
      setEditUsername(user.username || "");
      setEditBio(user.bio || "");
      setProfileDirty(false);
    }
  }, [user]);

  const handleUsernameChange = (val: string) => {
    setEditUsername(val);
    setProfileDirty(val !== (user?.username || "") || editBio !== (user?.bio || ""));
  };

  const handleBioChange = (val: string) => {
    setEditBio(val);
    setProfileDirty(editUsername !== (user?.username || "") || val !== (user?.bio || ""));
  };

  const handleSaveProfile = async () => {
    if (!editUsername.trim()) {
      addToast("사용자 이름을 입력해주세요.", "error");
      return;
    }
    setIsSaving(true);
    try {
      await userApi.updateProfile({ username: editUsername.trim(), bio: editBio.trim() });
      await fetchUser();
      await fetchProfile();
      setProfileDirty(false);
      addToast("프로필이 저장되었습니다.", "success");
    } catch {
      addToast("프로필 저장에 실패했습니다.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.match(/^image\/(jpeg|jpg|png|gif|webp)$/)) {
      addToast("지원하지 않는 이미지 형식입니다. (jpg, png, gif, webp만 가능)", "error");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      addToast("이미지 크기는 5MB 이하여야 합니다.", "error");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => setAvatarPreview(event.target?.result as string);
    reader.readAsDataURL(file);

    setIsUploadingAvatar(true);
    try {
      const response = await userApi.uploadAvatar(file);
      if (response.avatarUrl) {
        setAvatarPreview(response.avatarUrl);
      }
      await fetchUser();
      addToast("프로필 사진이 변경되었습니다.", "success");
    } catch {
      addToast("프로필 사진 업로드에 실패했습니다.", "error");
      setAvatarPreview(null);
    } finally {
      setIsUploadingAvatar(false);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  };

  const fetchPositionStats = useCallback(async () => {
    if (!user?.id) return;
    try {
      const data = await statsApi.getUserPositionStats(user.id);
      setPositionStats(data || []);
    } catch {
      // Not critical
    }
  }, [user?.id]);

  const fetchRecentMatches = useCallback(async () => {
    setMatchesLoading(true);
    try {
      const data = await matchApi.getUserMatches({ limit: 5 });
      setRecentMatches(data);
    } catch {
      addToast('최근 내전 기록을 불러오지 못했습니다.', 'error');
    } finally {
      setMatchesLoading(false);
    }
  }, [addToast]);

  const fetchChampionStats = useCallback(async () => {
    if (!user?.id) return;
    try {
      const data = await statsApi.getUserChampionStats(user.id);
      setChampionStats(data.slice(0, 5));
    } catch {
      // Not critical
    }
  }, [user?.id]);

  const fetchRankedChampStats = useCallback(async () => {
    if (!profileData?.riotAccounts) return;
    const primary = profileData.riotAccounts.find((a: any) => a.isPrimary) || profileData.riotAccounts[0];
    if (!primary?.gameName || !primary?.tagLine) return;
    try {
      const data = await statsApi.getRankedChampionStats(primary.gameName, primary.tagLine);
      setRankedChampStats((data || []).slice(0, 5));
    } catch {
      // Not critical
    }
  }, [profileData?.riotAccounts]);

  const fetchAuctionStats = useCallback(async () => {
    if (!user?.id) return;
    try {
      const data = await statsApi.getUserAuctionStats(user.id);
      setAuctionStats(data);
    } catch {
      // Not critical
    }
  }, [user?.id]);

  const fetchReputation = useCallback(async () => {
    if (!user?.id) return;
    try {
      const data = await reputationApi.getUserStats(user.id);
      setRep(data);
    } catch {
      // Not critical
    }
  }, [user?.id]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/auth/login');
      return;
    }

    if (isAuthenticated) {
      fetchAccounts();
      fetchProfile();
      fetchPositionStats();
      fetchRecentMatches();
      fetchChampions();
      fetchChampionStats();
      fetchAuctionStats();
      fetchReputation();
    }
  }, [isAuthenticated, authLoading, fetchAccounts, fetchProfile, fetchPositionStats, fetchRecentMatches, fetchChampions, fetchChampionStats, fetchAuctionStats, fetchReputation, router]);

  // Fetch data that depends on profileData (riotAccounts)
  useEffect(() => {
    if (profileData?.riotAccounts?.length) {
      fetchRankedChampStats();
    }
  }, [profileData?.riotAccounts, fetchRankedChampStats]);

  const [syncingAccountId, setSyncingAccountId] = useState<string | null>(null);

  const handleSetPrimary = async (accountId: string) => {
    try {
      await setPrimaryAccount(accountId);
      await fetchUser();
      fetchProfile();
      addToast('대표 계정이 변경되었습니다.', 'success');
    } catch {
      addToast('대표 계정 설정에 실패했습니다.', 'error');
    }
  };

  const handleSync = async (accountId: string) => {
    setSyncingAccountId(accountId);
    try {
      await syncAccount(accountId);
      await fetchUser();
      fetchProfile();
    } catch {
      addToast('계정 동기화에 실패했습니다.', 'error');
    } finally {
      setSyncingAccountId(null);
    }
  };

  const handleDelete = async (accountId: string) => {
    setDeletingAccountId(accountId);
    try {
      await deleteAccount(accountId);
      addToast('계정이 삭제되었습니다.', 'success');
      await fetchUser();
      fetchProfile();
    } catch {
      addToast('계정 삭제에 실패했습니다.', 'error');
    } finally {
      setDeletingAccountId(null);
    }
  };

  // Get champion name from championId (key) — returns Korean name
  const getChampionName = (championId: string): string => {
    const champ = championMap.get(championId);
    if (!champ?.name) return championId;
    // 영문 이름을 한글로 변환
    const koreanName = getChampionKoreanName(champ.name);
    return koreanName || champ.name;
  };

  const getChampionKey = (championId: string): string => {
    const champ = championMap.get(championId);
    return champ?.id || championId;
  };

  // Get preferred champions grouped by role from profile data
  const getPreferredChampionsByRole = () => {
    if (!profileData?.riotAccounts) return [];

    const primary = profileData.riotAccounts.find((a: any) => a.isPrimary) || profileData.riotAccounts[0];
    if (!primary?.championPreferences?.length) return [];

    const grouped: Record<string, { championId: string; order: number }[]> = {};
    for (const pref of primary.championPreferences) {
      if (!grouped[pref.role]) grouped[pref.role] = [];
      grouped[pref.role].push({ championId: pref.championId, order: pref.order });
    }

    // Sort each group by order
    for (const role of Object.keys(grouped)) {
      grouped[role].sort((a, b) => a.order - b.order);
    }

    // Order by mainRole first, then subRole, then others
    const roleOrder: string[] = [];
    if (primary.mainRole) roleOrder.push(primary.mainRole);
    if (primary.subRole && primary.subRole !== primary.mainRole) roleOrder.push(primary.subRole);
    for (const role of Object.keys(grouped)) {
      if (!roleOrder.includes(role)) roleOrder.push(role);
    }

    return roleOrder
      .filter(role => grouped[role]?.length)
      .map(role => ({ role, champions: grouped[role] }));
  };

  if (authLoading || isLoading || !user) {
    return (
      <div className="flex-grow p-4 md:p-8 animate-fade-in">
        <div className="container mx-auto max-w-6xl">
          {/* 프로필 히어로 스켈레톤 */}
          <Card className="mb-6">
            <CardContent className="p-6 md:p-8">
              <div className="flex flex-col md:flex-row items-start gap-6">
                <Skeleton className="w-24 h-24 md:w-28 md:h-28 rounded-full flex-shrink-0" />
                <div className="flex-1 space-y-3 w-full">
                  <Skeleton className="h-8 w-48" />
                  <Skeleton className="h-4 w-72" />
                  <div className="flex gap-3">
                    <Skeleton className="h-5 w-24" />
                    <Skeleton className="h-5 w-20" />
                    <Skeleton className="h-5 w-28" />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 내전 통계 + 계정 스켈레톤 */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <Skeleton className="h-6 w-40" />
                </CardHeader>
                <CardContent className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-20 w-full rounded-lg" />
                  ))}
                </CardContent>
              </Card>
            </div>
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <Skeleton className="h-6 w-24" />
                </CardHeader>
                <CardContent className="space-y-3">
                  {[1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="h-12 w-full rounded-lg" />
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>

          {/* 최근 활동 스켈레톤 */}
          <div className="mt-6">
            <Card>
              <CardHeader>
                <Skeleton className="h-6 w-28" />
              </CardHeader>
              <CardContent className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-lg" />
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  const primary = profileData?.riotAccounts?.find((a: any) => a.isPrimary) || profileData?.riotAccounts?.[0];
  const displayAccounts = accounts.length > 0
    ? accounts
    : (profileData?.riotAccounts?.length
        ? profileData.riotAccounts
        : user?.riotAccounts ?? []);
  const clan = profileData?.clanMemberships?.[0]?.clan;
  const preferredChampions = getPreferredChampionsByRole();
  const highlightChampionId = profileData?.settings?.highlightChampionId;
  const recent = getRecentMetrics(recentMatches);
  const stats = profileData?.stats ?? user?.stats ?? null;
  const streamerProfiles: StreamerProfile[] = profileData?.streamerProfiles ?? [];
  const streamerLinks: StreamerLink[] = profileData?.streamerLinks ?? [];

  return (
    <div className="flex-grow p-4 md:p-8">
      <div className="container mx-auto max-w-6xl">
        {/* Profile Hero Section */}
        <Card className="mb-4 overflow-hidden rounded-lg border-bg-tertiary bg-bg-secondary p-0 shadow-sm">
          <CardContent className="p-4 md:p-5">
            {profileLoading && !profileData ? (
              <div className="flex flex-col md:flex-row items-start gap-6">
                <Skeleton className="w-24 h-24 md:w-28 md:h-28 rounded-full flex-shrink-0" />
                <div className="flex-1 space-y-3">
                  <Skeleton className="h-8 w-48" />
                  <Skeleton className="h-4 w-72" />
                  <Skeleton className="h-4 w-56" />
                </div>
              </div>
            ) : (
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex min-w-0 flex-1 flex-col gap-4 sm:flex-row sm:items-start">
              {/* Avatar - 항상 클릭하여 변경 가능 */}
              <div className="flex-shrink-0 relative group cursor-pointer" onClick={() => avatarInputRef.current?.click()}>
                <div
                  className="relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-bg-tertiary md:h-24 md:w-24"
                  style={{ border: `2px solid ${PROFILE_ACCENT}88` }}
                >
                  {(avatarPreview || user.avatar) ? (
                    <Image
                      src={avatarPreview || user.avatar!}
                      alt={user.username}
                      fill
                      className="object-cover"
                      unoptimized
                    />
                  ) : (
                    <User className="h-12 w-12 text-text-tertiary" />
                  )}
                  {isUploadingAvatar && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <LoadingSpinner size="sm" />
                    </div>
                  )}
                  <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/0 transition-colors group-hover:bg-black/50">
                    <Camera className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                  onChange={handleAvatarChange}
                  className="hidden"
                />
              </div>

              {/* Info */}
              <div className="min-w-0 flex-1 pt-1">
                {/* 닉네임 */}
                <div className="mb-2 flex flex-wrap items-center gap-2 group/name">
                  <div className="inline-flex items-center gap-1.5">
                    <input
                      value={editUsername}
                      onChange={(e) => handleUsernameChange(e.target.value)}
                      style={{ width: `${Math.max([...editUsername].reduce((w, c) => w + (/[\uac00-\ud7af\u3000-\u9fff]/.test(c) ? 2 : 1), 0), 4) + 1}ch` }}
                      className="bg-transparent text-xl font-black leading-tight text-text-primary border-b border-transparent transition-colors hover:border-text-muted focus:border-accent-primary focus:outline-none md:text-2xl"
                      placeholder="사용자 이름"
                    />
                    <Pencil className="h-4 w-4 text-text-tertiary opacity-0 group-hover/name:opacity-100 transition-opacity pointer-events-none flex-shrink-0" />
                  </div>
                  {clan && (
                    <Badge
                      variant="primary"
                      size="sm"
                      className="cursor-pointer rounded-md border-0 px-2 py-1 text-xs font-black"
                      style={{ color: PROFILE_ACCENT, backgroundColor: `${PROFILE_ACCENT}22` }}
                      onClick={() => router.push(`/clans/${clan.id}`)}
                    >
                      {clan.tag}
                    </Badge>
                  )}
                  {streamerProfiles.length > 0 && (
                    <a href={streamerProfiles[0].channelUrl} target="_blank" rel="noreferrer">
                      <Badge variant="gold" size="sm" className="rounded-md px-2 py-1 text-xs font-black">
                        streamer
                      </Badge>
                    </a>
                  )}
                </div>

                {/* 자기소개 */}
                <div className="mb-3 inline-flex max-w-2xl items-start gap-1.5 group/bio">
                  <textarea
                    value={editBio}
                    onChange={(e) => handleBioChange(e.target.value)}
                    rows={1}
                    style={{ width: `${Math.max([...(editBio || '')].reduce((w, c) => w + (/[\uac00-\ud7af\u3000-\u9fff]/.test(c) ? 2 : 1), 0), 18) + 2}ch`, maxWidth: '100%' }}
                    className="resize-none bg-transparent text-sm text-text-secondary border-b border-transparent transition-colors placeholder:text-text-tertiary placeholder:italic hover:border-text-muted focus:border-accent-primary focus:outline-none"
                    placeholder="자기소개를 입력하세요"
                  />
                  <Pencil className="h-3.5 w-3.5 mt-1 text-text-tertiary opacity-0 group-hover/bio:opacity-100 transition-opacity pointer-events-none flex-shrink-0" />
                </div>

                {/* Meta info row — 2-column grid with tier/role emphasis */}
                <div className="space-y-4">
                  {/* 주라인 & 티어 — 데이터 있는 것만 flex-wrap으로 표시 */}
                  {primary && (primary.mainRole || primary.tier) && (
                    <div className="flex flex-wrap items-center gap-2">
                      {primary.mainRole && (
                        <div className="flex items-center gap-1.5 rounded-lg bg-bg-tertiary border border-bg-elevated px-2.5 py-1.5">
                          <PositionIcon position={primary.mainRole} className="!h-4 !w-4" />
                          <span className="text-xs font-bold text-text-primary">{POSITION_LABELS[primary.mainRole] ?? ROLE_LABELS[primary.mainRole] ?? primary.mainRole}</span>
                          <span className="rounded bg-bg-elevated px-1 text-[9px] font-black text-text-tertiary">주</span>
                        </div>
                      )}
                      {primary.subRole && (
                        <div className="flex items-center gap-1.5 rounded-lg bg-bg-tertiary border border-bg-elevated px-2.5 py-1.5">
                          <PositionIcon position={primary.subRole} className="!h-4 !w-4" opacity={0.6} />
                          <span className="text-xs font-semibold text-text-secondary">{POSITION_LABELS[primary.subRole] ?? ROLE_LABELS[primary.subRole] ?? primary.subRole}</span>
                          <span className="rounded bg-bg-elevated px-1 text-[9px] font-black text-text-tertiary">부</span>
                        </div>
                      )}
                      {primary.tier && (
                        <div className="flex items-center gap-2">
                          <TierBadge tier={primary.tier} size="md" />
                          <div className="text-sm">
                            {primary.rank && <span className="font-medium text-text-primary">{primary.rank}</span>}
                            {primary.lp && <span className="text-text-secondary ml-1">{primary.lp}LP</span>}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 아래: 게임명 · 최고 티어 · 가입일 — 모바일에서 2줄 */}
                  <div className="flex flex-col gap-1.5 text-xs text-text-tertiary">
                    {/* 첫째 줄: 상태 · 게임명 · 태그 */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <StatusSelector
                        currentStatus={myStatus}
                        onStatusChange={(status) => setStatus(status)}
                      />
                      {primary && (
                        <>
                          <span className="font-medium text-text-secondary">{primary.gameName}</span>
                          <span>#{primary.tagLine}</span>
                        </>
                      )}
                      {highlightChampionId && (
                        <>
                          <span>·</span>
                          <ChampionImage championKey={getChampionKey(highlightChampionId)} size={14} className="rounded" />
                          <span className="text-accent-gold">{getChampionName(highlightChampionId)}</span>
                        </>
                      )}
                    </div>
                    {/* 둘째 줄: 최고 티어 · 가입일 */}
                    {primary && (
                      <div className="flex items-center gap-2 flex-wrap">
                        {primary.peakTier && (
                          <>
                            <span>최고 {primary.peakTier}{primary.peakRank ? ` ${primary.peakRank}` : ''}</span>
                            <span>·</span>
                          </>
                        )}
                        <Calendar className="h-3 w-3 flex-shrink-0" />
                        <span>{new Date(profileData?.createdAt || user.createdAt).toLocaleDateString('ko-KR')} 가입</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              </div>

              {/* 저장 / 공개 프로필 / 설정 버튼 */}
              <div className="flex w-full flex-shrink-0 flex-wrap gap-2 sm:w-auto lg:justify-end">
                {profileDirty && (
                  <Button size="sm" onClick={handleSaveProfile} isLoading={isSaving}>
                    <Check className="h-4 w-4 mr-1" />
                    저장
                  </Button>
                )}
                {user?.id && (
                  <Button variant="ghost" size="sm" onClick={() => router.push(`/users/${user.id}`)}>
                    내 공개 프로필 →
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => router.push('/settings')}>
                  <Settings className="h-4 w-4 mr-1" />
                  설정
                </Button>
              </div>
            </div>
            )}
          </CardContent>
        </Card>

        <div className="mb-6 grid gap-4 lg:grid-cols-2">
          <StreamerRegistrationCard
            profiles={streamerProfiles}
            onSaved={fetchProfile}
            addToast={addToast}
          />

          <StreamerLinksCard
            links={streamerLinks}
            onSaved={fetchProfile}
            addToast={addToast}
          />
        </div>

        {/* ── 요약 스탯 칩 (전적/승률/KDA) ── */}
        {stats && (
          <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <SummaryChip
              icon={Activity}
              label="전적"
              value={`${stats.wins ?? 0}승 ${stats.losses ?? 0}패`}
              detail={`${stats.gamesPlayed ?? 0}게임 · 참여 ${stats.participations ?? 0}회`}
            />
            <SummaryChip
              icon={TrendingUp}
              label="승률"
              value={(stats.gamesPlayed ?? 0) > 0 ? `${Number(stats.winRate).toFixed(0)}%` : "-"}
              detail={(stats.gamesPlayed ?? 0) > 0 ? `${stats.wins}승 ${stats.losses}패` : "전적 없음"}
              side={recentMatches.length > 0 ? <WinRateSparkline matches={recentMatches} /> : undefined}
              valueClassName={(stats.winRate ?? 0) >= 50 ? "text-accent-success" : "text-accent-danger"}
            />
            <SummaryChip
              icon={Activity}
              label="최근 KDA"
              value={recent.games > 0 ? recent.avgKda.toFixed(2) : "-"}
              detail={
                recent.games > 0
                  ? `${recent.avgKills.toFixed(1)} / ${recent.avgDeaths.toFixed(1)} / ${recent.avgAssists.toFixed(1)}`
                  : "최근 기록 없음"
              }
            />
          </div>
        )}

        {/* Champions Tabbed Section */}
        {(preferredChampions.length > 0 || championStats.length > 0 || rankedChampStats.length > 0) && (
          <Card className="mb-6">
            <CardContent className="p-6 md:p-8">
              <Tabs defaultValue={championStats.length > 0 ? 'auto-stats' : preferredChampions.length > 0 ? 'preferred' : 'ranked'}>
                <TabsList className="mb-6">
                  {championStats.length > 0 && (
                    <TabsTrigger value="auto-stats">
                      <BarChart3 className="h-4 w-4 mr-2" />
                      내전 모스트
                    </TabsTrigger>
                  )}
                  {preferredChampions.length > 0 && (
                    <TabsTrigger value="preferred">
                      <Target className="h-4 w-4 mr-2" />
                      선호 포지션
                    </TabsTrigger>
                  )}
                  {rankedChampStats.length > 0 && (
                    <TabsTrigger value="ranked">
                      <Trophy className="h-4 w-4 mr-2" />
                      랭크 모스트
                    </TabsTrigger>
                  )}
                </TabsList>

                {/* 내전 모스트 탭 */}
                {championStats.length > 0 && (
                  <TabsContent value="auto-stats" className="space-y-4">
                    {/* 챔피언 검색 필터 입력창 */}
                    <input
                      type="text"
                      placeholder="챔피언 검색 (한글/영문)"
                      value={championFilter}
                      onChange={e => setChampionFilter(e.target.value)}
                      className="w-full max-w-xs px-3 py-1.5 text-sm rounded-md bg-bg-secondary border border-border-default text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-primary transition-colors"
                    />
                    {/* 필터 결과가 없을 경우 안내 메시지 */}
                    {championFilter.trim() && searchChampionsByQuery(championFilter).length === 0 && (
                      <p className="text-sm text-text-tertiary">검색 결과가 없습니다.</p>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                      {(championFilter.trim()
                        ? championStats.filter(s =>
                            searchChampionsByQuery(championFilter).includes(s.championName)
                          )
                        : championStats
                      ).map((champ: any, idx: number) => {
                        const winRate = champ.games > 0 ? ((champ.wins / champ.games) * 100).toFixed(0) : '0';
                        const kda = champ.deaths > 0
                          ? ((champ.kills + champ.assists) / champ.deaths).toFixed(2)
                          : 'Perfect';
                        return (
                          <div key={champ.championId} className="flex items-center gap-3 bg-bg-tertiary border border-bg-elevated rounded-lg p-3">
                            <div className="relative">
                              <ChampionImage
                                championKey={champ.championName || getChampionKey(String(champ.championId))}
                                size={40}
                                className="rounded-md"
                              />
                              {idx === 0 && (
                                <div className="absolute -top-1 -right-1 bg-accent-gold text-bg-primary text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                                  1
                                </div>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-text-primary truncate">
                                {getChampionKoreanName(champ.championName || getChampionName(String(champ.championId)))}
                              </p>
                              <div className="flex items-center gap-2 text-xs text-text-tertiary">
                                <span>{champ.games}게임</span>
                                <span className={Number(winRate) >= 50 ? 'text-accent-success' : 'text-accent-danger'}>
                                  {winRate}%
                                </span>
                                <span>{kda} KDA</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </TabsContent>
                )}

                {/* 선호 포지션 탭 */}
                {preferredChampions.length > 0 && (
                  <TabsContent value="preferred" className="space-y-4">
                    {preferredChampions.map(({ role, champions: champs }) => (
                      <div key={role}>
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant="default" size="sm">{ROLE_LABELS[role] ?? role}</Badge>
                        </div>
                        <div className="flex flex-wrap gap-3">
                          {champs.map(({ championId }) => (
                            <div key={championId} className="flex items-center gap-2 bg-bg-tertiary border border-bg-elevated rounded-lg px-3 py-2">
                              <ChampionImage
                                championKey={getChampionKey(championId)}
                                size={32}
                                className="rounded-md"
                              />
                              <span className="text-sm font-medium text-text-primary">
                                {getChampionName(championId)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </TabsContent>
                )}

                {/* 랭크 모스트 탭 */}
                {rankedChampStats.length > 0 && (
                  <TabsContent value="ranked" className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                      {rankedChampStats.map((champ: any, idx: number) => {
                        const winRate = champ.games > 0 ? ((champ.wins / champ.games) * 100).toFixed(0) : '0';
                        const kda = champ.deaths > 0
                          ? ((champ.kills + champ.assists) / champ.deaths).toFixed(2)
                          : 'Perfect';
                        return (
                          <div key={champ.championName} className="flex items-center gap-3 bg-bg-tertiary border border-bg-elevated rounded-lg p-3">
                            <div className="relative">
                              <ChampionImage
                                championKey={champ.championName}
                                size={40}
                                className="rounded-md"
                              />
                              {idx === 0 && (
                                <div className="absolute -top-1 -right-1 bg-accent-gold text-bg-primary text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                                  1
                                </div>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-text-primary truncate">
                                {getChampionKoreanName(champ.championName)}
                              </p>
                              <div className="flex items-center gap-2 text-xs text-text-tertiary">
                                <span>{champ.games}게임</span>
                                <span className={Number(winRate) >= 50 ? 'text-accent-success' : 'text-accent-danger'}>
                                  {winRate}%
                                </span>
                                <span>{kda} KDA</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </TabsContent>
                )}
              </Tabs>
            </CardContent>
          </Card>
        )}

        {/* Auction Stats */}
        {auctionStats && (auctionStats.captainCount > 0 || auctionStats.totalAuctions > 0) && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Gavel className="h-5 w-5 text-accent-warning" />
                내전 경매 기록
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                <div className="bg-bg-tertiary rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-accent-primary">{auctionStats.captainCount}</p>
                  <p className="text-xs text-text-tertiary mt-1">팀장 횟수</p>
                </div>
                <div className="bg-bg-tertiary rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-text-primary">{auctionStats.totalAuctions}</p>
                  <p className="text-xs text-text-tertiary mt-1">경매 등장</p>
                </div>
                <div className="bg-bg-tertiary rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-accent-success">{auctionStats.avgSoldPrice > 0 ? auctionStats.avgSoldPrice : '-'}</p>
                  <p className="text-xs text-text-tertiary mt-1">평균 낙찰가</p>
                </div>
                <div className="bg-bg-tertiary rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-accent-warning">{auctionStats.maxSoldPrice > 0 ? auctionStats.maxSoldPrice : '-'}</p>
                  <p className="text-xs text-text-tertiary mt-1">최고 낙찰가</p>
                </div>
              </div>
              {auctionStats.titles.length > 0 && (
                <div>
                  <p className="text-xs text-text-tertiary mb-2 font-medium uppercase tracking-wide">획득 칭호</p>
                  <div className="flex flex-wrap gap-2">
                    {auctionStats.titles.map((t: any) => (
                      <span
                        key={t.key}
                        title={t.description}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-accent-warning/10 text-accent-warning border border-accent-warning/30 cursor-default"
                      >
                        <Star className="h-3 w-3" />
                        {t.label}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {auctionStats.yuchalCount > 0 && (
                <p className="text-xs text-text-tertiary mt-3">유찰 {auctionStats.yuchalCount}회</p>
              )}
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Riot Accounts Section */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-accent-primary" />
                  연동된 Riot 계정
                </CardTitle>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setShowAddModal(true)}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  계정 추가
                </Button>
              </CardHeader>
              <CardContent>
                {displayAccounts.length === 0 ? (
                  <div className="text-center py-12">
                    <Shield className="h-12 w-12 mx-auto mb-4 text-text-tertiary" />
                    <p className="text-text-secondary mb-4">
                      연동된 Riot 계정이 없습니다
                    </p>
                    <Button
                      variant="primary"
                      onClick={() => setShowAddModal(true)}
                    >
                      첫 계정 연동하기
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {displayAccounts.map((account: any) => (
                      <div
                        key={account.id}
                        className={`p-4 rounded-lg border-2 transition-all ${
                          selectedAccount?.id === account.id
                            ? 'border-accent-primary bg-accent-primary/5'
                            : 'border-bg-tertiary bg-bg-tertiary hover:border-accent-primary/50'
                        } cursor-pointer`}
                        onClick={() => selectAccount(account)}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            {/* Primary Star */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!account.isPrimary) {
                                  handleSetPrimary(account.id);
                                }
                              }}
                              className={`p-1 rounded transition-colors flex-shrink-0 ${
                                account.isPrimary
                                  ? 'text-accent-gold'
                                  : 'text-text-tertiary hover:text-accent-gold'
                              }`}
                              title={account.isPrimary ? '대표 계정' : '대표 계정으로 설정'}
                            >
                              <Star
                                className="h-5 w-5"
                                fill={account.isPrimary ? 'currentColor' : 'none'}
                              />
                            </button>

                            {/* Account Info */}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 min-w-0 overflow-hidden">
                                {/* 이름은 항상 전체 노출(축약 안 함), 공간이 부족하면 태그가 먼저 가려짐 */}
                                <span className="font-bold text-text-primary whitespace-nowrap flex-shrink-0">
                                  {account.gameName}
                                </span>
                                <span className="text-text-tertiary truncate min-w-0">
                                  #{account.tagLine}
                                </span>
                                {account.isPrimary && (
                                  <Badge variant="primary" size="sm" className="flex-shrink-0">
                                    대표
                                  </Badge>
                                )}
                              </div>
                              {/* 티어·랭크·LP는 한 줄 유지(줄바꿈 X), '(최고…)'만 공간 부족 시 축약 */}
                              <div className="flex items-center gap-2 mt-1 min-w-0">
                                <TierBadge tier={account.tier} size="sm" />
                                <span className="text-sm text-text-secondary whitespace-nowrap flex-shrink-0">
                                  {account.rank} • {account.lp} LP
                                </span>
                                {account.peakTier && (
                                  <span className="text-xs text-text-tertiary truncate min-w-0">
                                    (최고 <span className="text-accent-gold">{account.peakTier} {account.peakRank || ''}</span>)
                                  </span>
                                )}
                              </div>
                              {account.lastSyncedAt && (
                                <p className="text-[11px] text-text-tertiary mt-1">
                                  마지막 동기화: {new Date(account.lastSyncedAt).toLocaleDateString('ko-KR')}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Action Buttons — 데스크톱: 인라인 / 모바일: 케밥(...) 메뉴로 묶어 이름 공간 확보 */}
                          <div className="hidden sm:flex items-center gap-1 flex-shrink-0">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSync(account.id);
                              }}
                              className="p-2 hover:bg-bg-elevated rounded-lg transition-colors"
                              title="티어 동기화"
                              disabled={syncingAccountId === account.id}
                            >
                              {syncingAccountId === account.id ? (
                                <Loader2 className="h-4 w-4 animate-spin text-text-secondary" />
                              ) : (
                                <RefreshCw className="h-4 w-4 text-text-secondary" />
                              )}
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingAccount(account);
                                setShowEditModal(true);
                              }}
                              className="p-2 hover:bg-bg-elevated rounded-lg transition-colors"
                              title="계정 수정"
                            >
                              <Pencil className="h-4 w-4 text-text-secondary" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmDeleteId(account.id);
                              }}
                              className="p-2 hover:bg-bg-elevated rounded-lg transition-colors"
                              title="계정 삭제"
                              disabled={deletingAccountId === account.id}
                            >
                              {deletingAccountId === account.id ? (
                                <Loader2 className="h-4 w-4 animate-spin text-accent-danger" />
                              ) : (
                                <Trash2 className="h-4 w-4 text-text-secondary hover:text-accent-danger" />
                              )}
                            </button>
                          </div>

                          {/* 모바일 전용 케밥 메뉴 */}
                          <div
                            className="sm:hidden flex-shrink-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Dropdown
                              align="right"
                              trigger={
                                <button
                                  className="p-2 hover:bg-bg-elevated rounded-lg transition-colors"
                                  title="계정 관리"
                                >
                                  {(syncingAccountId === account.id || deletingAccountId === account.id) ? (
                                    <Loader2 className="h-5 w-5 animate-spin text-text-secondary" />
                                  ) : (
                                    <MoreVertical className="h-5 w-5 text-text-secondary" />
                                  )}
                                </button>
                              }
                              items={[
                                {
                                  key: 'sync',
                                  label: '티어 동기화',
                                  icon: <RefreshCw className="h-4 w-4" />,
                                  disabled: syncingAccountId === account.id,
                                  onClick: () => handleSync(account.id),
                                },
                                {
                                  key: 'edit',
                                  label: '계정 수정',
                                  icon: <Pencil className="h-4 w-4" />,
                                  onClick: () => {
                                    setEditingAccount(account);
                                    setShowEditModal(true);
                                  },
                                },
                                {
                                  key: 'delete',
                                  label: '계정 삭제',
                                  icon: <Trash2 className="h-4 w-4" />,
                                  danger: true,
                                  disabled: deletingAccountId === account.id,
                                  onClick: () => setConfirmDeleteId(account.id),
                                },
                              ]}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Stats Section */}
          <div className="lg:col-span-1 space-y-6">
            {/* 평판 카드 */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Star className="h-5 w-5 text-accent-gold" />
                  평판
                </CardTitle>
              </CardHeader>
              <CardContent>
                {rep ? (
                  <ReputationSummary stats={rep} />
                ) : (
                  <div className="space-y-3">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-full" />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 포지션별 통계 */}
            {positionStats.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Swords className="h-5 w-5 text-accent-primary" />
                    포지션별 통계
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {positionStats.map((pos: any) => {
                    const wr = pos.games > 0 ? ((pos.wins / pos.games) * 100).toFixed(0) : '0';
                    const kda = pos.deaths > 0
                      ? ((pos.kills + pos.assists) / pos.deaths).toFixed(2)
                      : 'Perfect';
                    return (
                      <div key={pos.position} className="flex items-center justify-between p-2.5 bg-bg-tertiary rounded-lg border border-bg-elevated">
                        <div className="flex items-center gap-2">
                          <PositionIcon position={pos.position} className="!h-4 !w-4" />
                          <div>
                            <span className="text-xs font-bold text-text-primary">{POSITION_LABELS[pos.position] ?? pos.position}</span>
                            <span className="ml-1.5 text-[10px] text-text-tertiary">{pos.games}게임</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 text-xs">
                          <span className={Number(wr) >= 50 ? 'text-accent-success font-medium' : 'text-accent-danger font-medium'}>
                            {wr}%
                          </span>
                          <span className="text-text-secondary">{kda} KDA</span>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Recent Activity Section */}
        <div className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5 text-accent-primary" />
                최근 활동
              </CardTitle>
            </CardHeader>
            <CardContent>
              {matchesLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : recentMatches.length > 0 ? (
                <div className="space-y-3">
                  {recentMatches.map((match: any) => {
                    const myTeam = match.teamA?.members?.find((m: any) => m.userId === user?.id)
                      ? match.teamA
                      : match.teamB?.members?.find((m: any) => m.userId === user?.id)
                        ? match.teamB
                        : null;
                    const isWin = match.status === 'COMPLETED' && myTeam && match.winner?.id === myTeam.id;
                    const isLoss = match.status === 'COMPLETED' && myTeam && match.winner && match.winner.id !== myTeam.id;
                    const champKey = match.participant?.championName ?? match.participant?.champion;
                    const champIcon = champKey ? getChampionIcon(champKey) : null;
                    const k = match.participant?.kills ?? null;
                    const d = match.participant?.deaths ?? null;
                    const a = match.participant?.assists ?? null;
                    const hasKda = k !== null && d !== null && a !== null;

                    return (
                      <div
                        key={match.id}
                        className="flex items-center gap-3 p-3 bg-bg-tertiary border border-bg-elevated rounded-lg hover:bg-bg-elevated transition-colors cursor-pointer"
                        onClick={() => router.push(`/matches/match/${match.id}`)}
                      >
                        {/* 승/패 인디케이터 */}
                        {match.status === 'COMPLETED' && (
                          <div className={`w-1 self-stretch rounded-full shrink-0 ${isWin ? 'bg-accent-success' : isLoss ? 'bg-accent-danger' : 'bg-text-tertiary'}`} />
                        )}
                        {/* 챔피언 아이콘 */}
                        {champIcon ? (
                          <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border-2 border-bg-elevated">
                            <Image src={champIcon} alt={champKey ?? ''} fill className="object-cover" unoptimized />
                          </div>
                        ) : (
                          <div className="h-10 w-10 shrink-0 rounded-full bg-bg-elevated flex items-center justify-center">
                            <Swords className="h-4 w-4 text-text-tertiary" />
                          </div>
                        )}
                        {/* 메인 정보 */}
                        <div className="flex flex-1 flex-col gap-0.5 min-w-0">
                          <p className="text-sm font-semibold text-text-primary truncate">
                            {match.teamA?.name ?? 'Team A'} vs {match.teamB?.name ?? 'Team B'}
                          </p>
                          <p className="text-xs text-text-tertiary flex items-center gap-1">
                            <Clock className="h-3 w-3 shrink-0" />
                            {formatTimeAgo(match.createdAt)}
                          </p>
                        </div>
                        {/* K/D/A + 뱃지 */}
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          {match.status === 'COMPLETED' && myTeam && (
                            <Badge variant={isWin ? 'success' : 'danger'} size="sm">
                              {isWin ? '승리' : '패배'}
                            </Badge>
                          )}
                          {match.status !== 'COMPLETED' && (
                            <Badge variant={match.status === 'IN_PROGRESS' ? 'primary' : 'default'} size="sm">
                              {match.status === 'IN_PROGRESS' ? '진행 중' : '대기'}
                            </Badge>
                          )}
                          {hasKda && (
                            <div className="flex items-center gap-0.5 text-[11px] font-mono">
                              <span className="text-accent-success font-bold">{k}</span>
                              <span className="text-text-tertiary">/</span>
                              <span className="text-accent-danger font-bold">{d}</span>
                              <span className="text-text-tertiary">/</span>
                              <span className="text-accent-info font-bold">{a}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState
                  icon={History}
                  title="아직 활동 내역이 없습니다"
                  description="내전에 참여하면 여기에 활동 내역이 표시됩니다"
                  action={{
                    label: "내전 참여하기",
                    onClick: () => router.push("/tournaments"),
                  }}
                />
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Add Account Modal */}
      <AddAccountModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAccountAdded={() => {
          fetchAccounts();
          fetchUser();
          fetchProfile();
          setShowAddModal(false);
        }}
      />

      {/* Edit Account Modal */}
      <EditAccountModal
        isOpen={showEditModal}
        onClose={() => { setShowEditModal(false); setEditingAccount(null); }}
        onAccountUpdated={() => {
          fetchAccounts();
          fetchUser();
          fetchProfile();
        }}
        account={editingAccount}
      />

      {/* Delete Account Confirmation */}
      <ConfirmModal
        isOpen={!!confirmDeleteId}
        onClose={() => setConfirmDeleteId(null)}
        onConfirm={async () => {
          if (confirmDeleteId) {
            const id = confirmDeleteId;
            setConfirmDeleteId(null);
            await handleDelete(id);
          }
        }}
        title="계정 삭제"
        message="이 Riot 계정을 삭제하시겠습니까? 삭제 후 복구할 수 없습니다."
        confirmText="삭제"
        cancelText="취소"
        variant="danger"
        isLoading={!!deletingAccountId}
      />
    </div>
  );
}
