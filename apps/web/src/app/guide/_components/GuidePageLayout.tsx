import type { LucideIcon } from "lucide-react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function GuidePageLayout({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <main className="flex-grow bg-bg-primary">
      <div className="mx-auto max-w-6xl px-4 py-10 md:px-6 md:py-16">
        <Link
          href="/guide"
          className="inline-flex items-center gap-2 text-sm font-semibold text-text-tertiary transition-colors hover:text-accent-primary"
        >
          <ArrowLeft className="h-4 w-4" /> 가이드 홈
        </Link>

        <header className="mt-6 rounded-[28px] bg-gradient-to-br from-bg-secondary via-bg-secondary to-accent-primary/[0.07] p-7 shadow-[0_24px_70px_rgb(0_0_0/0.14)] md:p-10">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-primary/10 text-accent-primary">
            <Icon className="h-6 w-6" />
          </span>
          <h1 className="mt-6 text-4xl font-black leading-[1.04] tracking-[-0.05em] text-text-primary md:text-5xl">
            {title}
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-text-secondary md:text-lg">
            {description}
          </p>
        </header>

        <div className="mt-8 space-y-6">{children}</div>
      </div>
    </main>
  );
}

export function GuideSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-[24px] bg-bg-secondary/50 p-6 shadow-[0_12px_36px_rgb(0_0_0/0.08)] md:p-8",
        className
      )}
    >
      <h2 className="text-2xl font-black tracking-[-0.035em] text-text-primary md:text-3xl">
        {title}
      </h2>
      {description && (
        <p className="mt-2 max-w-3xl text-sm leading-7 text-text-secondary md:text-base">
          {description}
        </p>
      )}
      <div className="mt-6">{children}</div>
    </section>
  );
}

export function GuideStep({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-4 rounded-2xl bg-bg-primary/35 p-4 md:p-5">
      <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-accent-primary text-sm font-black text-white">
        {number}
      </span>
      <div>
        <h3 className="font-bold text-text-primary">{title}</h3>
        <div className="mt-1.5 text-sm leading-6 text-text-secondary">{children}</div>
      </div>
    </li>
  );
}

export function InfoCard({
  icon: Icon,
  title,
  description,
  href,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  href?: string;
}) {
  const content = (
    <>
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-primary/10 text-accent-primary">
        <Icon className="h-5 w-5" />
      </span>
      <h3 className="mt-4 text-lg font-bold tracking-[-0.02em] text-text-primary">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-text-secondary">{description}</p>
      {href && (
        <ArrowRight className="mt-4 h-4 w-4 text-accent-primary transition-transform group-hover:translate-x-1" />
      )}
    </>
  );

  const classes = "group block rounded-2xl bg-bg-primary/35 p-5 transition-colors hover:bg-bg-elevated/35";

  return href ? (
    <Link href={href} className={classes}>
      {content}
    </Link>
  ) : (
    <article className={classes}>{content}</article>
  );
}

export function BulletList({ children }: { children: React.ReactNode }) {
  return <ul className="space-y-2.5 text-sm leading-7 text-text-secondary md:text-base">{children}</ul>;
}

export function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-2.5 h-1.5 w-1.5 flex-none rounded-full bg-accent-primary" />
      <span>{children}</span>
    </li>
  );
}
