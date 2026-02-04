"use client";

import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Switch } from '@/components/ui/Switch';
import { Loader2, Users, Lock, Unlock, Gavel, ListOrdered, Trophy, Info, Eye, EyeOff } from 'lucide-react';
import { RoomSettingsDto, useLobbyStore } from '@/stores/lobby-store';

type TeamMode = "AUCTION" | "SNAKE_DRAFT";

interface RoomSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  room: {
    id: string;
    name: string;
    maxParticipants: number;
    isPrivate: boolean;
    teamMode: TeamMode;
    allowSpectators?: boolean;
    startingPoints?: number;
    minBidIncrement?: number;
    bidTimeLimit?: number;
    pickTimeLimit?: number;
    captainSelection?: "RANDOM" | "TIER";
  };
}

const TEAM_MODES: { value: TeamMode; label: string; description: string; icon: React.ReactNode }[] = [
  {
    value: "AUCTION",
    label: "경매 드래프트",
    description: "팀장이 포인트를 사용해 선수를 입찰",
    icon: <Gavel className="w-4 h-4" />,
  },
  {
    value: "SNAKE_DRAFT",
    label: "스네이크 드래프트",
    description: "팀장이 번갈아가며 선수를 선택",
    icon: <ListOrdered className="w-4 h-4" />,
  },
];

const PLAYER_OPTIONS = [
  { value: 10, label: "10명", description: "5 vs 5" },
  { value: 15, label: "15명", description: "3팀" },
  { value: 20, label: "20명", description: "4팀" },
];

