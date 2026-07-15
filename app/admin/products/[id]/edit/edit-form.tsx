"use client";

import { useActionState } from "react";
import { LANDING_CATEGORIES, LANDING_REGIONS } from "@/lib/landing";
import { updateProductAction, type NewProductState } from "../../actions";

const initial: NewProductState = {};

const field = "w-full rounded-md border border-line bg-panel px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400";
const label = "block text-sm font-medium text-slate-700";

export interface EditDefaults {
  id: string;
  title: string;
  price: string;
  condition: string;
  status: string;
  attributes: string;
  description: string;
  imageUrl: string | null;
  category: string;
  region: string;
}

export function EditProductForm({ d }: { d: EditDefaults }) {
  const [state, action, pending] = useActionState(updateProductAction, initial);

  return (
    <form action={action} className="mt-6 space-y-4">
      <input type="hidden" name="id" value={d.id} />

      <div>
        <label className={label}>目前照片</label>
        {d.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={d.imageUrl} alt="" className="mt-1 h-32 w-32 rounded-md border border-line object-cover" />
        ) : (
          <p className="mt-1 text-xs text-slate-400">尚無照片</p>
        )}
        <label className={`${label} mt-3`}>更換照片（不選則保留原圖）</label>
        <input type="file" name="photo" accept="image/jpeg,image/png,image/webp" className="mt-1 text-sm text-slate-700" />
      </div>

      <div>
        <label className={label}>標題 *</label>
        <input name="title" required defaultValue={d.title} className={`mt-1 ${field}`} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={label}>價格（NT$）</label>
          <input name="price" inputMode="numeric" defaultValue={d.price} className={`mt-1 ${field}`} />
        </div>
        <div>
          <label className={label}>成色</label>
          <select name="condition" defaultValue={d.condition} className={`mt-1 ${field}`}>
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
          <select name="category" defaultValue={d.category} className={`mt-1 ${field}`}>
            <option value="">未分類</option>
            {LANDING_CATEGORIES.map((c) => (
              <option key={c.slug} value={c.slug}>{c.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>地區</label>
          <select name="region" defaultValue={d.region} className={`mt-1 ${field}`}>
            <option value="">未指定</option>
            {LANDING_REGIONS.map((r) => (
              <option key={r.slug} value={r.slug}>{r.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className={label}>規格（每行一組，用冒號分隔）</label>
        <textarea name="attributes" rows={4} defaultValue={d.attributes} className={`mt-1 ${field}`} />
      </div>

      <div>
        <label className={label}>商品描述與可驗收項</label>
        <textarea name="description" rows={4} defaultValue={d.description} className={`mt-1 ${field}`} />
      </div>

      <div>
        <label className={label}>上架狀態</label>
        <select name="status" defaultValue={d.status} className={`mt-1 ${field}`}>
          <option value="published">已上架（客人看得到）</option>
          <option value="reviewing">下架/草稿（不公開）</option>
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
        {pending ? "儲存中…" : "儲存變更"}
      </button>
    </form>
  );
}
