"use client";

import { useState } from "react";
import { Check, Copy, Loader2, ShieldCheck } from "lucide-react";
import { Button, Modal } from "@/components/ui";
import { streamerApi, type StreamerPlatformKind } from "@/lib/api-client";

const PLATFORM_LABELS: Record<string, string> = {
  CHZZK: "치지직",
  SOOP: "SOOP",
  YOUTUBE: "유튜브",
};

/**
 * 채널 소유권 인증 모달.
 *
 * 발급받은 코드를 스트리머가 직접 수정할 수 있는 채널 필드에 넣게 하고,
 * 우리가 그 필드를 읽어서 대조한다.
 * 코드를 넣을 위치는 플랫폼마다 다르므로(치지직=채널 소개,
 * SOOP=방송국 제목·이름) 안내 문구는 서버가 내려주는 instruction을 그대로 쓴다.
 * 코드를 넣을 필드 자체가 없는 플랫폼만 관리자 수동 확인으로 넘어간다.
 */
export function ChannelVerifyModal({
  platform,
  onClose,
  onVerified,
  addToast,
}: {
  platform: StreamerPlatformKind;
  onClose: () => void;
  onVerified: () => Promise<void>;
  addToast: (message: string, type: "success" | "error") => void;
}) {
  const [code, setCode] = useState<string | null>(null);
  const [instruction, setInstruction] = useState("");
  const [issuing, setIssuing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [copied, setCopied] = useState(false);

  const label = PLATFORM_LABELS[platform] ?? platform;

  const readMessage = (error: unknown, fallback: string): string => {
    const message = (
      error as { response?: { data?: { message?: string | string[] } } }
    )?.response?.data?.message;
    if (Array.isArray(message)) return message[0];
    return message || fallback;
  };

  const handleIssue = async () => {
    setIssuing(true);
    try {
      const result = await streamerApi.issueVerificationCode(platform);
      setCode(result.code);
      setInstruction(result.instruction);
    } catch (error) {
      addToast(readMessage(error, "인증 코드 발급에 실패했습니다."), "error");
    } finally {
      setIssuing(false);
    }
  };

  const handleCopy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      addToast("복사에 실패했습니다. 코드를 직접 선택해주세요.", "error");
    }
  };

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      await streamerApi.confirmVerification(platform);
      await onVerified();
      addToast("채널 인증이 완료되었습니다.", "success");
      onClose();
    } catch (error) {
      addToast(readMessage(error, "인증에 실패했습니다."), "error");
    } finally {
      setConfirming(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={`${label} 채널 인증`}>
      <div className="space-y-4">
        <p className="text-sm text-text-secondary">
          채널이 본인의 것인지 확인합니다. 인증을 마쳐야 스트리머 목록과 내전 방
          목록에 <span className="font-semibold text-red-500">LIVE</span> 표시가
          붙습니다.
        </p>

        {!code ? (
          <Button onClick={handleIssue} disabled={issuing} className="w-full">
            {issuing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="mr-2 h-4 w-4" />
            )}
            인증 코드 발급받기
          </Button>
        ) : (
          <>
            <div className="rounded-xl border border-bg-tertiary bg-bg-tertiary/40 p-4">
              <p className="mb-2 text-xs font-semibold text-text-muted">
                인증 코드
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 select-all rounded-lg bg-bg-primary px-3 py-2 font-mono text-sm font-bold tracking-wider text-accent-primary">
                  {code}
                </code>
                <Button variant="outline" size="sm" onClick={handleCopy}>
                  {copied ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            <ol className="space-y-2 text-sm text-text-secondary">
              <li className="flex gap-2">
                <span className="font-bold text-accent-primary">1.</span>
                <span>{instruction}</span>
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-accent-primary">2.</span>
                <span>
                  저장한 뒤 아래 인증하기를 눌러주세요. 인증이 끝나면 코드는
                  지우셔도 됩니다.
                </span>
              </li>
            </ol>

            <p className="text-xs text-text-muted">
              코드는 30분간 유효합니다. 만료되면 다시 발급받아주세요.
            </p>

            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose} className="flex-1">
                나중에
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={confirming}
                className="flex-1"
              >
                {confirming && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                인증하기
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
