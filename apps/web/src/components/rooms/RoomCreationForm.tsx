"use client";

import { useState } from "react";
import { useRoomStore } from "@/stores/room-store";
import { useRouter } from "next/navigation";
import { Users, Lock, Unlock, Gavel, ListOrdered, Trophy, Info, GitBranch } from "lucide-react";

interface RoomCreationFormProps {
  onCancel: () => void;
  onRoomCreated?: (roomId: string) => void;
}

type TeamMode = "AUCTION" | "SNAKE_DRAFT";

const TEAM_MODES: { value: TeamMode; label: string; description: string; icon: React.ReactNode }[] = [
  {
    value: "AUCTION",
    label: "경매 드래프트",
    description: "팀장이 포인트를 사용해 선수를 입찰하여 팀을 구성합니다",
    icon: <Gavel className="w-5 h-5" />,
  },
  {
    value: "SNAKE_DRAFT",
    label: "스네이크 드래프트",
    description: "팀장이 번갈아가며 선수를 선택합니다 (1-2-2-2-1 순서)",
    icon: <ListOrdered className="w-5 h-5" />,
  },
];

const PLAYER_OPTIONS = [
  { value: 10,  label: "10명",  description: "5 vs 5",     teams: 2, format: "단판",          supportsDE: false },
  { value: 15,  label: "15명",  description: "3팀 리그전",  teams: 3, format: "리그전",        supportsDE: false },
  { value: 20,  label: "20명",  description: "4팀 토너먼트", teams: 4, format: "준결승+결승",   supportsDE: true  },
  { value: 30,  label: "30명",  description: "6팀 리그전",  teams: 6, format: "리그전",        supportsDE: false },
  { value: 40,  label: "40명",  description: "8팀 토너먼트", teams: 8, format: "8강+4강+결승", supportsDE: true  },
];

