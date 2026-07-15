"use client";

import { useActionState } from "react";
import { importFromDriveAction, type ImportState } from "./actions";

const initial: ImportState = {};

export function ImportForm() {
  const [state, action, pending] = useActionState(importFromDriveAction, initial);

  return (
    <div className="mt-6">
      <form action={action} className="space-y-3">
        <input
          name="folder"
          required
          placeholder="貼上 Google Drive 資料夾連結（需設「知道連結的任何人可檢視」）"
          className="w-full rounded-md border border-line bg-panel px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "匯入中…（照片較多請稍候）" : "開始匯入"}
        </button>
        <p className="text-xs text-slate-400">
          每個子資料夾＝一件設備（草稿），主圖＝第一張，每件最多 8 張。同名商品會更新照片、不重複建立。
        </p>
      </form>

      {state.error && (
        <p className="mt-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700">{state.error}</p>
      )}

      {state.done && (
        <div className="mt-5 space-y-3 text-sm">
          <ResultBlock title={`✅ 新增 ${state.created?.length ?? 0} 件`} items={state.created} tone="emerald" />
          <ResultBlock title={`🔄 更新 ${state.updated?.length ?? 0} 件`} items={state.updated} tone="blue" />
          <ResultBlock title={`⏭️ 略過 ${state.skipped?.length ?? 0} 個`} items={state.skipped} tone="slate" />
          <a href="/admin/products" className="inline-block rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90">
            去商品管理補價格 →
          </a>
        </div>
      )}
    </div>
  );
}

function ResultBlock({ title, items, tone }: { title: string; items?: string[]; tone: string }) {
  if (!items || items.length === 0) return <p className="text-slate-400">{title}</p>;
  const color = tone === "emerald" ? "text-emerald-700" : tone === "blue" ? "text-blue-700" : "text-slate-600";
  return (
    <div>
      <p className={`font-medium ${color}`}>{title}</p>
      <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
        {items.map((it) => <li key={it}>{it}</li>)}
      </ul>
    </div>
  );
}
