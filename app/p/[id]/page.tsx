import { getCatalogProduct, type CatalogProduct } from "@jbg/persistence";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerDb } from "@/lib/server-db";
import { SITE_NAME, SITE_URL, conditionLabel, formatPrice } from "@/lib/site";
import { InquiryForm } from "./inquiry-form";

export const dynamic = "force-dynamic";

async function load(id: string): Promise<CatalogProduct | null> {
  const db = getServerDb();
  if (!db) return null;
  try {
    return await getCatalogProduct(db, id);
  } catch {
    return null;
  }
}

/** SEO metadata：標題＝品項＋規格/品牌/磅數＋地區（來自 product.title）。 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const p = await load(id);
  if (!p) return { title: `商品不存在 · ${SITE_NAME}` };
  const title = `${p.title ?? "餐飲二手設備"}｜${SITE_NAME}`;
  const description = (p.description ?? "").slice(0, 155) || "北台灣餐飲二手設備撮合直送，可驗收、附保固、到府安裝。";
  const url = `${SITE_URL}/p/${p.id}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "website", siteName: SITE_NAME },
  };
}

function productJsonLd(p: CatalogProduct): string {
  const available = p.status === "published";
  const ld = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.title ?? "餐飲二手設備",
    description: p.description ?? undefined,
    category: "餐飲二手設備",
    itemCondition: "https://schema.org/UsedCondition",
    additionalProperty: p.attributes.map((a) => ({
      "@type": "PropertyValue",
      name: a.key,
      value: a.value,
    })),
    offers: {
      "@type": "Offer",
      priceCurrency: p.priceCurrency ?? "TWD",
      price: p.priceAmount ?? undefined,
      availability: available ? "https://schema.org/InStock" : "https://schema.org/PreOrder",
      url: `${SITE_URL}/p/${p.id}`,
      itemCondition: "https://schema.org/UsedCondition",
    },
  };
  return JSON.stringify(ld);
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await load(id);
  if (!p) notFound();

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      {/* schema.org Product — 讓 Google 認得價格/狀態/規格 */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: productJsonLd(p) }} />

      <nav className="mb-6 text-xs text-zinc-500">
        <Link href="/p" className="text-accent hover:underline">← 全部餐飲二手設備</Link>
      </nav>

      <div className="rounded-2xl border border-line bg-panel/60 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-2xl font-bold leading-snug">{p.title ?? "餐飲二手設備"}</h1>
          <span
            className={`shrink-0 rounded-full px-3 py-1 text-sm font-medium ${
              p.status === "published"
                ? "bg-emerald-500/15 text-emerald-300"
                : "bg-amber-500/15 text-amber-300"
            }`}
          >
            {p.status === "published" ? "現貨可成交" : "整備中"}
          </span>
        </div>

        <div className="mt-4 flex items-baseline gap-3">
          <span className="text-3xl font-bold text-accent">{formatPrice(p.priceAmount, p.priceCurrency)}</span>
          <span className="text-sm text-zinc-400">成色：{conditionLabel(p.condition)}</span>
        </div>

        {p.attributes.length > 0 && (
          <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
            {p.attributes.map((a) => (
              <div key={a.key}>
                <dt className="text-xs text-zinc-500">{a.key}</dt>
                <dd className="text-sm text-zinc-200">{a.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {p.description && (
          <div className="mt-6 border-t border-line pt-5">
            <h2 className="mb-2 text-sm font-semibold text-zinc-300">商品描述與可驗收項</h2>
            <p className="whitespace-pre-line text-sm leading-relaxed text-zinc-300">{p.description}</p>
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-3 border-t border-line pt-5 text-xs text-zinc-400">
          <span className="rounded border border-line bg-panel px-2 py-1">✓ 結構化狀態紀錄</span>
          <span className="rounded border border-line bg-panel px-2 py-1">✓ 款項代管履約</span>
          <span className="rounded border border-line bg-panel px-2 py-1">✓ 可到府安裝</span>
          <span className="rounded border border-line bg-panel px-2 py-1">✓ 附驗收報告</span>
        </div>
      </div>

      <InquiryForm productId={p.id} />

      <p className="mt-6 text-center text-xs text-zinc-600">
        {SITE_NAME} · 由 JBG OS 自動整備上架
      </p>
    </main>
  );
}
