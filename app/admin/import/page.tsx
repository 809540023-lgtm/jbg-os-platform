import Link from "next/link";
import { ImportForm } from "./import-form";

export const dynamic = "force-dynamic";

export default function ImportPage() {
  return (
    <main className="mx-auto max-w-xl px-6 py-12">
      <Link href="/admin/products" className="text-xs text-accent hover:underline">← 商品管理</Link>
      <h1 className="mt-2 text-3xl font-bold">從 Google Drive 匯入</h1>
      <p className="mt-1 text-sm text-slate-600">
        把商品照片依「一件設備一個子資料夾」整理到 Drive，設成公開連結，貼進來一鍵匯入成草稿商品。
      </p>
      <ImportForm />
    </main>
  );
}