export function RoomSettingsModal({ isOpen, onClose, room }: RoomSettingsModalProps) {
  const { updateRoomSettings } = useLobbyStore();

  // Basic settings
  const [name, setName] = useState(room.name);
  const [maxParticipants, setMaxParticipants] = useState(room.maxParticipants);
  const [isPrivate, setIsPrivate] = useState(room.isPrivate);
  const [password, setPassword] = useState('');
  const [teamMode, setTeamMode] = useState<TeamMode>(room.teamMode);
  const [allowSpectators, setAllowSpectators] = useState(room.allowSpectators ?? true);

  // Auction settings
  const [startingPoints, setStartingPoints] = useState(room.startingPoints ?? 1000);
  const [minBidIncrement, setMinBidIncrement] = useState(room.minBidIncrement ?? 50);
  const [bidTimeLimit, setBidTimeLimit] = useState(room.bidTimeLimit ?? 30);

  // Snake draft settings
  const [pickTimeLimit, setPickTimeLimit] = useState(room.pickTimeLimit ?? 60);
  const [captainSelection, setCaptainSelection] = useState<"RANDOM" | "TIER">(room.captainSelection ?? "RANDOM");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setName(room.name);
      setMaxParticipants(room.maxParticipants);
      setIsPrivate(room.isPrivate);
      setPassword('');
      setTeamMode(room.teamMode);
      setAllowSpectators(room.allowSpectators ?? true);
      setStartingPoints(room.startingPoints ?? 1000);
      setMinBidIncrement(room.minBidIncrement ?? 50);
      setBidTimeLimit(room.bidTimeLimit ?? 30);
      setPickTimeLimit(room.pickTimeLimit ?? 60);
      setCaptainSelection(room.captainSelection ?? "RANDOM");
      setError(null);
    }
  }, [isOpen, room]);

  const handleSave = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      const settingsToUpdate: RoomSettingsDto = {
        name,
        maxParticipants,
        teamMode,
        allowSpectators,
        startingPoints,
        minBidIncrement,
        bidTimeLimit,
        pickTimeLimit,
        captainSelection,
      };

      if (isPrivate) {
        if (password) {
          settingsToUpdate.password = password;
        }
      } else {
        settingsToUpdate.password = null;
      }

      await updateRoomSettings(room.id, settingsToUpdate);
      onClose();
    } catch (err: any) {
      setError(err.message || '설정 저장에 실패했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="방 설정" size="lg">
      <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-2">
        {/* 기본 정보 */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
            <Info className="w-4 h-4" />
            기본 정보
          </h3>

          <div className="space-y-2">
            <Label htmlFor="name">방 제목</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={50}
            />
            <p className="text-text-tertiary text-xs">{name.length}/50자</p>
          </div>
        </div>

        {/* 참가 인원 */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
            <Users className="w-4 h-4" />
            참가 인원
          </h3>
          <div className="grid grid-cols-3 gap-2">
            {PLAYER_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setMaxParticipants(option.value)}
                className={`p-2 rounded-lg border-2 transition-all text-center ${
                  maxParticipants === option.value
                    ? "border-accent-primary bg-accent-primary/10"
                    : "border-bg-tertiary hover:border-bg-elevated bg-bg-tertiary/50"
                }`}
              >
                <div className="font-bold text-text-primary text-sm">{option.label}</div>
                <div className="text-xs text-text-secondary">{option.description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* 팀 구성 방식 */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
            <Trophy className="w-4 h-4" />
            팀 구성 방식
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {TEAM_MODES.map((mode) => (
              <button
                key={mode.value}
                type="button"
                onClick={() => setTeamMode(mode.value)}
                className={`p-3 rounded-lg border-2 transition-all text-left flex items-start gap-3 ${
                  teamMode === mode.value
                    ? "border-accent-primary bg-accent-primary/10"
                    : "border-bg-tertiary hover:border-bg-elevated bg-bg-tertiary/50"
                }`}
              >
                <div className={`p-1.5 rounded-lg ${teamMode === mode.value ? "bg-accent-primary text-white" : "bg-bg-elevated text-text-secondary"}`}>
                  {mode.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-text-primary text-sm">{mode.label}</div>
                  <div className="text-xs text-text-secondary truncate">{mode.description}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* 경매 드래프트 상세 설정 */}
        {teamMode === "AUCTION" && (
          <div className="p-4 bg-bg-tertiary/50 rounded-lg border border-bg-elevated space-y-4">
            <div className="flex items-center gap-2 text-text-primary font-semibold text-sm">
              <Gavel className="w-4 h-4" />
              경매 설정
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">시작 포인트</Label>
                <select
                  value={startingPoints}
                  onChange={(e) => setStartingPoints(Number(e.target.value))}
                  className="w-full p-2 border rounded-md bg-bg-secondary text-sm mt-1"
                >
                  <option value={500}>500 포인트</option>
                  <option value={1000}>1,000 포인트</option>
                  <option value={1500}>1,500 포인트</option>
                  <option value={2000}>2,000 포인트</option>
                </select>
              </div>
              <div>
                <Label className="text-xs">최소 입찰 단위</Label>
                <select
                  value={minBidIncrement}
                  onChange={(e) => setMinBidIncrement(Number(e.target.value))}
                  className="w-full p-2 border rounded-md bg-bg-secondary text-sm mt-1"
                >
                  <option value={10}>10 포인트</option>
                  <option value={25}>25 포인트</option>
                  <option value={50}>50 포인트</option>
                  <option value={100}>100 포인트</option>
                </select>
              </div>
            </div>

            <div>
              <Label className="text-xs">입찰 제한 시간</Label>
              <select
                value={bidTimeLimit}
                onChange={(e) => setBidTimeLimit(Number(e.target.value))}
                className="w-full p-2 border rounded-md bg-bg-secondary text-sm mt-1"
              >
                <option value={15}>15초</option>
                <option value={30}>30초</option>
                <option value={45}>45초</option>
                <option value={60}>60초</option>
              </select>
            </div>
          </div>
        )}

        {/* 스네이크 드래프트 상세 설정 */}
        {teamMode === "SNAKE_DRAFT" && (
          <div className="p-4 bg-bg-tertiary/50 rounded-lg border border-bg-elevated space-y-4">
            <div className="flex items-center gap-2 text-text-primary font-semibold text-sm">
              <ListOrdered className="w-4 h-4" />
              스네이크 드래프트 설정
            </div>

            <div>
              <Label className="text-xs">팀장 선정 방식</Label>
              <select
                value={captainSelection}
                onChange={(e) => setCaptainSelection(e.target.value as "RANDOM" | "TIER")}
                className="w-full p-2 border rounded-md bg-bg-secondary text-sm mt-1"
              >
                <option value="RANDOM">랜덤 선정</option>
                <option value="TIER">티어 기반 (높은 티어 우선)</option>
              </select>
            </div>

            <div>
              <Label className="text-xs">픽 제한 시간</Label>
              <select
                value={pickTimeLimit}
                onChange={(e) => setPickTimeLimit(Number(e.target.value))}
                className="w-full p-2 border rounded-md bg-bg-secondary text-sm mt-1"
              >
                <option value={30}>30초</option>
                <option value={45}>45초</option>
                <option value={60}>60초</option>
                <option value={90}>90초</option>
              </select>
            </div>
          </div>
        )}

        {/* 추가 설정 */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-text-primary">추가 설정</h3>

          <div className="grid grid-cols-2 gap-3">
            {/* 비공개 설정 */}
            <div className="p-3 bg-bg-tertiary/50 rounded-lg border border-bg-elevated">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {isPrivate ? (
                    <Lock className="w-4 h-4 text-accent-gold" />
                  ) : (
                    <Unlock className="w-4 h-4 text-text-secondary" />
                  )}
                  <div>
                    <div className="text-text-primary font-medium text-sm">비공개 방</div>
                    <div className="text-text-secondary text-xs">비밀번호 사용</div>
                  </div>
                </div>
                <Switch
                  checked={isPrivate}
                  onCheckedChange={setIsPrivate}
                />
              </div>

              {isPrivate && (
                <div className="mt-3">
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="새 비밀번호 (변경 시에만)"
                    className="text-sm"
                  />
                </div>
              )}
            </div>

            {/* 관전 허용 설정 */}
            <div className="p-3 bg-bg-tertiary/50 rounded-lg border border-bg-elevated">
              <div className="flex items-center justify-between h-full">
                <div className="flex items-center gap-2">
                  {allowSpectators ? (
                    <Eye className="w-4 h-4 text-accent-success" />
                  ) : (
                    <EyeOff className="w-4 h-4 text-text-secondary" />
                  )}
                  <div>
                    <div className="text-text-primary font-medium text-sm">관전 허용</div>
                    <div className="text-text-secondary text-xs">관전자 입장 가능</div>
                  </div>
                </div>
                <Switch
                  checked={allowSpectators}
                  onCheckedChange={setAllowSpectators}
                />
              </div>
            </div>
          </div>
        </div>

        {/* 요약 */}
        <div className="p-3 bg-accent-primary/5 rounded-lg border border-accent-primary/20">
          <div className="text-xs text-text-secondary">
            <span className="font-semibold text-text-primary">{maxParticipants}명</span>
            {" • "}
            <span className="font-semibold text-text-primary">
              {TEAM_MODES.find(m => m.value === teamMode)?.label}
            </span>
            {" • "}
            <span className={isPrivate ? "text-accent-gold" : "text-accent-success"}>
              {isPrivate ? "비공개" : "공개"}
            </span>
            {" • "}
            <span>
              {allowSpectators ? "관전 허용" : "관전 비허용"}
            </span>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-accent-danger/10 border border-accent-danger/20 rounded-lg">
            <p className="text-accent-danger text-sm">{error}</p>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-3 pt-4 mt-4 border-t border-bg-tertiary">
        <Button variant="outline" onClick={onClose}>취소</Button>
        <Button onClick={handleSave} disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          저장
        </Button>
      </div>
    </Modal>
  );
}
