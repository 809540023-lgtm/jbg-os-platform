import Link from "next/link";
import { NewProductForm } from "./new-form";

export const dynamic = "force-dynamic";

export default function NewProductPage() {
  return (
    <main className="mx-auto max-w-xl px-6 py-12">
      <Link href="/admin/products" className="text-xs text-accent hover:underline">← 商品管理</Link>
      <h1 className="mt-2 text-3xl font-bold">新增商品</h1>
      <p className="mt-1 text-sm text-slate-600">填好按「建立商品」，即可在目錄上架。</p>
      <NewProductForm />
    </main>
  );
}
