"use client";

// 랜딩(비로그인) 전용 모바일 햄버거 내비.
// 앱 내부 MobileMenu는 계정/관리자 항목이 섞여 있어 공개 랜딩엔 부적합하므로,
// 랜딩 링크 세트 + 로그인 CTA + Discord만 담은 가벼운 드로어를 별도로 둔다.
import { ExternalLink, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import { DiscordIcon } from "@/components/icons/DiscordIcon";
import { NEXUS_DISCORD_INVITE_URL } from "@/lib/constants";

type NavLink = { href: string; label: string };

export function LandingMobileNav({ links }: { links: NavLink[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  // 라우트 이동 시 닫기
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  // 열려 있을 때 body 스크롤 잠금
  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "unset";
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  return (
    <div className="md:hidden">
      <button
        onClick={() => setIsOpen(true)}
        className="rounded-lg p-2 text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary"
        aria-label="메뉴 열기"
        aria-expanded={isOpen}
      >
        <Menu className="h-6 w-6" />
      </button>

      {/* 오버레이 */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* 드로어 (우측) */}
      <div
        className={`fixed bottom-0 right-0 top-0 z-50 flex w-72 max-w-[80vw] flex-col border-l border-bg-tertiary bg-bg-secondary transition-transform duration-300 ease-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
        aria-hidden={!isOpen}
        inert={!isOpen}
      >
        <div className="flex flex-shrink-0 items-center justify-between border-b border-bg-tertiary p-4">
          <Link
            href="/"
            className="flex items-center gap-2"
            onClick={() => setIsOpen(false)}
          >
            <Logo size="sm" variant="icon-only" />
            <span className="text-xl font-bold text-text-primary">Nexus</span>
          </Link>
          <button
            onClick={() => setIsOpen(false)}
            className="rounded-lg p-2 text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary"
            aria-label="메뉴 닫기"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-4" aria-label="랜딩 모바일 메뉴">
          <ul className="space-y-1">
            {links.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={() => setIsOpen(false)}
                  className="block rounded-lg px-3 py-2.5 font-medium text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex-shrink-0 space-y-3 border-t border-bg-tertiary p-4">
          <Link
            href="/auth/login"
            onClick={() => setIsOpen(false)}
            className="block rounded-lg bg-accent-primary px-4 py-2.5 text-center text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
          >
            무료로 시작하기
          </Link>
          <a
            href={NEXUS_DISCORD_INVITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between rounded-lg border border-[#5865F2]/30 bg-[#5865F2]/10 px-3 py-3 font-medium text-[#5865F2] transition-colors hover:bg-[#5865F2]/20 dark:border-[#5865F2]/20 dark:text-[#C7D2FE]"
          >
            <span className="flex items-center gap-3">
              <DiscordIcon className="h-5 w-5" />
              <span className="font-medium">Discord 참가</span>
            </span>
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </div>
    </div>
  );
}
