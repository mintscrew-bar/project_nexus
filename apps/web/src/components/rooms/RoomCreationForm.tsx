"use client";

import { useEffect, useState } from "react";
import { useRoomStore } from "@/stores/room-store";
import { useRouter } from "next/navigation";
import {
  Users,
  Lock,
  Unlock,
  Gavel,
  ListOrdered,
  Trophy,
  Info,
  GitBranch,
  AlertTriangle,
  Server,
  Scale,
  ArrowLeftRight,
} from "lucide-react";
import Link from "next/link";
import { discordApi } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { SeriesPresetSelector } from "./SeriesPresetSelector";
import { Switch } from "@/components/ui/Switch";
import { teamModeGuides, TeamModeHelp, type TeamMode } from "./TeamModeHelp";
import {
  DEFAULT_SERIES_PRESET,
  GAMES,
  normalizeSeriesPreset,
  type SeriesPreset,
} from "@nexus/types";
import type { GameTitle } from "@nexus/types";
import { killMatchSizeOptions, roomSizeOptions } from "@/lib/room-size-options";
import {
  DEFAULT_PUBG_GAME_MODE,
  PUBG_PLATFORM_LABELS,
  getPubgGameMode,
  isValidPubgRoomSize,
  pubgGameModes,
  type PubgGameMode,
  type PubgPlatform,
} from "@nexus/types";
import { useGamePrefix } from "@/hooks/useCurrentGame";

interface RoomCreationFormProps {
  gameTitle?: GameTitle;
  onCancel: () => void;
  onRoomCreated?: (roomId: string) => void;
}

type DiscordGuildOption = {
  guildId: string;
  guildName: string | null;
  status: "PENDING" | "ACTIVE" | "DISABLED";
};

/**
 * 팀 구성 모드 목록.
 *
 * 설명 문안이 게임마다 다르다(배그에는 라인 선택도 대진표도 없다).
 * 모듈 상수로 두면 롤 문안이 배그 화면에 그대로 박힌다.
 */
const buildTeamModes = (
  guides: Record<TeamMode, { summary: string }>,
): {
  value: TeamMode;
  label: string;
  description: string;
  icon: React.ReactNode;
}[] => [
  {
    value: "AUCTION",
    label: "경매 드래프트",
    description: guides.AUCTION.summary,
    icon: <Gavel className="w-5 h-5" />,
  },
  {
    value: "SNAKE_DRAFT",
    label: "스네이크 드래프트",
    description: guides.SNAKE_DRAFT.summary,
    icon: <ListOrdered className="w-5 h-5" />,
  },
  {
    value: "AUTO_BALANCE",
    label: "자동 밸런스",
    description: guides.AUTO_BALANCE.summary,
    icon: <Scale className="w-5 h-5" />,
  },
  {
    value: "MANUAL_TEAM",
    label: "자유 팀 선택",
    description: guides.MANUAL_TEAM.summary,
    icon: <ArrowLeftRight className="w-5 h-5" />,
  },
];

