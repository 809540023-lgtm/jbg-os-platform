import { getCatalogProduct } from "@jbg/persistence";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerDb } from "@/lib/server-db";
import { EditProductForm } from "./edit-form";

export const dynamic = "force-dynamic";

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getServerDb();
  const p = db ? await getCatalogProduct(db, id) : null;
  if (!p) notFound();

  return (
    <main className="mx-auto max-w-xl px-6 py-12">
      <Link href="/admin/products" className="text-xs text-accent hover:underline">← 商品管理</Link>
      <h1 className="mt-2 text-3xl font-bold">編輯商品</h1>
      <p className="mt-1 text-sm text-slate-600">改好按「儲存變更」，即時反映到目錄。</p>
      <EditProductForm
        d={{
          id: p.id,
          title: p.title ?? "",
          price: p.priceAmount != null ? String(p.priceAmount) : "",
          condition: p.condition ?? "good",
          status: p.status,
          attributes: p.attributes.map((a) => `${a.key}：${a.value}`).join("\n"),
          description: p.description ?? "",
          images: p.imageUrls,
          category: p.category ?? "",
          region: p.region ?? "",
        }}
      />
    </main>
  );
}
