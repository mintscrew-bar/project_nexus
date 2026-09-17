"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  BGM_DUCKED_VOLUME,
  BGM_TRACKS,
  BGM_VOLUME,
  pickNextTrack,
  type BgmTrack,
} from "@/lib/bgm/playlist";
import { BGM_MUTED_STORAGE_KEY, useBgmStore } from "@/stores/bgm-store";
import { useLobbyStore } from "@/stores/lobby-store";
import { useMyMatchInProgress } from "@/hooks/useMyMatchInProgress";

/**
 * 음악을 틀지 않는 경로.
 *
 * - `/broadcast`: OBS 브라우저 소스로 쓰는 방송 화면이라, 여기서 소리가 나면
 *   방송에 그대로 섞인다. `/broadcast-control` 도 같은 접두사로 걸린다.
 * - `/admin`, `/dev`: 운영·개발용 화면.
 */
const SILENT_PATH_PREFIXES = ["/broadcast", "/admin", "/dev"];

const FADE_IN_MS = 1200;
const FADE_OUT_MS = 800;
/** 게임 시작 순간 곡을 바꿀 때 앞 곡을 줄이는 시간. 짧아야 "전환"으로 들린다. */
const SWITCH_FADE_MS = 500;
/** 게임 진행 구간에 들어가거나 나올 때 볼륨을 옮기는 시간 */
const DUCK_FADE_MS = 700;
/** 볼륨을 한 칸 바꾸는 간격 */
const FADE_TICK_MS = 50;

const CHANNEL_NAME = "nexus:bgm";

/**
 * 볼륨을 줄이는 방 상태.
 *
 * 방장이 게임을 시작한 뒤부터 방이 끝날 때까지다. 경매·드래프트(`DRAFT`),
 * 자동 편성 확인(`DRAFT_COMPLETED`), 역할 선택, 대진표(`IN_PROGRESS`)가 모두
 * 들어간다. 이 구간에는 입찰·카운트다운·편성 효과음이 나오므로 음악이 그
 * 아래로 내려가야 한다. 대기(`WAITING`)와 완료(`COMPLETED`)는 원래 볼륨이다.
 *
 * 실제 내 경기 중에는 여기가 아니라 `useMyMatchInProgress` 가 음악을 아예 끈다.
 */
const DUCKED_ROOM_STATUSES = new Set([
  "TEAM_SELECTION",
  "DRAFT",
  "DRAFT_COMPLETED",
  "ROLE_SELECTION",
  "IN_PROGRESS",
]);

/**
 * 사이트 배경음악 플레이어.
 *
 * `Providers` 에 한 번만 둔다. 페이지가 아니라 최상위에 있어야 클라이언트
 * 라우팅으로 화면을 옮겨도 곡이 끊기지 않는다. 화면은 그리지 않는다 —
 * 켜고 끄는 버튼은 `BgmToggle` 이다.
 *
 * 곡이 하나도 등록되지 않았으면 아무것도 하지 않는다.
 */
export function BgmPlayer() {
  if (BGM_TRACKS.length === 0) return null;
  return <BgmEngine />;
}

