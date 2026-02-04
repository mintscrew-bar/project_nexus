"use client";

import { useState, useEffect } from "react";
import { RoomList } from "@/components/rooms/RoomList";
import { RoomCreationForm } from "@/components/rooms/RoomCreationForm";
import { Button, Modal } from "@/components/ui";
import { useKeyboardShortcutsContext } from "@/components/KeyboardShortcuts";
import { Plus } from "lucide-react";

export default function TournamentsPage() {
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const { setActionHandler } = useKeyboardShortcutsContext();

  // Register "n" key to open room creation modal
  useEffect(() => {
    setActionHandler(() => setIsCreatingRoom(true));
    return () => setActionHandler(null);
  }, [setActionHandler]);

  return (
    <div className="flex-grow p-4 md:p-8">
      <div className="container mx-auto animate-fade-in">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-text-primary">내전 방 목록</h1>
            <p className="text-text-secondary mt-1">참여할 내전 방을 선택하거나 새로 만들어보세요</p>
          </div>
          <Button onClick={() => setIsCreatingRoom(true)}>
            <Plus className="h-5 w-5 mr-2" />
            방 생성
          </Button>
        </div>

        <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-4 md:p-6 animate-slide-up">
          <h2 className="text-xl font-bold text-text-primary mb-4">참여 가능한 방</h2>
          <RoomList />
        </div>

        <Modal
          isOpen={isCreatingRoom}
          onClose={() => setIsCreatingRoom(false)}
          title="새 내전 방 생성"
          size="md"
        >
          <RoomCreationForm onCancel={() => setIsCreatingRoom(false)} />
        </Modal>
      </div>
    </div>
  );
}
