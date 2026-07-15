"use client";

import { useActionState } from "react";
import { LANDING_CATEGORIES, LANDING_REGIONS } from "@/lib/landing";
import { createProductAction, type NewProductState } from "../actions";

const initial: NewProductState = {};

const field = "w-full rounded-md border border-line bg-panel px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400";
const label = "block text-sm font-medium text-slate-700";

export function NewProductForm() {
  const [state, action, pending] = useActionState(createProductAction, initial);

  return (
    <form action={action} className="mt-6 space-y-4">
      <div>
        <label className={label}>商品照片</label>
        <input type="file" name="photo" accept="image/jpeg,image/png,image/webp" className="mt-1 text-sm text-slate-700" />
        <p className="mt-1 text-xs text-slate-400">JPG / PNG / WebP，小於 8MB（選填，但建議放）。</p>
      </div>

      <div>
        <label className={label}>標題 *</label>
        <input name="title" required placeholder="例：二手 萬利多 500磅 製冰機 台北｜保固三個月" className={`mt-1 ${field}`} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={label}>價格（NT$）</label>
          <input name="price" inputMode="numeric" placeholder="45000" className={`mt-1 ${field}`} />
        </div>
        <div>
          <label className={label}>成色</label>
          <select name="condition" defaultValue="good" className={`mt-1 ${field}`}>
            <option value="excellent">九成新</option>
            <option value="good">良好</option>
            <option value="fair">堪用</option>
            <option value="poor">待修</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={label}>品項分類</label>
          <select name="category" defaultValue="" className={`mt-1 ${field}`}>
            <option value="">未分類</option>
            {LANDING_CATEGORIES.map((c) => (
              <option key={c.slug} value={c.slug}>{c.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>地區</label>
          <select name="region" defaultValue="" className={`mt-1 ${field}`}>
            <option value="">未指定</option>
            {LANDING_REGIONS.map((r) => (
              <option key={r.slug} value={r.slug}>{r.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className={label}>規格（每行一組，用冒號分隔）</label>
        <textarea
          name="attributes"
          rows={4}
          placeholder={"品牌：萬利多 Manitowoc\n磅數：500 磅/日\n電壓：220V\n地區：台北"}
          className={`mt-1 ${field}`}
        />
      </div>

      <div>
        <label className={label}>商品描述與可驗收項</label>
        <textarea name="description" rows={4} placeholder="外觀、瑕疵、可驗收項、保固、到府安裝…" className={`mt-1 ${field}`} />
      </div>

      <div>
        <label className={label}>上架狀態</label>
        <select name="status" defaultValue="published" className={`mt-1 ${field}`}>
          <option value="published">直接上架（客人看得到）</option>
          <option value="reviewing">先存草稿（不公開）</option>
        </select>
      </div>

      {state.error && (
        <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "上架中…" : "建立商品"}
      </button>
    </form>
  );
}
