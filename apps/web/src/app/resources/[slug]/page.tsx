import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CalendarDays, Clock3 } from "lucide-react";
import { absoluteUrl } from "@/lib/seo";
import { getResourceArticle, RESOURCE_ARTICLES } from "../articles";

export function generateStaticParams() {
  return RESOURCE_ARTICLES.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const article = getResourceArticle(slug);
  if (!article) return {};

  return {
    title: article.title,
    description: article.description,
    alternates: { canonical: absoluteUrl(`/resources/${article.slug}`) },
    openGraph: {
      title: article.title,
      description: article.description,
      url: absoluteUrl(`/resources/${article.slug}`),
      type: "article",
    },
  };
}

export default async function ResourceArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = getResourceArticle(slug);
  if (!article) notFound();

  return (
    <main className="flex-grow bg-bg-primary">
      <article className="mx-auto max-w-3xl px-4 py-10 md:px-6 md:py-16">
        <Link href="/resources" className="inline-flex items-center gap-2 text-sm font-medium text-accent-primary hover:underline">
          <ArrowLeft className="h-4 w-4" /> 운영 자료실
        </Link>
        <header className="mt-7 border-b border-bg-tertiary pb-8">
          <p className="text-sm font-semibold text-accent-primary">Nexus 운영 문서</p>
          <h1 className="mt-3 text-3xl font-black leading-tight text-text-primary md:text-5xl">{article.title}</h1>
          <p className="mt-5 text-base leading-8 text-text-secondary md:text-lg">{article.intro}</p>
          <div className="mt-6 flex flex-wrap gap-4 text-sm text-text-tertiary">
            <span>작성 Nexus 운영팀</span>
            <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-4 w-4" /> 업데이트 {article.updatedAt}</span>
            <span className="inline-flex items-center gap-1.5"><Clock3 className="h-4 w-4" /> {article.readingTime} 읽기</span>
          </div>
        </header>

        <div className="mt-10 space-y-10">
          {article.sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-xl font-bold text-text-primary md:text-2xl">{section.title}</h2>
              <div className="mt-4 space-y-4 text-sm leading-7 text-text-secondary md:text-base">
                {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              </div>
              {section.checklist && (
                <ul className="mt-5 space-y-2 rounded-xl border border-accent-primary/20 bg-accent-primary/5 p-5 text-sm text-text-secondary">
                  {section.checklist.map((item) => <li key={item}>✓ {item}</li>)}
                </ul>
              )}
            </section>
          ))}
        </div>

        <aside className="mt-12 rounded-xl border border-bg-tertiary bg-bg-secondary p-5">
          <h2 className="font-bold text-text-primary">다음 자료</h2>
          <div className="mt-3 grid gap-2">
            {RESOURCE_ARTICLES.filter((item) => item.slug !== article.slug).map((item) => (
              <Link key={item.slug} href={`/resources/${item.slug}`} className="text-sm text-accent-primary hover:underline">{item.title}</Link>
            ))}
          </div>
        </aside>
      </article>
    </main>
  );
}
