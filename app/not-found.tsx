import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 text-center">
      <p className="text-5xl font-bold text-accent">404</p>
      <h1 className="mt-3 text-xl font-semibold text-slate-800">找不到這個頁面</h1>
      <p className="mt-2 text-sm text-slate-500">頁面可能已下架或網址有誤。</p>
      <div className="mt-6 flex gap-3">
        <Link href="/p" className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90">
          看餐飲二手設備 →
        </Link>
        <Link href="/guides" className="rounded-md border border-line bg-panel px-4 py-2 text-sm text-slate-700 hover:border-accent/50">
          選購指南
        </Link>
      </div>
    </main>
  );
}
