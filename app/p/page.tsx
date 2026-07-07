import { listPublishedProducts, type CatalogProduct } from "@jbg/persistence";
import type { Metadata } from "next";
import Link from "next/link";
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
        <p className="mt-2 text-zinc-400">
          製冰機・商用冰箱・洗碗機・爐具・不鏽鋼設備 —— 台中以北撮合直送，可驗收、附保固、款項代管。
        </p>
      </header>

      {products.length === 0 ? (
        <p className="rounded-lg border border-line bg-panel/60 px-4 py-6 text-center text-sm text-zinc-500">
          目前沒有上架商品。
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {products.map((p) => (
            <Link
              key={p.id}
              href={`/p/${p.id}`}
              className="rounded-xl border border-line bg-panel/60 p-4 transition hover:border-accent/50"
            >
              <h2 className="font-semibold leading-snug">{p.title ?? "餐飲二手設備"}</h2>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-xl font-bold text-accent">{formatPrice(p.priceAmount, p.priceCurrency)}</span>
                <span className="text-xs text-zinc-500">成色 {conditionLabel(p.condition)}</span>
              </div>
              {p.attributes.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {p.attributes.slice(0, 4).map((a) => (
                    <span key={a.key} className="rounded bg-panel px-1.5 py-0.5 text-[11px] text-zinc-400">
                      {a.value}
                    </span>
                  ))}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}

      <p className="mt-10 text-center text-xs text-zinc-600">{SITE_NAME}</p>
    </main>
  );
}