export function RoomCreationForm({ onCancel, onRoomCreated }: RoomCreationFormProps) {
  const router = useRouter();
  const { createRoom, isLoading, error } = useRoomStore();
  const [name, setName] = useState("");
  const [maxParticipants, setMaxParticipants] = useState(10);
  const [teamMode, setTeamMode] = useState<TeamMode>("AUCTION");
  const [isPrivate, setIsPrivate] = useState(false);
  const [password, setPassword] = useState("");
  const [allowSpectators, setAllowSpectators] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 경매 설정
  const [startingPoints, setStartingPoints] = useState(1000);
  const [minBidIncrement, setMinBidIncrement] = useState(50);
  const [bidTimeLimit, setBidTimeLimit] = useState(30);

  // 스네이크 드래프트 설정
  const [pickTimeLimit, setPickTimeLimit] = useState(60);
  const [captainSelection, setCaptainSelection] = useState<"RANDOM" | "TIER">("RANDOM");

  // 브래킷 포맷 (4/8팀 전용)
  const [useDoubleElim, setUseDoubleElim] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!name.trim()) {
      setErrorMessage("방 제목을 입력해주세요");
      return;
    }

    const selectedOption = PLAYER_OPTIONS.find(opt => opt.value === maxParticipants);
    const roomData = {
      name: name.trim(),
      maxParticipants: maxParticipants as 10 | 15 | 20 | 30 | 40,
      teamMode: teamMode,
      password: isPrivate ? password : undefined,
      allowSpectators: allowSpectators,
      // Auction settings
      startingPoints,
      minBidIncrement,
      bidTimeLimit,
      // Snake draft settings
      pickTimeLimit,
      captainSelection,
      // Bracket format
      bracketFormat: selectedOption?.supportsDE && useDoubleElim
        ? 'DOUBLE_ELIMINATION'
        : 'SINGLE_ELIMINATION',
    };

    const newRoom = await createRoom(roomData);
    if (newRoom) {
      if (onRoomCreated) {
        onRoomCreated(newRoom.id);
      } else {
        router.push(`/tournaments/${newRoom.id}/lobby`);
      }
    } else {
      setErrorMessage(error || "방 생성에 실패했습니다");
    }
  };

  const selectedPlayerOption = PLAYER_OPTIONS.find(opt => opt.value === maxParticipants);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* 기본 정보 */}
      <div className="space-y-4">
        <div>
          <label htmlFor="name" className="block text-text-primary text-sm font-semibold mb-2">
            방 제목 <span className="text-accent-danger">*</span>
          </label>
          <input
            type="text"
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예: 다이아+ 경매 내전, 즐겜팟 모집"
            className="w-full input"
            maxLength={50}
            required
          />
          <p className="text-text-tertiary text-xs mt-1">{name.length}/50자</p>
        </div>
      </div>

      {/* 참가 인원 */}
      <div>
        <label className="block text-text-primary text-sm font-semibold mb-3">
          <Users className="w-4 h-4 inline mr-2" />
          참가 인원
        </label>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {PLAYER_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setMaxParticipants(option.value)}
              className={`p-3 rounded-lg border-2 transition-all text-left ${
                maxParticipants === option.value
                  ? "border-accent-primary bg-accent-primary/10"
                  : "border-bg-tertiary hover:border-bg-elevated bg-bg-tertiary/50"
              }`}
            >
              <div className="font-bold text-text-primary">{option.label}</div>
              <div className="text-xs text-text-secondary">{option.description}</div>
              <div className="text-xs text-accent-primary mt-1">{option.format}</div>
            </button>
          ))}
        </div>
      </div>

      {/* 더블 일리미네이션 옵션 (4/8팀 전용) */}
      {selectedPlayerOption?.supportsDE && (
        <div className="p-4 bg-bg-tertiary/50 rounded-lg border border-bg-elevated">
          <label className="flex items-center justify-between cursor-pointer">
            <div className="flex items-center gap-3">
              <GitBranch className="w-5 h-5 text-accent-primary" />
              <div>
                <div className="text-text-primary font-medium">더블 일리미네이션</div>
                <div className="text-text-secondary text-xs">패자도 패자조에서 재도전 가능 (총 경기 수 증가)</div>
              </div>
            </div>
            <div className="relative" onClick={() => setUseDoubleElim(v => !v)}>
              <div className={`w-11 h-6 rounded-full transition-colors ${useDoubleElim ? "bg-accent-primary" : "bg-bg-elevated"}`}>
                <div className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-transform mt-0.5 ${useDoubleElim ? "translate-x-5" : "translate-x-0.5"}`} />
              </div>
            </div>
          </label>
          {useDoubleElim && (
            <p className="text-xs text-accent-primary mt-2">
              {selectedPlayerOption.teams === 4
                ? "4팀 DE: 승자조(3경기) + 패자조(2경기) + 그랜드파이널(1경기) = 총 6경기"
                : "8팀 DE: 승자조(7경기) + 패자조(6경기) + 그랜드파이널(1경기) = 총 14경기"}
            </p>
          )}
        </div>
      )}

      {/* 팀 구성 방식 */}
      <div>
        <label className="block text-text-primary text-sm font-semibold mb-3">
          <Trophy className="w-4 h-4 inline mr-2" />
          팀 구성 방식
        </label>
        <div className="space-y-3">
          {TEAM_MODES.map((mode) => (
            <button
              key={mode.value}
              type="button"
              onClick={() => setTeamMode(mode.value)}
              className={`w-full p-4 rounded-lg border-2 transition-all text-left flex items-start gap-4 ${
                teamMode === mode.value
                  ? "border-accent-primary bg-accent-primary/10"
                  : "border-bg-tertiary hover:border-bg-elevated bg-bg-tertiary/50"
              }`}
            >
              <div className={`p-2 rounded-lg ${teamMode === mode.value ? "bg-accent-primary text-white" : "bg-bg-elevated text-text-secondary"}`}>
                {mode.icon}
              </div>
              <div className="flex-1">
                <div className="font-bold text-text-primary">{mode.label}</div>
                <div className="text-sm text-text-secondary mt-1">{mode.description}</div>
              </div>
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                teamMode === mode.value ? "border-accent-primary bg-accent-primary" : "border-text-tertiary"
              }`}>
                {teamMode === mode.value && <div className="w-2 h-2 rounded-full bg-white" />}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* 경매 드래프트 상세 설정 */}
      {teamMode === "AUCTION" && (
        <div className="p-4 bg-bg-tertiary/50 rounded-lg border border-bg-elevated space-y-4">
          <div className="flex items-center gap-2 text-text-primary font-semibold">
            <Info className="w-4 h-4" />
            경매 설정
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-text-secondary text-xs mb-1">시작 포인트</label>
              <select
                value={startingPoints}
                onChange={(e) => setStartingPoints(Number(e.target.value))}
                className="w-full input text-sm"
              >
                <option value={500}>500 포인트</option>
                <option value={1000}>1,000 포인트</option>
                <option value={1500}>1,500 포인트</option>
                <option value={2000}>2,000 포인트</option>
              </select>
            </div>
            <div>
              <label className="block text-text-secondary text-xs mb-1">최소 입찰 단위</label>
              <select
                value={minBidIncrement}
                onChange={(e) => setMinBidIncrement(Number(e.target.value))}
                className="w-full input text-sm"
              >
                <option value={10}>10 포인트</option>
                <option value={25}>25 포인트</option>
                <option value={50}>50 포인트</option>
                <option value={100}>100 포인트</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-text-secondary text-xs mb-1">입찰 제한 시간</label>
            <select
              value={bidTimeLimit}
              onChange={(e) => setBidTimeLimit(Number(e.target.value))}
              className="w-full input text-sm"
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
          <div className="flex items-center gap-2 text-text-primary font-semibold">
            <Info className="w-4 h-4" />
            스네이크 드래프트 설정
          </div>

          <div>
            <label className="block text-text-secondary text-xs mb-1">팀장 선정 방식</label>
            <select
              value={captainSelection}
              onChange={(e) => setCaptainSelection(e.target.value as "RANDOM" | "TIER")}
              className="w-full input text-sm"
            >
              <option value="RANDOM">랜덤 선정</option>
              <option value="TIER">티어 기반 (높은 티어 우선)</option>
            </select>
          </div>

          <div>
            <label className="block text-text-secondary text-xs mb-1">픽 제한 시간</label>
            <select
              value={pickTimeLimit}
              onChange={(e) => setPickTimeLimit(Number(e.target.value))}
              className="w-full input text-sm"
            >
              <option value={30}>30초</option>
              <option value={45}>45초</option>
              <option value={60}>60초</option>
              <option value={90}>90초</option>
            </select>
          </div>
        </div>
      )}
      
      {/* 상세 설정 */}
      <div className="grid grid-cols-2 gap-6">
        {/* 비공개 설정 */}
        <div className="p-4 bg-bg-tertiary/50 rounded-lg border border-bg-elevated">
          <label className="flex items-center justify-between cursor-pointer">
            <div className="flex items-center gap-3">
              {isPrivate ? (
                <Lock className="w-5 h-5 text-accent-gold" />
              ) : (
                <Unlock className="w-5 h-5 text-text-secondary" />
              )}
              <div>
                <div className="text-text-primary font-medium">비공개 방</div>
                <div className="text-text-secondary text-xs">비밀번호를 사용합니다</div>
              </div>
            </div>
            <div className="relative">
              <input
                type="checkbox"
                checked={isPrivate}
                onChange={(e) => setIsPrivate(e.target.checked)}
                className="sr-only"
              />
              <div className={`w-11 h-6 rounded-full transition-colors ${isPrivate ? "bg-accent-primary" : "bg-bg-elevated"}`}>
                <div className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-transform ${isPrivate ? "translate-x-5" : "translate-x-0.5"} mt-0.5`} />
              </div>
            </div>
          </label>

          {isPrivate && (
            <div className="mt-4">
              <label htmlFor="password" className="block text-text-secondary text-xs mb-1">
                비밀번호
              </label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="비밀번호를 입력하세요"
                className="w-full input"
                required={isPrivate}
                minLength={4}
              />
            </div>
          )}
        </div>
        {/* 관전 허용 설정 */}
        <div className="p-4 bg-bg-tertiary/50 rounded-lg border border-bg-elevated">
          <label className="flex items-center justify-between cursor-pointer h-full">
            <div className="flex items-center gap-3">
                <div className="text-text-primary font-medium">관전 허용</div>
                <div className="text-text-secondary text-xs">다른 유저가 관전할 수 있습니다</div>
            </div>
            <div className="relative">
              <input
                type="checkbox"
                checked={allowSpectators}
                onChange={(e) => setAllowSpectators(e.target.checked)}
                className="sr-only"
              />
              <div className={`w-11 h-6 rounded-full transition-colors ${allowSpectators ? "bg-accent-primary" : "bg-bg-elevated"}`}>
                <div className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-transform ${allowSpectators ? "translate-x-5" : "translate-x-0.5"} mt-0.5`} />
              </div>
            </div>
          </label>
        </div>
      </div>

      {/* 요약 */}
      <div className="p-4 bg-accent-primary/5 rounded-lg border border-accent-primary/20">
        <div className="text-sm text-text-secondary">
          <span className="font-semibold text-text-primary">{selectedPlayerOption?.label}</span>
          {" "}({selectedPlayerOption?.description}) •{" "}
          <span className="font-semibold text-text-primary">
            {TEAM_MODES.find(m => m.value === teamMode)?.label}
          </span>
          {selectedPlayerOption?.supportsDE && (
            <>{" "}•{" "}<span className={useDoubleElim ? "text-accent-primary font-semibold" : ""}>
              {useDoubleElim ? "더블 일리미네이션" : "싱글 일리미네이션"}
            </span></>
          )}
          {" "}•{" "}
          <span className={isPrivate ? "text-accent-gold" : "text-accent-success"}>
            {isPrivate ? "비공개" : "공개"}
          </span>
           •{" "}
          <span>
            {allowSpectators ? "관전 허용" : "관전 비허용"}
          </span>
        </div>
      </div>

      {/* 에러 메시지 */}
      {errorMessage && (
        <div className="p-3 bg-accent-danger/10 border border-accent-danger/20 rounded-lg">
          <p className="text-accent-danger text-sm">{errorMessage}</p>
        </div>
      )}

      {/* 버튼 */}
      <div className="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-6 py-2.5 bg-bg-tertiary hover:bg-bg-elevated text-text-primary font-semibold rounded-lg transition-colors"
          disabled={isLoading}
        >
          취소
        </button>
        <button
          type="submit"
          className="px-6 py-2.5 bg-accent-primary hover:bg-accent-hover text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              생성 중...
            </>
          ) : (
            "방 생성"
          )}
        </button>
      </div>
    </form>
  );
}
