import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GUIDES, findGuide, type Guide } from "@/lib/guides";
import { findLandingDef } from "@/lib/landing";
import { SITE_NAME, SITE_URL } from "@/lib/site";

/** 靜態生成全部指南頁。 */
export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const g = findGuide(slug);
  if (!g) return { title: `文章不存在 · ${SITE_NAME}` };
  return {
    title: `${g.title}｜${SITE_NAME}`,
    description: g.description,
    alternates: { canonical: `${SITE_URL}/guides/${g.slug}` },
    openGraph: { title: g.title, description: g.description, url: `${SITE_URL}/guides/${g.slug}`, type: "article" },
  };
}

function articleJsonLd(g: Guide): string {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Article",
    headline: g.title,
    description: g.description,
    dateModified: g.updated,
    author: { "@type": "Organization", name: SITE_NAME },
    mainEntityOfPage: `${SITE_URL}/guides/${g.slug}`,
  });
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const g = findGuide(slug);
  if (!g) notFound();

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: articleJsonLd(g) }} />

      <nav className="mb-6 text-xs text-zinc-500">
        <Link href="/guides" className="text-accent hover:underline">← 全部選購指南</Link>
      </nav>

      <article>
        <h1 className="text-3xl font-bold leading-snug">{g.title}</h1>
        <p className="mt-3 text-zinc-400">{g.description}</p>

        {g.sections.map((s) => (
          <section key={s.heading} className="mt-8">
            <h2 className="text-xl font-semibold text-zinc-100">{s.heading}</h2>
            {s.paragraphs.map((p) => (
              <p key={p.slice(0, 24)} className="mt-3 leading-relaxed text-zinc-300">{p}</p>
            ))}
            {s.bullets && (
              <ul className="mt-3 space-y-2">
                {s.bullets.map((b) => (
                  <li key={b.slice(0, 24)} className="flex gap-2 text-sm leading-relaxed text-zinc-300">
                    <span className="text-accent">•</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </article>

      {/* CTA → 落地頁/目錄（內容導流成交） */}
      <div className="mt-10 rounded-xl border border-accent/30 bg-accent/5 p-5">
        <h2 className="font-semibold text-zinc-100">正在找設備？</h2>
        <p className="mt-1 text-sm text-zinc-400">
          全部經結構化驗機、款項代管、可到府安裝。
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/p" className="rounded-md bg-accent/15 px-3 py-1.5 text-sm font-medium text-accent hover:bg-accent/25">
            看全部現貨 →
          </Link>
          {g.relatedLanding.map((slug) => {
            const def = findLandingDef(slug);
            if (!def) return null;
            return (
              <Link key={slug} href={`/t/${slug}`} className="rounded-md border border-line bg-panel px-3 py-1.5 text-sm text-zinc-300 hover:border-accent/50">
                {def.title}
              </Link>
            );
          })}
        </div>
      </div>

      <p className="mt-10 text-center text-xs text-zinc-600">{SITE_NAME}</p>
    </main>
  );
}
