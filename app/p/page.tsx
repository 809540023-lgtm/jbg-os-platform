import { listPublishedProducts, type CatalogProduct } from "@jbg/persistence";
import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { LANDING_CATEGORIES, LANDING_REGIONS } from "@/lib/landing";
import { getServerDb } from "@/lib/server-db";
import { SITE_NAME, SITE_URL, conditionLabel, formatPrice } from "@/lib/site";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `餐飲二手設備目錄｜製冰機・商用冰箱・洗碗機・爐具｜${SITE_NAME}`,
  description:
    "北台灣餐飲二手設備撮合直送：二手製冰機、商用冰箱、洗碗機、爐具、不鏽鋼設備，可驗收、附保固、到府安裝，價格透明最低。",
  alternates: { canonical: `${SITE_URL}/p` },
};

export default async function CatalogPage() {
  const db = getServerDb();
  const products: CatalogProduct[] = db ? await listPublishedProducts(db) : [];

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <header className="mb-8">
        <h1 className="text-3xl font-bold">餐飲二手設備目錄</h1>
        <p className="mt-2 text-slate-600">
          製冰機・商用冰箱・洗碗機・爐具・不鏽鋼設備 —— 台中以北撮合直送，可驗收、附保固、款項代管。
        </p>
        <p className="mt-3 text-sm">
          <Link href="/guides" className="text-accent hover:underline">📖 選購指南：二手設備怎麼挑、怎麼避雷 →</Link>
        </p>
      </header>

      {products.length === 0 ? (
        <p className="rounded-lg border border-line bg-panel/60 px-4 py-6 text-center text-sm text-slate-500">
          目前沒有上架商品。
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {products.map((p) => (
            <Link
              key={p.id}
              href={`/p/${p.id}`}
              className="overflow-hidden rounded-xl border border-line bg-panel/60 transition hover:border-accent/50"
            >
              {p.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.imageUrl} alt={p.title ?? ""} className="h-44 w-full object-cover" />
              ) : (
                <div className="flex h-44 w-full items-center justify-center bg-panel text-sm text-slate-400">
                  尚無照片
                </div>
              )}
              <div className="p-4">
              <h2 className="font-semibold leading-snug">{p.title ?? "餐飲二手設備"}</h2>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-xl font-bold text-accent">{formatPrice(p.priceAmount, p.priceCurrency)}</span>
                <span className="text-xs text-slate-500">成色 {conditionLabel(p.condition)}</span>
              </div>
              {p.attributes.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {p.attributes.slice(0, 4).map((a) => (
                    <span key={a.key} className="rounded bg-panel px-1.5 py-0.5 text-[11px] text-slate-600">
                      {a.value}
                    </span>
                  ))}
                </div>
              )}
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* 地區×品項內鏈（SEO） */}
      <section className="mt-12 border-t border-line pt-8">
        <h2 className="mb-3 text-sm font-semibold text-slate-600">依地區與品項瀏覽</h2>
        <div className="flex flex-wrap gap-2">
          {LANDING_CATEGORIES.map((c) =>
            LANDING_REGIONS.map((r) => (
              <Link
                key={`${c.slug}-${r.slug}`}
                href={`/t/${c.slug}-${r.slug}`}
                className="rounded border border-line bg-panel px-2 py-1 text-xs text-slate-600 hover:border-accent/50 hover:text-slate-800"
              >
                二手{c.label} {r.label}
              </Link>
            )),
          )}
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
