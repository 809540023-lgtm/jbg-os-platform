import { listPublishedProducts, type CatalogProduct } from "@jbg/persistence";
import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { LANDING_CATEGORIES } from "@/lib/landing";
import { getServerDb, safeList } from "@/lib/server-db";
import { SITE_NAME, SITE_URL, conditionLabel, formatPrice, thumb } from "@/lib/site";

export const dynamic = "force-dynamic";

/**
 * 公開店面首頁 —— 訪客打根網址看到的是「店」，不是後台。
 * 後台移至 /dashboard（受登入保護）。
 */

export const metadata: Metadata = {
  title: `${SITE_NAME}｜北台灣餐飲二手設備・可驗收附保固`,
  description:
    "北台灣餐飲二手設備撮合直送：製冰機、商用冰箱、洗碗機、爐具、不鏽鋼設備。結構化驗機紀錄、款項代管、可到府安裝，價格透明。",
  alternates: { canonical: SITE_URL },
  openGraph: {
    title: SITE_NAME,
    description: "北台灣餐飲二手設備撮合直送 —— 可驗收、附保固、款項代管。",
    url: SITE_URL,
    siteName: SITE_NAME,
    type: "website",
  },
};

export default async function HomePage() {
  const db = getServerDb();
  const products: CatalogProduct[] = db ? await safeList(() => listPublishedProducts(db, 8)) : [];

  return (
    <main className="mx-auto max-w-5xl px-6 pt-14">
      {/* Hero */}
      <section className="text-center">
        <p className="text-sm font-medium tracking-widest text-accent">北台灣・撮合直送</p>
        <h1 className="mx-auto mt-3 max-w-2xl text-4xl font-bold leading-snug">
          餐飲二手設備，<span className="text-accent">可驗收、附保固</span>，直送到店
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-slate-600">
          製冰機・商用冰箱・洗碗機・爐具・不鏽鋼設備 —— 每台附結構化驗機紀錄，
          款項代管、驗收無誤才撥款，開店成本直接省一半。
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/p" className="rounded-md bg-accent px-6 py-3 text-sm font-semibold text-white hover:opacity-90">
            瀏覽全部設備 →
          </Link>
          <Link href="/guides" className="rounded-md border border-line bg-panel px-6 py-3 text-sm font-medium text-slate-700 hover:border-accent/50">
            選購指南
          </Link>
        </div>
      </section>

      {/* 信任三承諾 */}
      <section className="mt-14 grid gap-4 sm:grid-cols-3">
        {[
          { icon: "📋", t: "結構化驗機紀錄", d: "規格、成色、瑕疵、可驗收項全部寫清楚，透明取代眼見為憑。" },
          { icon: "🔒", t: "款項代管履約", d: "款項先由平台代管，設備送達驗收無誤才撥付賣家。" },
          { icon: "🚚", t: "可到府安裝", d: "大型設備媒合搬運與安裝，台中以北直送到店。" },
        ].map((x) => (
          <div key={x.t} className="rounded-xl border border-line bg-panel/60 p-5">
            <p className="text-2xl">{x.icon}</p>
            <h2 className="mt-2 font-semibold text-slate-800">{x.t}</h2>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">{x.d}</p>
          </div>
        ))}
      </section>

      {/* 最新上架 */}
      {products.length > 0 && (
        <section className="mt-14">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-bold">最新上架</h2>
            <Link href="/p" className="text-sm text-accent hover:underline">全部商品 →</Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-4">
            {products.map((p) => (
              <Link key={p.id} href={`/p/${p.id}`} className="overflow-hidden rounded-xl border border-line bg-panel/60 transition hover:border-accent/50">
                {p.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumb(p.imageUrl, 400)} alt={p.title ?? ""} className="h-36 w-full object-cover" loading="lazy" />
                ) : (
                  <div className="flex h-36 w-full items-center justify-center bg-panel text-sm text-slate-400">尚無照片</div>
                )}
                <div className="p-3">
                  <h3 className="line-clamp-2 text-sm font-medium leading-snug">{p.title ?? "餐飲二手設備"}</h3>
                  <p className="mt-1 text-sm font-bold text-accent">{formatPrice(p.priceAmount, p.priceCurrency)}</p>
                  <p className="text-[11px] text-slate-500">成色 {conditionLabel(p.condition)}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 品項分類入口 */}
      <section className="mt-14">
        <h2 className="mb-4 text-xl font-bold">找特定設備？</h2>
        <div className="flex flex-wrap gap-2">
          {LANDING_CATEGORIES.map((c) => (
            <Link key={c.slug} href={`/t/${c.slug}`} className="rounded-md border border-line bg-panel px-4 py-2 text-sm text-slate-700 hover:border-accent/50">
              二手{c.label}
            </Link>
          ))}
          <Link href="/info/contact" className="rounded-md border border-accent/40 bg-accent/5 px-4 py-2 text-sm text-accent hover:bg-accent/10">
            找不到？我們有貨源網絡可調貨 →
          </Link>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