function BgmEngine() {
  const pathname = usePathname();
  const muted = useBgmStore((s) => s.muted);
  const hydrated = useBgmStore((s) => s.hydrated);
  const hydrate = useBgmStore((s) => s.hydrate);
  const syncMuted = useBgmStore((s) => s.syncMuted);
  const gameStarting = useLobbyStore((s) => s.gameStarting);
  const roomStatus = useLobbyStore((s) => s.room?.status);
  const inMatch = useMyMatchInProgress();

  /**
   * 사용자가 페이지와 한 번이라도 상호작용했는가.
   * 브라우저는 클릭·키 입력 전의 소리 있는 자동재생을 막는다. 그래서 "켜짐"이
   * 기본값이어도 실제 재생은 첫 클릭부터 시작한다.
   */
  const [unlocked, setUnlocked] = useState(false);
  /**
   * 여러 탭 중 이 탭이 음악을 맡고 있는가.
   * 방 탭·프로필 탭을 같이 열면 음악이 겹쳐 나온다. 마지막으로 재생을 시작한
   * 탭 하나만 틀고, 나머지는 멈춘다. 멈춘 탭은 포커스를 받거나 클릭되면
   * 다시 맡는다 — 음악이 사용자가 보고 있는 탭을 따라간다.
   */
  const [ownsAudio, setOwnsAudio] = useState(true);

  const silentPath = SILENT_PATH_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix),
  );
  // 사용자 입력과 무관하게 지금 화면·상황에서 음악이 나와도 되는가
  const allowedHere = hydrated && !silentPath && !inMatch;
  const shouldPlay = allowedHere && unlocked && !muted && ownsAudio;
  // 방장이 게임 시작 버튼을 누른 순간에도 줄인다. 방 상태 갱신이 조금 늦게
  // 오기 때문에, 이것 없이는 경매 첫 입찰 소리가 원래 볼륨 음악에 묻힐 수 있다.
  const ducked =
    gameStarting ||
    (roomStatus !== undefined && DUCKED_ROOM_STATUSES.has(roomStatus));
  const targetVolume = ducked ? BGM_DUCKED_VOLUME : BGM_VOLUME;

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const trackRef = useRef<BgmTrack | null>(null);
  const fadeTimerRef = useRef<number | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const tabIdRef = useRef(Math.random().toString(36).slice(2));
  // 비동기 콜백(재생 시작·페이드 완료)에서 최신 판단을 읽기 위한 사본
  const shouldPlayRef = useRef(shouldPlay);
  const allowedHereRef = useRef(allowedHere);
  const targetVolumeRef = useRef(targetVolume);
  /**
   * 게임 시작 곡 전환(앞 곡 줄이기 → 새 곡 걸기)이 진행 중인가.
   * 전환 도중에 볼륨 조정이 끼어들면 앞 곡 페이드가 취소돼 전환이 통째로
   * 사라진다. 게임 시작 순간은 방 상태도 같이 바뀌므로 실제로 겹친다.
   */
  const switchingRef = useRef(false);
  shouldPlayRef.current = shouldPlay;
  allowedHereRef.current = allowedHere;
  targetVolumeRef.current = targetVolume;

  const getAudio = useCallback(() => {
    if (!audioRef.current) {
      const audio = new Audio();
      audio.preload = "auto";
      audio.volume = 0;
      audioRef.current = audio;
    }
    return audioRef.current;
  }, []);

  /**
   * 볼륨을 target 까지 서서히 바꾼다.
   *
   * requestAnimationFrame 이 아니라 타이머를 쓴다. rAF 는 탭이 백그라운드로
   * 가면 멈추는데, 경기가 시작되는 순간 사용자는 대개 롤 클라이언트에 가 있다.
   * rAF 였으면 페이드아웃이 끝나지 않아 경기 내내 음악이 반쯤 남는다.
   * 타이머는 백그라운드에서 느려질 뿐 멈추지 않고, 경과 시간으로 계산하므로
   * 한 번만 돌아도 끝까지 간다.
   *
   * 새 페이드가 시작되면 이전 페이드와 그 완료 콜백은 버린다.
   */
  const fadeTo = useCallback(
    (target: number, durationMs: number, onDone?: () => void) => {
      const audio = getAudio();
      if (fadeTimerRef.current !== null) {
        window.clearInterval(fadeTimerRef.current);
      }
      // 이전 페이드가 곡 전환이었다면 여기서 취소된 것이다. 전환 표시를
      // 남겨 두면 이후 볼륨 조정이 영영 막힌다. 전환은 이 호출 뒤에 다시 켠다.
      switchingRef.current = false;
      const from = audio.volume;
      const startedAt = performance.now();

      fadeTimerRef.current = window.setInterval(() => {
        const progress = Math.min(
          1,
          (performance.now() - startedAt) / durationMs,
        );
        audio.volume = from + (target - from) * progress;
        if (progress < 1) return;

        if (fadeTimerRef.current !== null) {
          window.clearInterval(fadeTimerRef.current);
          fadeTimerRef.current = null;
        }
        onDone?.();
      }, FADE_TICK_MS);
    },
    [getAudio],
  );

  /** 이 탭이 재생을 맡았다고 다른 탭에 알린다 */
  const claim = useCallback(() => {
    channelRef.current?.postMessage({
      type: "claim",
      tabId: tabIdRef.current,
    });
  }, []);

  /** 지금 걸려 있는 곡을 재생하고 볼륨을 올린다 */
  const playLoaded = useCallback(() => {
    const audio = getAudio();
    audio.play().then(
      () => {
        // 재생이 실제로 시작되기까지의 사이에 멈춰야 할 조건이 생겼을 수 있다.
        if (!shouldPlayRef.current) {
          audio.pause();
          return;
        }
        claim();
        fadeTo(targetVolumeRef.current, FADE_IN_MS);
      },
      (error: unknown) => {
        const name = error instanceof DOMException ? error.name : "";
        if (name === "NotAllowedError") {
          // 브라우저가 아직 재생을 허락하지 않았다. 다음 클릭을 기다린다.
          setUnlocked(false);
        } else if (name !== "AbortError") {
          // AbortError 는 로딩 중에 곡을 바꿔서 난 것이라 정상이다.
          // 그 밖(파일 없음·형식 오류)은 조용히 넘기되 흔적은 남긴다.
          console.warn("[bgm] 재생 실패", trackRef.current?.src, error);
        }
      },
    );
  }, [claim, fadeTo, getAudio]);

  /** 곡을 바꿔 걸고 처음부터 재생한다 */
  const startTrack = useCallback(
    (track: BgmTrack) => {
      const audio = getAudio();
      trackRef.current = track;
      audio.src = track.src;
      audio.volume = 0;
      playLoaded();
    },
    [getAudio, playLoaded],
  );

  const startNextTrack = useCallback(
    (options?: { hype?: boolean }) => {
      const next = pickNextTrack(
        BGM_TRACKS,
        trackRef.current?.id ?? null,
        options,
      );
      if (next) startTrack(next);
    },
    [startTrack],
  );

  // 저장된 음소거 설정 읽기
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // 다른 탭에서 음소거를 바꾸면 이 탭도 따른다
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === BGM_MUTED_STORAGE_KEY) {
        syncMuted(event.newValue === "1");
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [syncMuted]);

  // 탭 간 재생 담당 조율
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channelRef.current = channel;
    channel.onmessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; tabId?: string } | null;
      if (data?.type === "claim" && data.tabId !== tabIdRef.current) {
        setOwnsAudio(false);
      }
    };

    // 포커스를 받은 탭이 다시 맡는다. 아직 클릭 전인 탭은 재생 조건이
    // 안 되므로 claim 도 보내지 않고, 기존 탭의 음악도 끊지 않는다.
    const reclaim = () => setOwnsAudio(true);
    window.addEventListener("focus", reclaim);

    return () => {
      window.removeEventListener("focus", reclaim);
      channel.close();
      channelRef.current = null;
    };
  }, []);

  /**
   * 첫 상호작용 대기.
   *
   * 사파리는 재생을 사용자 입력 처리 도중에 직접 호출해야만 허락한다. 그래서
   * 상태만 바꾸고 이펙트에서 틀면 안 되고, 조건이 맞으면 여기서 바로 튼다.
   *
   * window 의 버블 단계에서 받는다. React 핸들러가 먼저 돌기 때문에, 첫 클릭이
   * 음소거 버튼이었다면 음소거가 이미 반영된 뒤라 소리가 새지 않는다.
   */
  useEffect(() => {
    if (unlocked) return;
    const unlock = () => {
      setUnlocked(true);
      setOwnsAudio(true);
      const audio = getAudio();
      if (
        allowedHereRef.current &&
        !useBgmStore.getState().muted &&
        audio.paused
      ) {
        // 이펙트보다 먼저 재생 판단이 참이 되도록 사본을 앞당겨 맞춘다.
        shouldPlayRef.current = true;
        if (audio.src) playLoaded();
        else startNextTrack();
      }
    };
    const events = ["click", "keydown", "touchend"] as const;
    events.forEach((name) => window.addEventListener(name, unlock));
    return () =>
      events.forEach((name) => window.removeEventListener(name, unlock));
  }, [unlocked, getAudio, playLoaded, startNextTrack]);

  // 곡이 끝나면 다른 곡으로 넘어간다 (같은 곡 연속 재생 없음)
  useEffect(() => {
    const audio = getAudio();
    const onEnded = () => {
      if (shouldPlayRef.current) startNextTrack();
    };
    audio.addEventListener("ended", onEnded);
    return () => audio.removeEventListener("ended", onEnded);
  }, [getAudio, startNextTrack]);

  // 재생 조건이 바뀔 때: 켜야 하면 이어서 틀고, 꺼야 하면 줄이고 멈춘다
  useEffect(() => {
    const audio = getAudio();

    if (shouldPlay) {
      if (!audio.paused) {
        // 페이드아웃 도중에 다시 켜진 경우. 멈추지 않고 볼륨만 되돌린다.
        fadeTo(targetVolumeRef.current, FADE_IN_MS);
      } else if (audio.src) {
        // 멈췄던 곡을 그 자리에서 이어서 튼다
        playLoaded();
      } else {
        startNextTrack();
      }
      return;
    }

    if (!audio.paused) {
      fadeTo(0, FADE_OUT_MS, () => {
        if (!shouldPlayRef.current) audio.pause();
      });
    }
  }, [shouldPlay, fadeTo, getAudio, playLoaded, startNextTrack]);

  /**
   * 게임 시작 순간 곡 전환.
   *
   * 방장이 로비에서 게임을 시작하면 서버가 방 전체에 `game-starting` 을 보낸다.
   * 그 순간 흥을 올리는 곡(hype)으로 바꾼다. 음악이 꺼져 있는 사람에게는
   * 아무 일도 하지 않는다 — 나중에 켰을 때 뜬금없이 시작 곡이 나오면 어색하다.
   */
  const prevGameStartingRef = useRef(gameStarting);
  useEffect(() => {
    const rising = gameStarting && !prevGameStartingRef.current;
    prevGameStartingRef.current = gameStarting;
    if (!rising) return;

    const audio = getAudio();
    if (!shouldPlayRef.current || audio.paused) return;

    fadeTo(0, SWITCH_FADE_MS, () => {
      switchingRef.current = false;
      // 새 곡은 그 시점의 목표 볼륨(대개 줄인 볼륨)까지 올라온다.
      if (shouldPlayRef.current) startNextTrack({ hype: true });
    });
    switchingRef.current = true;
  }, [gameStarting, fadeTo, getAudio, startNextTrack]);

  /**
   * 게임 진행 구간에 들어가거나 나오면 볼륨만 옮긴다.
   *
   * 재생 중일 때만 한다. 멈춰 있거나 끄는 중(페이드아웃)이면 건드리지 않는다 —
   * 다음에 재생을 시작할 때 `targetVolumeRef` 로 알아서 맞춰진다.
   */
  useEffect(() => {
    const audio = getAudio();
    if (!shouldPlayRef.current || audio.paused || switchingRef.current) return;
    fadeTo(targetVolume, DUCK_FADE_MS);
  }, [targetVolume, fadeTo, getAudio]);

  // 정리. Providers 는 사실상 내려가지 않지만 개발 중 핫 리로드 대비.
  useEffect(() => {
    return () => {
      if (fadeTimerRef.current !== null) {
        window.clearInterval(fadeTimerRef.current);
      }
      audioRef.current?.pause();
    };
  }, []);

  return null;
}
