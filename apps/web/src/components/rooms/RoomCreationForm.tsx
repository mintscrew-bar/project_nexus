"use client";

import { useState } from "react";
import { useRoomStore } from "@/stores/room-store"; // Import useRoomStore
import { useRouter } from "next/navigation"; // Import useRouter

interface RoomCreationFormProps {
  onCancel: () => void;
  onRoomCreated?: (roomId: string) => void;
}

export function RoomCreationForm({ onCancel, onRoomCreated }: RoomCreationFormProps) {
  const router = useRouter();
  const { createRoom, isLoading, error } = useRoomStore();
  const [title, setTitle] = useState("");
  const [maxPlayers, setMaxPlayers] = useState(10); // Default to 10 for 5v5
  const [teamMode, setTeamMode] = useState<"AUCTION" | "LADDER">("AUCTION"); // Renamed to teamMode
  const [isPrivate, setIsPrivate] = useState(false);
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null); // Add errorMessage state

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null); // Clear previous errors

    const roomData = {
      title,
      maxPlayers,
      teamMode,
      isPrivate,
      password: isPrivate ? password : undefined,
    };

    const newRoom = await createRoom(roomData);
    if (newRoom) {
      if (onRoomCreated) {
        onRoomCreated(newRoom.id);
      } else {
        router.push(`/tournaments/${newRoom.id}/lobby`); // Navigate to lobby on successful creation
      }
    } else {
      setErrorMessage(error); // Display error from store
    }
  };
  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="title" className="block text-text-primary text-sm font-semibold mb-1">
          방 제목
        </label>
        <input
          type="text"
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="예: 경매 내전, 즐겜팟"
          className="w-full input"
          required
        />
      </div>

      <div>
        <label htmlFor="maxPlayers" className="block text-text-primary text-sm font-semibold mb-1">
          참가 인원
        </label>
        <select
          id="maxPlayers"
          value={maxPlayers}
          onChange={(e) => setMaxPlayers(parseInt(e.target.value, 10))}
          className="w-full input"
        >
          <option value={10}>10명 (5대5)</option>
          <option value={12}>12명 (6대6)</option>
          <option value={16}>16명 (4팀 토너먼트)</option>
          <option value={20}>20명 (4팀 토너먼트)</option>
        </select>
      </div>

      <div>
        <label htmlFor="teamSelectionMethod" className="block text-text-primary text-sm font-semibold mb-1">
          팀 구성 방식
        </label>
        <select
          id="teamSelectionMethod"
          value={teamMode}
          onChange={(e) => setTeamMode(e.target.value as "AUCTION" | "LADDER")}
          className="w-full input"
        >
          <option value="AUCTION">경매</option>
          <option value="LADDER">사다리타기 (미구현)</option>
        </select>
      </div>

      <div className="flex items-center space-x-2">
        <input
          type="checkbox"
          id="isPrivate"
          checked={isPrivate}
          onChange={(e) => setIsPrivate(e.target.checked)}
          className="h-4 w-4 text-accent-primary focus:ring-accent-primary border-text-muted rounded"
        />
        <label htmlFor="isPrivate" className="text-text-primary text-sm">
          비공개 방
        </label>
      </div>

      {isPrivate && (
        <div>
          <label htmlFor="password" className="block text-text-primary text-sm font-semibold mb-1">
            비밀번호
          </label>
          <input
            type="password"
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full input"
            required
          />
        </div>
      )}

      {errorMessage && (
        <p className="text-accent-danger text-sm mt-2">{errorMessage}</p>
      )}
      <div className="flex justify-end space-x-4">
        <button
          type="button"
          onClick={onCancel}
          className="px-6 py-2 bg-bg-tertiary hover:bg-bg-elevated text-text-primary font-bold rounded-lg transition-colors duration-200"
          disabled={isLoading}
        >
          취소
        </button>
        <button
          type="submit"
          className="px-6 py-2 bg-accent-primary hover:bg-accent-hover text-white font-bold rounded-lg transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={isLoading}
        >
          {isLoading ? "생성 중..." : "방 생성"}
        </button>
      </div>
    </form>
  );
}
