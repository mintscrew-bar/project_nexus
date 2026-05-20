"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useAuthStore } from "@/stores/auth-store";
import { NEXUS_DISCORD_INVITE_URL } from "@/lib/constants";
import { AddAccountModal } from "@/components/domain/AddAccountModal";
import { Swords, MessageSquare, Trophy, Check, ChevronLeft, ChevronRight } from "lucide-react";

// 첫 방문 가이드 노출 여부 저장 키 (버전 suffix로 추후 가이드 갱신 시 재노출 가능)
const STORAGE_KEY = "nexus:onboarding-seen-v1";

export function OnboardingGuideModal() {
  const { user, isAuthenticated, fetchUser } = useAuthStore();
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [addAccountOpen, setAddAccountOpen] = useState(false);

  // 첫 방문(미열람) + 로그인 상태일 때만 자동 노출
  useEffect(() => {
    if (!isAuthenticated) return;
    if (typeof window === "undefined") return;
    const seen = window.localStorage.getItem(STORAGE_KEY);
    if (!seen) setIsOpen(true);
  }, [isAuthenticated]);

  const close = () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, "1");
    }
    setIsOpen(false);
  };

  // 라이엇 계정 + 역할 등록 완료 여부 (디스코드는 로그인 = 이미 연동이므로 제외)
  const hasRiot = (user?.riotAccounts?.length ?? 0) > 0;
  const primaryRiot = user?.riotAccounts?.[0];
  const hasRoles = !!primaryRiot?.mainRole;
  const accountDone = hasRiot && hasRoles;

  type Step = {
    icon: React.ReactNode;
    title: string;
    description: string;
    hint: string;
    done: boolean;
    actions: { label: string; variant: "primary" | "outline"; onClick: () => void }[];
    gallery?: { src: string; caption: string }[];
  };

  const steps: Step[] = [
    {
      icon: <Swords className="h-7 w-7 text-accent-primary" />,
      title: "1. 라이엇 계정 & 역할 설정",
      description:
        "소환사명으로 라이엇 계정을 연동하고, 주·부 라인과 선호 챔피언을 등록하세요. 티어·전적이 자동 표시되고 팀 구성과 자동 밸런싱에 사용됩니다.",
      hint: "프로필·설정 페이지에서 언제든 수정할 수 있어요.",
      done: accountDone,
      actions: [
        {
          label: accountDone ? "계정 관리" : "라이엇 계정 연동하기",
          variant: accountDone ? ("outline" as const) : ("primary" as const),
          onClick: () => setAddAccountOpen(true),
        },
      ],
    },
    {
      icon: <MessageSquare className="h-7 w-7 text-accent-primary" />,
      title: "2. 디스코드 서버 입장",
      description:
        "넥서스 디스코드 서버에 들어오면 내전 중 음성 채널 자동 이동, 내전 공지, 매치 결과 알림을 받을 수 있어요.",
      hint: "내전의 음성 진행은 디스코드에서 이뤄집니다.",
      done: false,
      actions: [
        {
          label: "디스코드 참여하기",
          variant: "primary" as const,
          onClick: () =>
            window.open(NEXUS_DISCORD_INVITE_URL, "_blank", "noopener,noreferrer"),
        },
      ],
    },
    {
      icon: <Trophy className="h-7 w-7 text-accent-primary" />,
      title: "3. 내전 참여하기",
      description:
        "내전 목록에서 열려 있는 방에 참여하거나 직접 방을 만들 수 있어요. 아래 순서로 진행됩니다.",
      hint: "",
      done: false,
      actions: [],
      // 내전 흐름 안내 이미지 (public/images/onboarding/ 에 배치)
      gallery: [
        { src: "/images/onboarding/room-create.jpg", caption: "① 원하는 인원·팀 구성 방식으로 방을 만들면, 디스코드 서버에 그 방에 맞는 채널이 생성돼요." },
        { src: "/images/onboarding/auction.jpg", caption: "② 팀장이 포인트로 선수를 입찰해 팀을 구성해요. (경매 드래프트)" },
        { src: "/images/onboarding/discord-voice.jpg", caption: "③ 팀 구성이 완료되면 자동으로 디스코드 팀 음성 채널에 배정돼요." },
      ],
    },
  ];

  const isLast = step === steps.length - 1;
  const current = steps[step];

  if (!isOpen) return null;

  return (
    <>
      <Modal isOpen={isOpen && !addAccountOpen} onClose={close} size="md" showCloseButton={false}>
        <div className="flex flex-col items-center text-center px-2 py-1">
          {/* 단계 진행 표시 */}
          <div className="flex items-center gap-2 mb-5">
            {steps.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === step ? "w-6 bg-accent-primary" : "w-1.5 bg-bg-tertiary"
                }`}
              />
            ))}
          </div>

          {/* 아이콘 + 완료 뱃지 */}
          <div className="relative mb-4">
            <div className="w-14 h-14 rounded-2xl bg-accent-primary/10 flex items-center justify-center">
              {current.icon}
            </div>
            {current.done && (
              <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-accent-success flex items-center justify-center">
                <Check className="h-3 w-3 text-white" />
              </span>
            )}
          </div>

          <h2 className="text-lg font-bold text-text-primary mb-2">{current.title}</h2>
          {current.done && (
            <span className="mb-2 text-xs font-medium text-accent-success">완료된 단계예요 ✓</span>
          )}
          <p className="text-sm text-text-secondary leading-relaxed mb-2 max-w-sm">
            {current.description}
          </p>
          {current.hint && (
            <p className="text-xs text-text-tertiary mb-4 max-w-sm">{current.hint}</p>
          )}

          {/* 내전 흐름 안내 이미지 갤러리 */}
          {current.gallery && (
            <div className="w-full max-h-[42vh] overflow-y-auto space-y-4 mb-5 pr-1">
              {current.gallery.map((g) => (
                <figure key={g.src} className="space-y-1.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={g.src}
                    alt={g.caption}
                    className="w-full rounded-lg border border-bg-tertiary"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                  <figcaption className="text-xs text-text-secondary text-left">{g.caption}</figcaption>
                </figure>
              ))}
            </div>
          )}

          {/* 단계별 액션 */}
          {current.actions.length > 0 && (
            <div className="flex flex-wrap justify-center gap-2 mb-6 w-full">
              {current.actions.map((a) => (
                <Button key={a.label} variant={a.variant} size="sm" onClick={a.onClick}>
                  {a.label}
                </Button>
              ))}
            </div>
          )}
          {current.actions.length === 0 && <div className="mb-6" />}

          {/* 하단 네비게이션 */}
          <div className="flex items-center justify-between w-full border-t border-bg-tertiary pt-4">
            <button
              onClick={close}
              className="text-xs text-text-tertiary hover:text-text-secondary transition-colors"
            >
              건너뛰기
            </button>
            <div className="flex items-center gap-2">
              {step > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setStep((s) => s - 1)}>
                  <ChevronLeft className="h-4 w-4 mr-1" />이전
                </Button>
              )}
              {isLast ? (
                <Button size="sm" onClick={close}>
                  시작하기
                </Button>
              ) : (
                <Button size="sm" onClick={() => setStep((s) => s + 1)}>
                  다음<ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </Modal>

      {/* 1단계: 라이엇 계정 + 역할 + 챔피언 등록 (온보딩 위에 겹쳐 열림) */}
      <AddAccountModal
        isOpen={addAccountOpen}
        onClose={() => setAddAccountOpen(false)}
        onAccountAdded={() => {
          setAddAccountOpen(false);
          // 완료 뱃지 갱신을 위해 유저 정보 재조회
          fetchUser().catch(() => {});
        }}
      />
    </>
  );
}
