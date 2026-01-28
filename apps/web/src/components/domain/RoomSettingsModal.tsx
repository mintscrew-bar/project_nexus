"use client";

import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Switch } from '@/components/ui/Switch';
import { Loader2, Settings } from 'lucide-react';
import { RoomSettingsDto, useLobbyStore } from '@/stores/lobby-store';

interface RoomSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  room: {
    id: string;
    name: string;
    maxParticipants: number;
    isPrivate: boolean;
  };
}

export function RoomSettingsModal({ isOpen, onClose, room }: RoomSettingsModalProps) {
  const { updateRoomSettings } = useLobbyStore();
  const [settings, setSettings] = useState<RoomSettingsDto>({
    name: room.name,
    maxParticipants: room.maxParticipants,
    password: '',
  });
  const [isPrivate, setIsPrivate] = useState(room.isPrivate);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSettings({
        name: room.name,
        maxParticipants: room.maxParticipants,
        password: '',
      });
      setIsPrivate(room.isPrivate);
      setError(null);
    }
  }, [isOpen, room]);

  const handleSave = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      const settingsToUpdate: RoomSettingsDto = { name: settings.name, maxParticipants: settings.maxParticipants };
      if(isPrivate) {
        // Only include password if it's not empty
        if(settings.password) {
            settingsToUpdate.password = settings.password;
        }
      } else {
        // Explicitly set password to null to make it public
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
    <Modal isOpen={isOpen} onClose={onClose} title="방 설정">
      <p className="text-text-secondary mb-4">방의 제목, 최대 인원, 비밀번호를 변경할 수 있습니다.</p>
      <div className="py-4 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">방 제목</Label>
          <Input
            id="name"
            value={settings.name}
            onChange={(e) => setSettings({ ...settings, name: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="maxParticipants">최대 인원</Label>
          <select
            id="maxParticipants"
            value={settings.maxParticipants}
            onChange={(e) => setSettings({ ...settings, maxParticipants: parseInt(e.target.value) })}
            className="w-full p-2 border rounded-md bg-bg-secondary"
          >
            <option value={10}>10</option>
            <option value={15}>15</option>
            <option value={20}>20</option>
          </select>
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="isPrivate">비공개 방</Label>
          <Switch
            id="isPrivate"
            checked={isPrivate}
            onCheckedChange={setIsPrivate}
          />
        </div>
        {isPrivate && (
          <div className="space-y-2">
            <Label htmlFor="password">비밀번호 (변경 시에만 입력)</Label>
            <Input
              id="password"
              type="password"
              value={settings.password || ''}
              onChange={(e) => setSettings({ ...settings, password: e.target.value })}
              placeholder="새 비밀번호"
            />
          </div>
        )}
        {error && <p className="text-sm text-accent-danger">{error}</p>}
      </div>
      <div className="flex justify-end gap-3 pt-4">
        <Button variant="outline" onClick={onClose}>취소</Button>
        <Button onClick={handleSave} disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          저장
        </Button>
      </div>
    </Modal>
  );
}
