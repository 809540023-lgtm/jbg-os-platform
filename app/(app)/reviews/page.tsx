import { triageReview } from "@jbg/domain";
import { listPendingReviews, type PendingReview } from "@jbg/persistence";
import Link from "next/link";
import { getServerDb } from "@/lib/server-db";
import { formatPrice } from "@/lib/site";
import { bulkAutoPassAction, decideReviewAction } from "./actions";

export const dynamic = "force-dynamic";

/**
 * Human Review 面板（docs/09 Reviews / docs/07 §7.4 / 附錄 K）。
 * 列出 pending human_reviews，可 approve / reject（server action 回寫 DB）。
 */
export default async function ReviewsPage() {
  const db = getServerDb();
  const reviews: PendingReview[] = db ? await listPendingReviews(db) : [];

  // 智能分流：每筆給建議（規劃書 §5.2）
  const triaged = reviews.map((r) => ({
    r,
    t: triageReview({ targetKind: r.targetKind, confidence: r.confidence, amount: r.amount }),
  }));
  const autoPassCount = triaged.filter((x) => x.t.recommendation === "auto_pass").length;

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <Link href="/" className="text-xs text-accent hover:underline">← Dashboard</Link>
          <h1 className="mt-2 text-3xl font-bold">Human Review</h1>
          <p className="mt-1 text-sm text-slate-600">
            待人類決策的關卡（§0.7 <code className="text-slate-700">human-review</code>）。
          </p>
        </div>
        <span className="rounded-full bg-amber-500/15 px-3 py-1 text-sm font-medium text-amber-700">
          {reviews.length} 待審
        </span>
      </div>

      {!db && (
        <p className="rounded-lg border border-line bg-panel/60 px-4 py-3 text-sm text-slate-500">
          未接 Supabase（缺 env）。設定 <code>.env.local</code> 後即顯示待審清單。
        </p>
      )}

      {db && reviews.length === 0 && (
        <p className="rounded-lg border border-line bg-panel/60 px-4 py-6 text-center text-sm text-slate-500">
          🎉 沒有待審項目。
        </p>
      )}

      {/* 智能分流摘要 + 一鍵放行（規劃書 §5.2：消化瓶頸） */}
      {autoPassCount > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3">
          <p className="text-sm text-emerald-700">
            🤖 智能分流：<b>{autoPassCount}</b> 筆為高信心低風險，建議自動放行；其餘 {reviews.length - autoPassCount} 筆需人工判斷。
          </p>
          <form action={bulkAutoPassAction}>
            <button className="rounded-md bg-emerald-500/20 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-500/30">
              一鍵放行 {autoPassCount} 筆
            </button>
          </form>
        </div>
      )}

      <ul className="space-y-3">
        {triaged.map(({ r, t }) => (
          <li key={r.id} className="rounded-lg border border-line bg-panel/60 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-accent/15 px-2 py-0.5 font-mono text-xs text-accent">
                    {r.targetKind}
                  </span>
                  {t.recommendation === "auto_pass" ? (
                    <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-700">建議自動放行</span>
                  ) : (
                    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700">需人工判斷</span>
                  )}
                  {r.confidence != null && (
                    <span className="text-xs text-slate-500">信心 {Math.round(r.confidence * 100)}%</span>
                  )}
                  {r.amount != null && (
                    <span className="text-xs text-slate-500">{formatPrice(r.amount, r.currency)}</span>
                  )}
                </div>
                <p className="mt-2 text-sm text-slate-700">{r.reason ?? "（無說明）"}</p>
                <p className="mt-1 text-xs text-slate-400">
                  分流依據：{t.reasons.join("；")}
                </p>
              </div>
              <div className="flex gap-2">
                <form action={decideReviewAction}>
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="decision" value="approved" />
                  <button className="rounded-md bg-emerald-500/15 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-500/25">
                    ✓ 核准
                  </button>
                </form>
                <form action={decideReviewAction}>
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="decision" value="rejected" />
                  <button className="rounded-md bg-red-500/15 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-500/25">
                    ✕ 退回
                  </button>
                </form>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
