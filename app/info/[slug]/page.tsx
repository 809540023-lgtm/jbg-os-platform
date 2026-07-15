import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { INFO_PAGES, findInfoPage } from "@/lib/pages";
import { SITE_NAME, SITE_URL } from "@/lib/site";

export function generateStaticParams() {
  return INFO_PAGES.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const p = findInfoPage(slug);
  if (!p) return { title: `頁面不存在 · ${SITE_NAME}` };
  return {
    title: `${p.title}｜${SITE_NAME}`,
    description: p.description,
    alternates: { canonical: `${SITE_URL}/info/${p.slug}` },
  };
}

export default async function InfoPageView({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = findInfoPage(slug);
  if (!p) notFound();

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <nav className="mb-6 text-xs text-slate-500">
        <Link href="/p" className="text-accent hover:underline">← 回商品目錄</Link>
      </nav>

      <h1 className="text-3xl font-bold">{p.title}</h1>
      <p className="mt-2 text-slate-600">{p.description}</p>

      {p.sections.map((s) => (
        <section key={s.heading} className="mt-8">
          <h2 className="text-xl font-semibold text-slate-900">{s.heading}</h2>
          {s.paragraphs.map((para) => (
            <p key={para.slice(0, 20)} className="mt-3 leading-relaxed text-slate-700">{para}</p>
          ))}
          {s.bullets && (
            <ul className="mt-3 space-y-2">
              {s.bullets.map((b) => (
                <li key={b.slice(0, 20)} className="flex gap-2 text-sm leading-relaxed text-slate-700">
                  <span className="text-accent">•</span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}

      <p className="mt-10 text-center text-xs text-slate-400">{SITE_NAME}</p>
    </main>
  );
}
