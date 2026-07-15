"use client";

import Link from "next/link";
import { useEffect } from "react";

/** 頁面層錯誤邊界：單頁出錯不再整站白屏，給客人友善畫面 + 重試。 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // 記到 console/伺服器日誌（未接 Sentry 前的最低限度可觀測）。
    console.error("page error:", error?.message, error?.digest);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 text-center">
      <p className="text-4xl">😵‍💫</p>
      <h1 className="mt-3 text-xl font-semibold text-slate-800">這個頁面暫時出了點問題</h1>
      <p className="mt-2 text-sm text-slate-500">請稍後再試，或回到商品目錄。</p>
      <div className="mt-6 flex gap-3">
        <button onClick={() => reset()} className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90">
          重新載入
        </button>
        <Link href="/p" className="rounded-md border border-line bg-panel px-4 py-2 text-sm text-slate-700 hover:border-accent/50">
          回商品目錄
        </Link>
      </div>
    </main>
  );
}
