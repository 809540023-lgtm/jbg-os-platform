import { listPublishedProducts, type CatalogProduct } from "@jbg/persistence";
import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { LANDING_CATEGORIES, LANDING_REGIONS } from "@/lib/landing";
import { getServerDb, safeList } from "@/lib/server-db";
import { SITE_NAME, SITE_URL, conditionLabel, formatPrice, thumb } from "@/lib/site";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `餐飲二手設備目錄｜製冰機・商用冰箱・洗碗機・爐具｜${SITE_NAME}`,
  description:
    "北台灣餐飲二手設備撮合直送：二手製冰機、商用冰箱、洗碗機、爐具、不鏽鋼設備，可驗收、附保固、到府安裝，價格透明最低。",
  alternates: { canonical: `${SITE_URL}/p` },
};

/** 目錄搜尋/篩選：?q=關鍵字&cat=分類&region=地區（server-side 過濾）。 */
function applyFilters(
  all: CatalogProduct[],
  q: string,
  cat: string,
  region: string,
): CatalogProduct[] {
  return all.filter((p) => {
    if (cat && p.category !== cat) return false;
    if (region && p.region !== region) return false;
    if (q) {
      const hay = `${p.title ?? ""} ${p.description ?? ""} ${p.attributes.map((a) => `${a.key}${a.value}`).join(" ")}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  });
}

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; cat?: string; region?: string }>;
}) {
  const { q = "", cat = "", region = "" } = await searchParams;
  const db = getServerDb();
  const all: CatalogProduct[] = db ? await safeList(() => listPublishedProducts(db)) : [];
  const products = applyFilters(all, q.trim(), cat, region);
  const chip = (active: boolean) =>
    `rounded-full px-3 py-1.5 text-sm transition ${active ? "bg-accent text-white" : "border border-line bg-panel text-slate-700 hover:border-accent/50"}`;
  const keep = (params: Record<string, string>) => {
    const merged = { q, cat, region, ...params };
    const s = new URLSearchParams(Object.entries(merged).filter(([, v]) => v)).toString();
    return s ? `/p?${s}` : "/p";
  };

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <header className="mb-6">
        <h1 className="text-3xl font-bold">餐飲二手設備目錄</h1>
        <p className="mt-2 text-slate-600">
          製冰機・商用冰箱・洗碗機・爐具・不鏽鋼設備 —— 台中以北撮合直送，可驗收、附保固、款項代管。
        </p>
        <p className="mt-3 text-sm">
          <Link href="/guides" className="text-accent hover:underline">📖 選購指南：二手設備怎麼挑、怎麼避雷 →</Link>
        </p>
      </header>

      {/* 搜尋 + 篩選 */}
      <div className="mb-6 space-y-3">
        <form action="/p" method="get" className="flex gap-2">
          {cat && <input type="hidden" name="cat" value={cat} />}
          {region && <input type="hidden" name="region" value={region} />}
          <input
            name="q"
            defaultValue={q}
            placeholder="搜尋設備，例：冰箱、攪拌機、RATIONAL…"
            className="w-full max-w-md rounded-md border border-line bg-panel px-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400"
          />
          <button className="rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-white hover:opacity-90">搜尋</button>
        </form>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={keep({ cat: "" })} className={chip(!cat)}>全部</Link>
          {LANDING_CATEGORIES.map((c) => (
            <Link key={c.slug} href={keep({ cat: c.slug })} className={chip(cat === c.slug)}>{c.label}</Link>
          ))}
          <span className="mx-1 text-slate-300">|</span>
          <Link href={keep({ region: "" })} className={chip(!region)}>不限地區</Link>
          {LANDING_REGIONS.map((r) => (
            <Link key={r.slug} href={keep({ region: r.slug })} className={chip(region === r.slug)}>{r.label}</Link>
          ))}
        </div>
        {(q || cat || region) && (
          <p className="text-sm text-slate-500">
            找到 <b className="text-slate-800">{products.length}</b> 件
            {q && <>，關鍵字「{q}」</>}
            <Link href="/p" className="ml-2 text-accent hover:underline">清除篩選</Link>
          </p>
        )}
      </div>

      {products.length === 0 ? (
        <p className="rounded-lg border border-line bg-panel/60 px-4 py-6 text-center text-sm text-slate-500">
          {all.length === 0 ? "目前沒有上架商品。" : "沒有符合條件的商品 —— 我們有貨源網絡可調貨，歡迎來訊詢問。"}
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
                <img src={thumb(p.imageUrl, 600)} alt={p.title ?? ""} className="h-44 w-full object-cover" loading="lazy" />
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
