import { SupabaseInquiryRepo, type InquiryRow } from "@jbg/persistence";
import Link from "next/link";
import { getServerDb } from "@/lib/server-db";
import { formatPrice } from "@/lib/site";
import { redraftAction, sendAnswerAction } from "./actions";

export const dynamic = "force-dynamic";

/**
 * AI 客服面板（canonical §0.6 Inquiry Agent）。列出待處理詢問 + AI 草稿，
 * 客服可編輯後送出（守則#4：回覆客戶＝人審核定）。高風險（議價/保固/客訴）標紅。
 */
export default async function InquiriesPage() {
  const db = getServerDb();
  const open: InquiryRow[] = db ? await new SupabaseInquiryRepo(db).listOpen() : [];

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <Link href="/" className="text-xs text-accent hover:underline">← Dashboard</Link>
          <h1 className="mt-2 text-3xl font-bold">AI 客服</h1>
          <p className="mt-1 text-sm text-slate-600">
            Inquiry Agent 草擬回覆，客服核定送出（議價/保固/客訴一律人審）。
          </p>
        </div>
        <span className="rounded-full bg-amber-500/15 px-3 py-1 text-sm font-medium text-amber-700">
          {open.length} 待處理
        </span>
      </div>

      {!db && (
        <p className="rounded-lg border border-line bg-panel/60 px-4 py-3 text-sm text-slate-500">
          未接 Supabase（缺 env）。
        </p>
      )}
      {db && open.length === 0 && (
        <p className="rounded-lg border border-line bg-panel/60 px-4 py-6 text-center text-sm text-slate-500">
          🎉 沒有待處理詢問。
        </p>
      )}

      <ul className="space-y-4">
        {open.map((q) => {
          const risky = q.aiRequiresHuman === true;
          return (
            <li key={q.id} className="rounded-xl border border-line bg-panel/60 p-4">
              {/* 詢問 */}
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  {q.productId ? (
                    <Link href={`/p/${q.productId}`} className="text-sm font-semibold text-accent hover:underline">
                      {q.productTitle ?? "商品"}
                    </Link>
                  ) : (
                    <span className="text-sm font-semibold">{q.productTitle ?? "—"}</span>
                  )}
                  <span className="ml-2 text-xs text-slate-500">
                    {formatPrice(q.productPrice, q.productCurrency)} · {q.channel}
                    {q.customerHandle ? ` · ${q.customerHandle}` : ""}
                  </span>
                </div>
                {risky ? (
                  <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-700">需人工確認</span>
                ) : (
                  <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-700">
                    可自動回{q.aiConfidence != null ? ` · ${Math.round(q.aiConfidence * 100)}%` : ""}
                  </span>
                )}
              </div>

              <p className="mt-3 rounded-md bg-panel px-3 py-2 text-sm text-slate-800">
                <span className="text-slate-500">買家：</span>
                {q.message}
              </p>

              {/* AI 草稿 → 可編輯送出 */}
              <form action={sendAnswerAction} className="mt-3">
                <input type="hidden" name="id" value={q.id} />
                <label className="text-xs text-slate-500">
                  AI 草稿（可編輯後送出）
                </label>
                <textarea
                  name="answer"
                  rows={3}
                  defaultValue={q.aiDraft ?? ""}
                  className="mt-1 w-full rounded-md border border-line bg-panel px-3 py-2 text-sm text-slate-800"
                />
                <div className="mt-2 flex gap-2">
                  <button
                    type="submit"
                    className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
                  >
                    核定送出
                  </button>
                  <button
                    type="submit"
                    formAction={redraftAction}
                    className="rounded-md border border-line bg-panel px-3 py-1.5 text-sm text-slate-700 hover:border-accent/50"
                  >
                    重新草擬
                  </button>
                </div>
              </form>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
