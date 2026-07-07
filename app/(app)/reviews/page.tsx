import { listPendingReviews, type PendingReview } from "@jbg/persistence";
import Link from "next/link";
import { getServerDb } from "@/lib/server-db";
import { decideReviewAction } from "./actions";

export const dynamic = "force-dynamic";

/**
 * Human Review 面板（docs/09 Reviews / docs/07 §7.4 / 附錄 K）。
 * 列出 pending human_reviews，可 approve / reject（server action 回寫 DB）。
 */
export default async function ReviewsPage() {
  const db = getServerDb();
  const reviews: PendingReview[] = db ? await listPendingReviews(db) : [];

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <Link href="/" className="text-xs text-accent hover:underline">← Dashboard</Link>
          <h1 className="mt-2 text-3xl font-bold">Human Review</h1>
          <p className="mt-1 text-sm text-zinc-400">
            待人類決策的關卡（§0.7 <code className="text-zinc-300">human-review</code>）。
          </p>
        </div>
        <span className="rounded-full bg-amber-500/15 px-3 py-1 text-sm font-medium text-amber-300">
          {reviews.length} 待審
        </span>
      </div>

      {!db && (
        <p className="rounded-lg border border-line bg-panel/60 px-4 py-3 text-sm text-zinc-500">
          未接 Supabase（缺 env）。設定 <code>.env.local</code> 後即顯示待審清單。
        </p>
      )}

      {db && reviews.length === 0 && (
        <p className="rounded-lg border border-line bg-panel/60 px-4 py-6 text-center text-sm text-zinc-500">
          🎉 沒有待審項目。
        </p>
      )}

      <ul className="space-y-3">
        {reviews.map((r) => (
          <li key={r.id} className="rounded-lg border border-line bg-panel/60 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-accent/15 px-2 py-0.5 font-mono text-xs text-accent">
                    {r.targetKind}
                  </span>
                  <span className="font-mono text-xs text-zinc-500">{r.targetId.slice(0, 8)}…</span>
                </div>
                <p className="mt-2 text-sm text-zinc-300">{r.reason ?? "（無說明）"}</p>
                <p className="mt-1 text-xs text-zinc-600">
                  {new Date(r.createdAt).toLocaleString("zh-TW")}
                </p>
              </div>
              <div className="flex gap-2">
                <form action={decideReviewAction}>
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="decision" value="approved" />
                  <button className="rounded-md bg-emerald-500/15 px-3 py-1.5 text-sm font-medium text-emerald-300 hover:bg-emerald-500/25">
                    ✓ 核准
                  </button>
                </form>
                <form action={decideReviewAction}>
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="decision" value="rejected" />
                  <button className="rounded-md bg-red-500/15 px-3 py-1.5 text-sm font-medium text-red-300 hover:bg-red-500/25">
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
