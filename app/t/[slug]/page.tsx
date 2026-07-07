import { listPublishedProducts, type CatalogProduct } from "@jbg/persistence";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  LANDING_CATEGORIES,
  LANDING_REGIONS,
  findLandingDef,
  matchesLanding,
  type LandingDef,
} from "@/lib/landing";
import { getServerDb } from "@/lib/server-db";
import { SITE_NAME, SITE_URL, conditionLabel, formatPrice } from "@/lib/site";

export const dynamic = "force-dynamic";

/** 地區×品項落地頁（規劃書 §3.3）：卡「二手XX 地區」「中古XX 地區」長尾詞。 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const def = findLandingDef(slug);
  if (!def) return { title: `頁面不存在 · ${SITE_NAME}` };
  const regionPart = def.region ? `${def.region.label} ` : "台中以北 ";
  const title = `${def.title}｜中古${def.category.label} ${regionPart}推薦・可驗收附保固｜${SITE_NAME}`;
  return {
    title,
    description: def.category.intro.slice(0, 155),
    alternates: { canonical: `${SITE_URL}/t/${def.slug}` },
    openGraph: { title, description: def.category.intro.slice(0, 155), url: `${SITE_URL}/t/${def.slug}` },
  };
}

function itemListJsonLd(def: LandingDef, products: CatalogProduct[]): string {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: def.title,
    itemListElement: products.map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${SITE_URL}/p/${p.id}`,
      name: p.title ?? undefined,
    })),
  });
}

export default async function LandingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const def = findLandingDef(slug);
  if (!def) notFound();

  const db = getServerDb();
  const all = db ? await listPublishedProducts(db) : [];
  const products = all.filter((p) => matchesLanding(def, p));

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: itemListJsonLd(def, products) }}
      />

      <nav className="mb-6 text-xs text-zinc-500">
        <Link href="/p" className="text-accent hover:underline">← 全部餐飲二手設備</Link>
      </nav>

      <h1 className="text-3xl font-bold">
        {def.title}
        <span className="ml-2 text-lg font-normal text-zinc-400">
          中古{def.category.label}{def.region ? ` ${def.region.label}` : ""} 撮合直送
        </span>
      </h1>
      <p className="mt-3 leading-relaxed text-zinc-300">{def.category.intro}</p>

      {/* 商品清單 */}
      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold text-zinc-200">
          現貨{def.region ? `（${def.region.label}）` : ""} · {products.length} 件
        </h2>
        {products.length === 0 ? (
          <div className="rounded-lg border border-line bg-panel/60 px-4 py-5 text-sm text-zinc-400">
            此地區暫無現貨 —— 我們有貨源網絡可調貨。到
            <Link href="/p" className="mx-1 text-accent hover:underline">全部商品</Link>
            看其他地區現貨，或留下需求由我們撮合直送。
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {products.map((p) => (
              <Link
                key={p.id}
                href={`/p/${p.id}`}
                className="rounded-xl border border-line bg-panel/60 p-4 transition hover:border-accent/50"
              >
                <h3 className="font-semibold leading-snug">{p.title}</h3>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-xl font-bold text-accent">
                    {formatPrice(p.priceAmount, p.priceCurrency)}
                  </span>
                  <span className="text-xs text-zinc-500">成色 {conditionLabel(p.condition)}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* 解痛內容：挑選要點（SEO 內文 + 信任） */}
      <section className="mt-10 rounded-xl border border-line bg-panel/40 p-5">
        <h2 className="mb-3 text-lg font-semibold text-zinc-200">
          二手{def.category.label}怎麼挑（避雷要點）
        </h2>
        <ul className="space-y-2 text-sm leading-relaxed text-zinc-300">
          {def.category.buyingTips.map((tip) => (
            <li key={tip} className="flex gap-2">
              <span className="text-accent">✓</span>
              <span>{tip}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-zinc-500">
          每台設備由 AI 系統生成結構化狀態紀錄（規格、外觀、瑕疵、可驗收項），款項代管、驗收無誤才撥付。
        </p>
      </section>

      {/* 內部連結：其他地區 × 其他品項（SEO 內鏈網） */}
      <section className="mt-10 grid gap-6 sm:grid-cols-2">
        <div>
          <h2 className="mb-2 text-sm font-semibold text-zinc-400">其他地區的{def.category.label}</h2>
          <div className="flex flex-wrap gap-2">
            {LANDING_REGIONS.filter((r) => r.slug !== def.region?.slug).map((r) => (
              <Link
                key={r.slug}
                href={`/t/${def.category.slug}-${r.slug}`}
                className="rounded border border-line bg-panel px-2 py-1 text-xs text-zinc-300 hover:border-accent/50"
              >
                二手{def.category.label} {r.label}
              </Link>
            ))}
          </div>
        </div>
        <div>
          <h2 className="mb-2 text-sm font-semibold text-zinc-400">
            {def.region ? `${def.region.label}的其他設備` : "其他設備品項"}
          </h2>
          <div className="flex flex-wrap gap-2">
            {LANDING_CATEGORIES.filter((c) => c.slug !== def.category.slug).map((c) => (
              <Link
                key={c.slug}
                href={def.region ? `/t/${c.slug}-${def.region.slug}` : `/t/${c.slug}`}
                className="rounded border border-line bg-panel px-2 py-1 text-xs text-zinc-300 hover:border-accent/50"
              >
                二手{c.label}{def.region ? ` ${def.region.label}` : ""}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <p className="mt-10 text-center text-xs text-zinc-600">{SITE_NAME}</p>
    </main>
  );
}
