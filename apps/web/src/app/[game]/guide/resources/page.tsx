import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen, CalendarDays, Clock3 } from "lucide-react";
import { guideBase, guideGame, guideUrl } from "@/lib/guide-links";
import { RESOURCE_ARTICLES } from "@/app/resources/articles";
import { GuidePageLayout, GuideSection } from "../_components/GuidePageLayout";

// 운영 자료는 게임 공통 문안이라 canonical 은 기본 게임 하나로 모은다.
// 게임별로 갈리는 다른 가이드(faq·team-modes 등)와 달리 내용이 같아서,
// 두 URL 을 각자 색인시키면 같은 글이 중복으로 잡힌다.
export const metadata: Metadata = {
  title: "내전 운영 자료 — Nexus",
  description: "Nexus의 실제 운영 체크리스트와 기능 개선 기록을 문서별로 확인하세요.",
  alternates: { canonical: guideUrl("/guide/resources") },
};

export default async function GuideResourcesPage({
  params,
}: {
  params: Promise<{ game: string }>;
}) {
  // 링크는 지금 보고 있는 게임을 따라간다. `/lol` 로 박아 두면 배그 가이드에서
  // 문서를 누르는 순간 롤 화면으로 튕기고 배그 테마까지 벗겨진다.
  const base = guideBase(guideGame((await params).game));
  return (
    <GuidePageLayout
      icon={BookOpen}
      title="운영 자료"
      description="실제 내전 운영과 사용자 피드백에서 출발한 체크리스트, 모드 선택법, 기능 개선 기록을 모았습니다."
    >
      <GuideSection title={`전체 문서 ${RESOURCE_ARTICLES.length}개`} description="필요한 문서를 선택하면 별도의 읽기 페이지로 이동합니다.">
        <div className="grid gap-3 md:grid-cols-2">
          {RESOURCE_ARTICLES.map((article) => (
            <Link
              key={article.slug}
              href={`${base}/guide/${article.slug}`}
              className="group flex min-h-56 flex-col rounded-2xl bg-bg-primary/35 p-5 transition-colors hover:bg-bg-elevated/35 md:p-6"
            >
              <div className="flex flex-wrap gap-3 text-xs text-text-tertiary">
                <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />{article.updatedAt}</span>
                <span className="inline-flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" />{article.readingTime}</span>
              </div>
              <h2 className="mt-4 text-lg font-bold leading-snug text-text-primary transition-colors group-hover:text-accent-primary md:text-xl">{article.title}</h2>
              <p className="mt-3 line-clamp-3 text-sm leading-6 text-text-secondary">{article.description}</p>
              <ArrowRight className="mt-auto h-4 w-4 text-accent-primary transition-transform group-hover:translate-x-1" />
            </Link>
          ))}
        </div>
      </GuideSection>
    </GuidePageLayout>
  );
}
