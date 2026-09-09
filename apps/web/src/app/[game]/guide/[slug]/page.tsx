import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CalendarDays, Clock3 } from "lucide-react";
import { guideBase, guideGame, guideUrl } from "@/lib/guide-links";
import { getResourceArticle, RESOURCE_ARTICLES } from "@/app/resources/articles";
import { AdSlotCard } from "@/components/ads/AdSlot";

export function generateStaticParams() {
  return RESOURCE_ARTICLES.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = getResourceArticle(slug);
  if (!article) return {};

  return {
    title: article.title,
    description: article.description,
    // 운영 자료는 게임 공통 문안이라 canonical 은 기본 게임 하나로 모은다.
    // 같은 글이 `/lol` `/pubg` 두 URL 로 중복 색인되지 않게 한다.
    alternates: { canonical: guideUrl(`/guide/${article.slug}`) },
    openGraph: {
      title: article.title,
      description: article.description,
      url: guideUrl(`/guide/${article.slug}`),
      type: "article",
    },
  };
}

export default async function GuideArticlePage({
  params,
}: {
  params: Promise<{ game: string; slug: string }>;
}) {
  const { game, slug } = await params;
  const article = getResourceArticle(slug);
  if (!article) notFound();

  // 돌아가기 링크는 지금 보고 있는 게임을 따라간다. `/lol` 로 박아 두면
  // 배그 가이드에서 글을 읽고 나올 때 롤 화면으로 튕긴다.
  const base = guideBase(guideGame(game));

  return (
    <main className="flex-grow bg-bg-primary">
      <article className="mx-auto max-w-3xl px-4 py-10 md:px-6 md:py-16">
        <Link
          href={`${base}/guide/resources`}
          className="inline-flex items-center gap-2 text-sm font-medium text-accent-primary hover:underline"
        >
          <ArrowLeft className="h-4 w-4" /> 가이드 · 운영 자료
        </Link>

        <header className="mt-7 pb-8">
          <p className="text-sm font-semibold text-accent-primary">Nexus 운영 문서</p>
          <h1 className="mt-3 text-3xl font-black leading-tight text-text-primary md:text-5xl">
            {article.title}
          </h1>
          <p className="mt-5 text-base leading-8 text-text-secondary md:text-lg">
            {article.intro}
          </p>
          <div className="mt-6 flex flex-wrap gap-4 text-sm text-text-tertiary">
            <span>작성 Nexus 운영팀</span>
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="h-4 w-4" /> 업데이트 {article.updatedAt}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock3 className="h-4 w-4" /> {article.readingTime} 읽기
            </span>
          </div>
        </header>

        <div className="mt-10 space-y-10">
          {article.sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-xl font-bold text-text-primary md:text-2xl">
                {section.title}
              </h2>
              <div className="mt-4 space-y-4 text-sm leading-7 text-text-secondary md:text-base">
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
              {section.checklist && (
                <ul className="mt-5 space-y-2 rounded-xl bg-accent-primary/[0.07] p-5 text-sm text-text-secondary">
                  {section.checklist.map((item) => (
                    <li key={item}>✓ {item}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>

        <aside className="mt-12 rounded-xl bg-bg-secondary p-5 shadow-[0_12px_36px_rgb(0_0_0/0.08)]">
          <h2 className="font-bold text-text-primary">다음 자료</h2>
          <div className="mt-3 grid gap-2">
            {RESOURCE_ARTICLES.filter((item) => item.slug !== article.slug).map((item) => (
              <Link
                key={item.slug}
                href={`${base}/guide/${item.slug}`}
                className="text-sm text-accent-primary hover:underline"
              >
                {item.title}
              </Link>
            ))}
          </div>
        </aside>

        <AdSlotCard
          slotKey="article"
          minHeight={100}
          className="mt-12"
        />
      </article>
    </main>
  );
}
