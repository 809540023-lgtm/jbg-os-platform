import { listAllProducts, type CatalogProduct } from "@jbg/persistence";
import Link from "next/link";
import { getServerDb } from "@/lib/server-db";
import { conditionLabel, formatPrice } from "@/lib/site";
import { deleteProductAction, toggleStatusAction } from "./actions";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  published: "已上架",
  reviewing: "審核中",
  priced: "已估價",
  composed: "文案完成",
  assembled: "商品卡",
  draft: "草稿",
  sold: "已售出",
};

export default async function AdminProductsPage() {
  const db = getServerDb();
  const products: CatalogProduct[] = db ? await listAllProducts(db) : [];

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <Link href="/" className="text-xs text-accent hover:underline">← Dashboard</Link>
          <h1 className="mt-2 text-3xl font-bold">商品管理</h1>
          <p className="mt-1 text-sm text-slate-600">上傳照片、填規格、上架/下架。共 {products.length} 件。</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/import"
            className="rounded-md border border-accent/50 bg-accent/10 px-4 py-2 text-sm font-medium text-accent hover:bg-accent/20"
          >
            ⬇ 從 Drive 匯入
          </Link>
          <Link
            href="/admin/products/new"
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            ＋ 新增商品
          </Link>
        </div>
      </div>

      {!db && <p className="rounded-lg border border-line bg-panel/60 px-4 py-3 text-sm text-slate-500">未連線資料庫。</p>}
      {db && products.length === 0 && (
        <p className="rounded-lg border border-line bg-panel/60 px-4 py-6 text-center text-sm text-slate-500">
          還沒有商品。按右上角「新增商品」開始上架。
        </p>
      )}

      <ul className="space-y-3">
        {products.map((p) => {
          const isPublished = p.status === "published";
          return (
            <li key={p.id} className="flex items-center gap-4 rounded-xl border border-line bg-panel/60 p-3">
              {/* 縮圖 */}
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md border border-line bg-panel">
                {p.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.imageUrl} alt={p.title ?? ""} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">無圖</div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <Link href={`/p/${p.id}`} className="font-medium text-slate-800 hover:text-accent">
                  {p.title ?? "（未命名）"}
                </Link>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className={`rounded-full px-2 py-0.5 ${isPublished ? "bg-emerald-500/15 text-emerald-700" : "bg-amber-500/15 text-amber-700"}`}>
                    {STATUS_LABEL[p.status] ?? p.status}
                  </span>
                  <span className="font-semibold text-accent">{formatPrice(p.priceAmount, p.priceCurrency)}</span>
                  <span>成色 {conditionLabel(p.condition)}</span>
                </div>
              </div>

              <div className="flex shrink-0 gap-2">
                <Link
                  href={`/admin/products/${p.id}/edit`}
                  className="rounded-md border border-line bg-panel px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-accent/50"
                >
                  編輯
                </Link>
                <form action={toggleStatusAction}>
                  <input type="hidden" name="id" value={p.id} />
                  <input type="hidden" name="status" value={isPublished ? "reviewing" : "published"} />
                  <button className="rounded-md border border-line bg-panel px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-accent/50">
                    {isPublished ? "下架" : "上架"}
                  </button>
                </form>
                <form action={deleteProductAction}>
                  <input type="hidden" name="id" value={p.id} />
                  <button className="rounded-md border border-line bg-panel px-3 py-1.5 text-xs text-red-700 hover:border-red-500/50">
                    刪除
                  </button>
                </form>
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
