"use client";

import { useActionState } from "react";
import { submitInquiryAction, type InquiryFormState } from "./actions";

const initial: InquiryFormState = { ok: false, message: "" };

/** 商品頁詢問表單（AI 客服即時草擬回覆）。 */
export function InquiryForm({ productId }: { productId: string }) {
  const [state, action, pending] = useActionState(submitInquiryAction, initial);

  return (
    <section className="mt-6 rounded-xl border border-line bg-panel/40 p-5">
      <h2 className="text-sm font-semibold text-zinc-200">詢問這台設備</h2>
      <p className="mt-1 text-xs text-zinc-500">AI 客服即時回覆規格/現貨/地區；議價與到府安裝由專人處理。</p>

      <form action={action} className="mt-3 space-y-2">
        <input type="hidden" name="productId" value={productId} />
        <input
          name="handle"
          placeholder="您的稱呼／聯絡方式（選填）"
          className="w-full rounded-md border border-line bg-panel px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600"
        />
        <textarea
          name="message"
          required
          rows={3}
          placeholder="例：這台還有現貨嗎？可以送到台北嗎？"
          className="w-full rounded-md border border-line bg-panel px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-black transition hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "AI 回覆中…" : "送出詢問"}
        </button>
      </form>

      {state.message && (
        <div
          className={`mt-3 rounded-md border px-3 py-2 text-sm ${
            state.ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-red-500/30 bg-red-500/10 text-red-200"
          }`}
        >
          <p>{state.message}</p>
          {state.reply && <p className="mt-2 whitespace-pre-line text-zinc-200">{state.reply}</p>}
          {state.pendingHuman && <p className="mt-1 text-xs text-emerald-300/70">（此類問題由專人回覆，確保報價與承諾準確）</p>}
        </div>
      )}
    </section>
  );
}
