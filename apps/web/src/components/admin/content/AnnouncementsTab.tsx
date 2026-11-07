"use client";

import { useState } from "react";
import { adminApi } from "@/lib/api-client";
import { Card, CardContent, Button, LoadingSpinner } from "@/components/ui";
import { Megaphone, AlertTriangle } from "lucide-react";
import type { AddToast } from "../shared";

export function AnnouncementsTab({ addToast }: { addToast: AddToast }) {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [link, setLink] = useState("");
  const [sending, setSending] = useState(false);
  // 모달로도 띄울지 — 전체 유저 화면을 가리므로 기본은 끔
  const [popup, setPopup] = useState(false);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !message.trim()) return;
    setSending(true);
    try {
      await adminApi.sendAnnouncement(title, message, link || undefined, popup);
      addToast("공지가 전체 유저에게 발송되었습니다.", "success");
      setTitle("");
      setMessage("");
      setLink("");
      setPopup(false);
    } catch {
      addToast("공지 발송 실패", "error");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4 max-w-lg">
      <h2 className="text-lg font-semibold text-text-primary">
        전체 공지 발송
      </h2>
      <Card className="p-0">
        <CardContent className="p-5">
          <form onSubmit={handleSend} className="space-y-4">
            <div>
              <label className="block text-sm text-text-muted mb-1.5">
                제목 *
              </label>
              <input
                type="text"
                value={title}
                maxLength={100}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="공지 제목"
                className="w-full px-3 py-2 rounded-lg bg-bg-tertiary text-text-primary text-sm focus:outline-none focus:ring-1 focus:ring-accent-primary"
              />
            </div>
            <div>
              <label className="block text-sm text-text-muted mb-1.5">
                내용 *
              </label>
              <textarea
                value={message}
                maxLength={2000}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="공지 내용"
                rows={5}
                className="w-full px-3 py-2 rounded-lg bg-bg-tertiary text-text-primary text-sm resize-none focus:outline-none focus:ring-1 focus:ring-accent-primary"
              />
            </div>
            <div>
              <label className="block text-sm text-text-muted mb-1.5">
                링크 (선택)
              </label>
              <input
                type="text"
                value={link}
                maxLength={500}
                onChange={(e) => setLink(e.target.value)}
                placeholder="https://..."
                className="w-full px-3 py-2 rounded-lg bg-bg-tertiary text-text-primary text-sm focus:outline-none focus:ring-1 focus:ring-accent-primary"
              />
            </div>
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-bg-elevated bg-bg-tertiary p-3 text-sm">
              <input
                type="checkbox"
                checked={popup}
                onChange={(e) => setPopup(e.target.checked)}
                className="mt-0.5 accent-accent-primary"
              />
              <span>
                <span className="font-medium text-text-primary">
                  모달로 띄우기
                </span>
                <span className="mt-0.5 block text-xs text-text-muted">
                  접속한 유저 화면 가운데에 공지 창이 뜹니다. 확인할 때까지
                  접속할 때마다 다시 뜹니다.
                </span>
              </span>
            </label>
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 flex gap-2 text-sm text-yellow-400">
              <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span>
                이 공지는 <strong>모든 가입 유저</strong>에게 알림으로
                전송됩니다{popup ? " (모달로도 뜹니다)" : ""}.
              </span>
            </div>
            <Button
              type="submit"
              disabled={!title.trim() || !message.trim() || sending}
              className="w-full"
            >
              {sending ? (
                <LoadingSpinner />
              ) : (
                <>
                  <Megaphone className="h-4 w-4 mr-2" />
                  전체 공지 발송
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