export function RoomCreationForm({
  gameTitle = "LOL",
  onCancel,
  onRoomCreated,
}: RoomCreationFormProps) {
  const router = useRouter();
  const gamePrefix = useGamePrefix();
  const { createRoom, isLoading, error } = useRoomStore();
  const { user, isAuthenticated, isLoading: authLoading } = useAuthStore();
  const [name, setName] = useState("");
  const [killMatchDurationMinutes, setKillMatchDurationMinutes] = useState(60);
  /**
   * 총 경기 수는 **문자열로** 들고 있는다.
   *
   * 숫자로 두고 `Number(값) || 1` 로 받으면 칸을 비우는 순간 1로 튕겨서
   * "12"를 치려고 지우면 "1"이 남고 "112"가 된다. 빈 칸을 그대로 두고
   * 제출할 때 검사한다.
   */
  const [battleRoyaleRounds, setBattleRoyaleRounds] = useState("3");
  const [pubgPlatform, setPubgPlatform] = useState<PubgPlatform>("STEAM");
  // 배그는 경기 모드에 따라 정원과 고를 수 있는 팀 편성이 달라진다.
  const [pubgGameMode, setPubgGameMode] = useState<PubgGameMode>(
    DEFAULT_PUBG_GAME_MODE,
  );
  const game = GAMES[gameTitle];
  // 팀 구성 설명은 게임마다 다르다. 방을 만들 게임 기준으로 고른다 —
  // 이 폼은 경로가 아니라 고른 게임을 따라간다.
  const TEAM_MODES = buildTeamModes(teamModeGuides(gameTitle));
  // 모드마다 참가 정원 선택지는 다르지만 배그 팀 인원은 항상 4명이다.
  const playerOptions =
    gameTitle !== "PUBG"
      ? roomSizeOptions(gameTitle)
      : pubgGameMode === "KILL_MATCH"
        ? killMatchSizeOptions()
        : roomSizeOptions(gameTitle).filter((option) =>
            isValidPubgRoomSize(option.value, pubgGameMode),
          );
  const [maxParticipants, setMaxParticipants] = useState(
    gameTitle === "PUBG"
      ? (getPubgGameMode(DEFAULT_PUBG_GAME_MODE).roomSizes[0] ?? 16)
      : (game.roomSizes[0] ?? 10),
  );
  const [teamMode, setTeamMode] = useState<TeamMode>("AUCTION");
  const [isPrivate, setIsPrivate] = useState(false);
  const [password, setPassword] = useState("");
  const [allowSpectators, setAllowSpectators] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedDiscordGuildId, setSelectedDiscordGuildId] = useState("");
  const [discordGuilds, setDiscordGuilds] = useState<DiscordGuildOption[]>([]);
  const [isLoadingGuilds, setIsLoadingGuilds] = useState(false);
  const [guildLoadError, setGuildLoadError] = useState<string | null>(null);

  // 경매 설정
  const [startingPoints, setStartingPoints] = useState(1000);
  const [minBidIncrement, setMinBidIncrement] = useState(50);
  const [bidTimeLimit, setBidTimeLimit] = useState(30);

  // 스네이크 드래프트 설정
  const [pickTimeLimit, setPickTimeLimit] = useState(60);
  const [captainSelection, setCaptainSelection] = useState<
    "RANDOM" | "TIER" | "MANUAL" | "VOLUNTEER"
  >("RANDOM");
  const [auctionCaptainSelection, setAuctionCaptainSelection] = useState<
    "TIER" | "MANUAL" | "VOLUNTEER"
  >("TIER");

  // 브래킷 포맷 (4/8팀 전용)
  const [useDoubleElim, setUseDoubleElim] = useState(false);
  // 다전제 프리셋. 방 크기를 바꾸면 팀 수가 달라져 이전 선택이 무효일 수 있다.
  const [seriesPreset, setSeriesPreset] = useState<SeriesPreset>(
    DEFAULT_SERIES_PRESET,
  );

  useEffect(() => {
    if (authLoading || !isAuthenticated || !user) {
      setDiscordGuilds([]);
      setIsLoadingGuilds(false);
      setGuildLoadError(null);
      return;
    }

    let isMounted = true;

    setIsLoadingGuilds(true);
    setGuildLoadError(null);

    discordApi
      .getMyGuildLinks()
      .then((data) => {
        if (!isMounted) return;
        setDiscordGuilds(
          data.guilds.filter((guild) => guild.status === "ACTIVE"),
        );
      })
      .catch(() => {
        if (!isMounted) return;
        setDiscordGuilds([]);
        setGuildLoadError(
          "연동 서버 목록을 불러오지 못했습니다. 넥서스 서버로는 생성할 수 있습니다.",
        );
      })
      .finally(() => {
        if (isMounted) {
          setIsLoadingGuilds(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [authLoading, isAuthenticated, user]);

  // 인원(=팀 수)이 바뀌면 고를 수 있는 프리셋 목록도 갈아끼워진다.
  // 이전 선택이 새 팀 수에서 유효하지 않으면 단판으로 되돌린다.
  const handleParticipantChange = (value: number) => {
    setMaxParticipants(value);
    const nextTeams = playerOptions.find((o) => o.value === value)?.teams ?? 0;
    setSeriesPreset(normalizeSeriesPreset(seriesPreset, nextTeams));
  };

  /**
   * 경기 모드가 바뀌면 정원 선택지가 통째로 달라진다
   * (킬내기는 8명 고정, 배틀로얄은 16명부터).
   * 이전 정원이 새 모드에서 유효하지 않으면 그 모드의 첫 정원으로 옮긴다.
   */
  const parsedRounds = Number(battleRoyaleRounds);
  const roundsValid =
    battleRoyaleRounds.trim() !== "" &&
    Number.isInteger(parsedRounds) &&
    parsedRounds >= 1 &&
    parsedRounds <= 20;
  const needsRounds = gameTitle === "PUBG" && pubgGameMode === "BATTLE_ROYALE";

  const handlePubgModeChange = (mode: PubgGameMode) => {
    setPubgGameMode(mode);
    const sizes = getPubgGameMode(mode).roomSizes;
    if (!sizes.includes(maxParticipants)) {
      handleParticipantChange(sizes[0] ?? 16);
    }
    // 자유 매치는 수동 팀 배정만 쓴다.
    const allowed = getPubgGameMode(mode).teamModes;
    if (!allowed.includes(teamMode as never)) {
      setTeamMode(allowed[0] as TeamMode);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!name.trim()) {
      setErrorMessage("방 제목을 입력해주세요");
      return;
    }

    // 빈 칸을 그대로 둘 수 있게 했으므로 제출에서 막는다.
    if (needsRounds && !roundsValid) {
      setErrorMessage(
        battleRoyaleRounds.trim() === ""
          ? "총 경기 수를 입력해야 방을 만들 수 있습니다"
          : "총 경기 수는 1~20 사이의 정수로 입력해주세요",
      );
      return;
    }

    const selectedOption = playerOptions.find(
      (opt) => opt.value === maxParticipants,
    );
    const roomData = {
      name: name.trim(),
      gameTitle,
      pubgPlatform: gameTitle === "PUBG" ? pubgPlatform : undefined,
      pubgGameMode: gameTitle === "PUBG" ? pubgGameMode : undefined,
      killMatchDurationMinutes,
      battleRoyaleRounds: parsedRounds,
      maxParticipants,
      teamMode: teamMode,
      password: isPrivate ? password : undefined,
      allowSpectators: allowSpectators,
      discordGuildId: selectedDiscordGuildId || undefined,
      // Auction settings
      startingPoints,
      minBidIncrement,
      bidTimeLimit,
      // Snake draft settings
      pickTimeLimit,
      captainSelection:
        teamMode === "AUCTION" ? auctionCaptainSelection : captainSelection,
      // Bracket format
      bracketFormat:
        selectedOption?.supportsDE && useDoubleElim
          ? "DOUBLE_ELIMINATION"
          : "SINGLE_ELIMINATION",
      // 더블 일리미네이션은 아직 다전제를 지원하지 않는다 (서버도 단판으로 강제).
      seriesPreset:
        selectedOption?.supportsDE && useDoubleElim
          ? DEFAULT_SERIES_PRESET
          : seriesPreset,
    };

    const newRoom = await createRoom(roomData);
    if (newRoom) {
      if (onRoomCreated) {
        onRoomCreated(newRoom.id);
      } else {
        router.push(`/${game.slug}/tournaments/${newRoom.id}/lobby`);
      }
    } else {
      setErrorMessage(error || "방 생성에 실패했습니다");
    }
  };

  const selectedPlayerOption = playerOptions.find(
    (opt) => opt.value === maxParticipants,
  );
  const selectedDiscordServerLabel = selectedDiscordGuildId
    ? discordGuilds.find((guild) => guild.guildId === selectedDiscordGuildId)
        ?.guildName || "연동 Discord 서버"
    : "넥서스 서버";

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* 기본 정보 */}
      <div className="space-y-4">
        <div>
          <label
            htmlFor="name"
            className="block text-text-primary text-sm font-semibold mb-2"
          >
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
        {gameTitle === "PUBG" && (
          <div>
            <label
              htmlFor="pubgPlatform"
              className="block text-text-primary text-sm font-semibold mb-2"
            >
              플랫폼
            </label>
            <select
              id="pubgPlatform"
              value={pubgPlatform}
              onChange={(e) =>
                setPubgPlatform(e.target.value as "STEAM" | "KAKAO")
              }
              className="w-full input"
            >
              <option value="STEAM">Steam (스팀 배틀그라운드)</option>
              <option value="KAKAO">Kakao (카카오 배틀그라운드)</option>
            </select>
            <p className="mt-1 text-xs text-text-tertiary">
              목록·공지에 [{PUBG_PLATFORM_LABELS[pubgPlatform].short}] 표시가
              붙습니다. 스배와 카배는 같이 플레이할 수 없습니다.
            </p>
          </div>
        )}
        {gameTitle === "PUBG" && (
          <div>
            <label
              htmlFor="pubgGameMode"
              className="block text-text-primary text-sm font-semibold mb-2"
            >
              경기 모드
            </label>
            <select
              id="pubgGameMode"
              value={pubgGameMode}
              onChange={(e) =>
                handlePubgModeChange(e.target.value as PubgGameMode)
              }
              className="w-full input"
            >
              {pubgGameModes().map((mode) => (
                <option key={mode.mode} value={mode.mode}>
                  {mode.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-text-tertiary">
              {getPubgGameMode(pubgGameMode).description}
            </p>
          </div>
        )}
      </div>

      {/* Discord 서버 선택 */}
      <div>
        <label
          htmlFor="discordGuildId"
          className="block text-text-primary text-sm font-semibold mb-2"
        >
          <Server className="w-4 h-4 inline mr-2" />
          Discord 서버
        </label>
        <select
          id="discordGuildId"
          value={selectedDiscordGuildId}
          onChange={(e) => setSelectedDiscordGuildId(e.target.value)}
          className="w-full input"
          disabled={isLoadingGuilds}
        >
          <option value="">넥서스 서버</option>
          {discordGuilds.map((guild) => (
            <option key={guild.guildId} value={guild.guildId}>
              {guild.guildName || `Discord 서버 (${guild.guildId})`}
            </option>
          ))}
        </select>
        {isLoadingGuilds ? (
          <p className="text-text-tertiary text-xs mt-1">
            연동 서버 목록을 불러오는 중입니다.
          </p>
        ) : guildLoadError ? (
          <p className="text-accent-danger text-xs mt-1">{guildLoadError}</p>
        ) : (
          <p className="text-text-tertiary text-xs mt-1">
            선택한 서버에 내전 음성 채널이 생성됩니다.
          </p>
        )}
      </div>

      {/* 참가 인원 */}
      <div>
        <label className="block text-text-primary text-sm font-semibold mb-3">
          <Users className="w-4 h-4 inline mr-2" />
          참가 인원
        </label>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {playerOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => handleParticipantChange(option.value)}
              className={`p-3 rounded-lg border-2 transition-all text-left ${
                maxParticipants === option.value
                  ? "border-accent-primary bg-accent-primary/10"
                  : "border-bg-tertiary hover:border-bg-elevated bg-bg-tertiary/50"
              }`}
            >
              <div className="font-bold text-text-primary">{option.label}</div>
              <div className="text-xs text-text-secondary">
                {option.description}
              </div>
              <div className="text-xs text-accent-primary mt-1">
                {option.format}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* 더블 일리미네이션 옵션 (4/8팀 전용) */}
      {selectedPlayerOption?.supportsDE && (
        <div className="p-4 bg-bg-tertiary/50 rounded-lg border border-bg-elevated">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <GitBranch className="w-5 h-5 text-accent-primary" />
              <div>
                <div
                  id="double-elimination-label"
                  className="text-text-primary font-medium"
                >
                  더블 일리미네이션
                </div>
                <div className="text-text-secondary text-xs">
                  패자도 패자조에서 재도전 가능 (총 경기 수 증가)
                </div>
              </div>
            </div>
            <Switch
              checked={useDoubleElim}
              onCheckedChange={setUseDoubleElim}
              aria-labelledby="double-elimination-label"
            />
          </div>
          {useDoubleElim && (
            <p className="text-xs text-accent-primary mt-2">
              {selectedPlayerOption.teams === 4
                ? "4팀 DE: 승자조(3경기) + 패자조(2경기) + 그랜드파이널(1경기) = 총 6경기"
                : "8팀 DE: 승자조(7경기) + 패자조(6경기) + 그랜드파이널(1경기) = 총 14경기"}
            </p>
          )}
        </div>
      )}

      {/* 다전제 프리셋 — 더블 일리미네이션은 아직 단판만 지원한다 */}
      {gameTitle === "LOL" &&
        !(selectedPlayerOption?.supportsDE && useDoubleElim) && (
          <SeriesPresetSelector
            teamCount={selectedPlayerOption?.teams ?? 0}
            value={seriesPreset}
            onChange={setSeriesPreset}
          />
        )}

      {/* 팀 구성 방식 */}
      {gameTitle === "PUBG" && pubgGameMode === "BATTLE_ROYALE" && (
        <label className="block text-sm text-text-primary">
          총 경기 수
          <input
            type="number"
            min={1}
            max={20}
            className="input mt-2"
            value={battleRoyaleRounds}
            onChange={(e) => setBattleRoyaleRounds(e.target.value)}
            aria-invalid={!roundsValid}
          />
          {roundsValid ? (
            <span className="mt-2 block text-text-secondary">
              {maxParticipants}명 · {maxParticipants / 4}팀이 탈락 없이{" "}
              {parsedRounds}판 모두 참가합니다. 킬·순위 점수를 합산해 최종
              순위를 정합니다.
            </span>
          ) : (
            <span className="mt-2 block text-accent-danger">
              {battleRoyaleRounds.trim() === ""
                ? "총 경기 수를 입력해야 방을 만들 수 있습니다."
                : "총 경기 수는 1~20 사이의 정수로 입력해주세요."}
            </span>
          )}
        </label>
      )}
      {gameTitle === "PUBG" && pubgGameMode === "KILL_MATCH" && (
        <label className="block text-sm text-text-primary">
          킬내기 진행시간
          <select
            className="input mt-2"
            value={killMatchDurationMinutes}
            onChange={(e) =>
              setKillMatchDurationMinutes(Number(e.target.value))
            }
          >
            {[30, 60, 90, 120, 180, 240].map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutes}분
              </option>
            ))}
          </select>
          <span className="mt-2 block text-text-secondary">
            제한시간 안에 시작한 경기는 종료 후에도 자동 집계합니다.
          </span>
        </label>
      )}
      <div>
        <label className="block text-text-primary text-sm font-semibold mb-3">
          <Trophy className="w-4 h-4 inline mr-2" />팀 구성 방식
        </label>
        <div className="space-y-3">
          {/* 배그는 경기 모드가 팀 편성 선택지를 더 좁힌다(자유 매치는 수동 배정만). */}
          {TEAM_MODES.filter((mode) =>
            gameTitle === "PUBG"
              ? getPubgGameMode(pubgGameMode).teamModes.includes(mode.value)
              : game.teamModes.includes(mode.value),
          ).map((mode) => (
            <div
              key={mode.value}
              className={`flex w-full items-start gap-1 rounded-lg border-2 p-2 transition-all ${
                teamMode === mode.value
                  ? "border-accent-primary bg-accent-primary/10"
                  : "border-bg-tertiary hover:border-bg-elevated bg-bg-tertiary/50"
              }`}
            >
              <button
                type="button"
                onClick={() => setTeamMode(mode.value)}
                aria-pressed={teamMode === mode.value}
                className="flex min-w-0 flex-1 items-start gap-4 rounded-md p-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
              >
                <div
                  className={`p-2 rounded-lg ${teamMode === mode.value ? "bg-accent-primary text-white" : "bg-bg-elevated text-text-secondary"}`}
                >
                  {mode.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-text-primary">
                    {mode.label}
                  </div>
                  <div className="text-sm text-text-secondary mt-1">
                    {mode.description}
                  </div>
                </div>
                <div
                  className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 ${
                    teamMode === mode.value
                      ? "border-accent-primary bg-accent-primary"
                      : "border-text-tertiary"
                  }`}
                >
                  {teamMode === mode.value && (
                    <div className="h-2 w-2 rounded-full bg-white" />
                  )}
                </div>
              </button>
              <TeamModeHelp mode={mode.value} />
            </div>
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

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-text-secondary text-xs mb-1">
                시작 포인트
              </label>
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
              <label className="block text-text-secondary text-xs mb-1">
                최소 입찰 단위
              </label>
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
            <label className="block text-text-secondary text-xs mb-1">
              입찰 제한 시간
            </label>
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

          <div>
            <label className="block text-text-secondary text-xs mb-1">
              팀장 선정 방식
            </label>
            <select
              value={auctionCaptainSelection}
              onChange={(e) =>
                setAuctionCaptainSelection(
                  e.target.value as "TIER" | "MANUAL" | "VOLUNTEER",
                )
              }
              className="w-full input text-sm"
            >
              <option value="TIER">자동 (고도화 점수 기준 상위 N명)</option>
              <option value="MANUAL">방장 직접 지명</option>
              <option value="VOLUNTEER">자원 모집 (30초 타이머)</option>
            </select>
            {auctionCaptainSelection === "VOLUNTEER" && (
              <p className="text-xs text-text-tertiary mt-1">
                경매 시작 시 30초 동안 자원자를 모집합니다. 방장은 조기 마감
                가능. 아무도 안 하면 고도화 점수 기준으로 자동 선정합니다.
              </p>
            )}
            {auctionCaptainSelection === "MANUAL" && (
              <p className="text-xs text-text-tertiary mt-1">
                경매 시작 전 방장이 참가자 중 팀장을 직접 지명합니다.
              </p>
            )}
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
            <label className="block text-text-secondary text-xs mb-1">
              팀장 선정 방식
            </label>
            <select
              value={captainSelection}
              onChange={(e) =>
                setCaptainSelection(
                  e.target.value as "RANDOM" | "TIER" | "MANUAL" | "VOLUNTEER",
                )
              }
              className="w-full input text-sm"
            >
              <option value="RANDOM">랜덤 선정</option>
              <option value="TIER">
                {gameTitle === "PUBG"
                  ? "등록 점수 기준 (상위 N명)"
                  : "고도화 점수 기준 (상위 N명)"}
              </option>
              {gameTitle === "PUBG" && (
                <>
                  <option value="MANUAL">방장 직접 지명</option>
                  <option value="VOLUNTEER">자원 모집</option>
                </>
              )}
            </select>
            {gameTitle === "PUBG" && (
              <p className="mt-1 text-xs text-text-tertiary">
                팀장은 고도화 점수 기준으로 정하거나 방장이 직접 지정합니다.
                점수가 없는 계정은 자동 선정 점수에서 제외됩니다.
              </p>
            )}
          </div>

          <div>
            <label className="block text-text-secondary text-xs mb-1">
              픽 제한 시간
            </label>
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6">
        {/* 비공개 설정 */}
        <div className="p-4 bg-bg-tertiary/50 rounded-lg border border-bg-elevated">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {isPrivate ? (
                <Lock className="w-5 h-5 text-accent-gold" />
              ) : (
                <Unlock className="w-5 h-5 text-text-secondary" />
              )}
              <div>
                <div
                  id="private-room-label"
                  className="text-text-primary font-medium"
                >
                  비공개 방
                </div>
                <div className="text-text-secondary text-xs">
                  비밀번호를 사용합니다
                </div>
              </div>
            </div>
            <Switch
              checked={isPrivate}
              onCheckedChange={setIsPrivate}
              aria-labelledby="private-room-label"
            />
          </div>

          {isPrivate && (
            <div className="mt-4">
              <label
                htmlFor="password"
                className="block text-text-secondary text-xs mb-1"
              >
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
          <div className="flex h-full items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div
                id="allow-spectators-label"
                className="text-text-primary font-medium"
              >
                관전 허용
              </div>
              <div className="text-text-secondary text-xs">
                다른 유저가 관전할 수 있습니다
              </div>
            </div>
            <Switch
              checked={allowSpectators}
              onCheckedChange={setAllowSpectators}
              aria-labelledby="allow-spectators-label"
            />
          </div>
        </div>
      </div>

      {/* 요약 */}
      <div className="p-4 bg-accent-primary/5 rounded-lg border border-accent-primary/20">
        <div className="text-sm text-text-secondary">
          <span className="font-semibold text-text-primary">
            {selectedPlayerOption?.label}
          </span>{" "}
          ({selectedPlayerOption?.description}) •{" "}
          <span className="font-semibold text-text-primary">
            {TEAM_MODES.find((m) => m.value === teamMode)?.label}
          </span>
          {selectedPlayerOption?.supportsDE && (
            <>
              {" "}
              •{" "}
              <span
                className={
                  useDoubleElim ? "text-accent-primary font-semibold" : ""
                }
              >
                {useDoubleElim ? "더블 일리미네이션" : "싱글 일리미네이션"}
              </span>
            </>
          )}{" "}
          •{" "}
          <span
            className={isPrivate ? "text-accent-gold" : "text-accent-success"}
          >
            {isPrivate ? "비공개" : "공개"}
          </span>
          • <span>{allowSpectators ? "관전 허용" : "관전 비허용"}</span> •{" "}
          <span className="font-semibold text-text-primary">
            {selectedDiscordServerLabel}
          </span>
        </div>
      </div>

      {/* 에러 메시지 (계정 연동 에러 시 안내 링크 포함) */}
      {errorMessage &&
        (() => {
          const isDiscordError = errorMessage.includes("DISCORD_NOT_LINKED");
          const isRiotError = errorMessage.includes("RIOT_NOT_LINKED");
          const isPubgError = errorMessage.includes("PUBG_NOT_LINKED");
          const displayMessage = errorMessage.includes("::")
            ? errorMessage.split("::")[1]
            : errorMessage;

          return (
            <div className="p-4 bg-accent-danger/10 border border-accent-danger/20 rounded-lg">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-accent-danger shrink-0 mt-0.5" />
                <div className="space-y-2">
                  <p className="text-accent-danger text-sm font-medium">
                    {displayMessage}
                  </p>
                  {/* 계정 연동 페이지로 안내 */}
                  {isDiscordError && (
                    <Link
                      href="/settings"
                      className="inline-block text-sm text-accent-primary hover:underline"
                    >
                      설정 페이지에서 Discord 연동하기 →
                    </Link>
                  )}
                  {isRiotError && (
                    <Link
                      href={`${gamePrefix}/profile`}
                      className="inline-block text-sm text-accent-primary hover:underline"
                    >
                      프로필 페이지에서 Riot 계정 연동하기 →
                    </Link>
                  )}
                  {isPubgError && (
                    <Link
                      href="/pubg/profile"
                      className="inline-block text-sm text-accent-primary hover:underline"
                    >
                      PUBG 프로필에서 계정 등록하기 →
                    </Link>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

      {/* 버튼 */}
      <div className="sticky bottom-0 z-10 -mx-4 -mb-4 flex flex-col-reverse gap-3 border-t border-bg-tertiary bg-bg-secondary/95 px-4 py-4 shadow-[0_-12px_28px_rgb(0_0_0/0.18)] backdrop-blur-sm sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="w-full px-6 py-2.5 bg-bg-tertiary hover:bg-bg-elevated text-text-primary font-semibold rounded-lg transition-colors sm:w-auto"
          disabled={isLoading}
        >
          취소
        </button>
        <button
          type="submit"
          className="flex w-full items-center justify-center gap-2 px-6 py-2.5 bg-accent-primary hover:bg-accent-hover text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed sm:w-auto"
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
