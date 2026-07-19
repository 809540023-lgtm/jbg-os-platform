import { loadAnalytics, type AnalyticsSnapshot } from "@jbg/persistence";
import Link from "next/link";
import { getServerDb } from "@/lib/server-db";

export const dynamic = "force-dynamic";

/**
 * 營運數據儀表板（規劃書 §6.3 每週儀表板）。
 * DB 可算的營運面指標；流量/ROAS 等需接 Meta/GA（見頁尾註記）。
 */

const PRODUCT_STATUS_LABEL: Record<string, string> = {
  published: "已上架",
  reviewing: "審核中",
  priced: "已估價",
  composed: "文案完成",
  assembled: "商品卡",
  draft: "草稿",
  sold: "已售出",
};

function Metric({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-panel/60 p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${accent ? "text-accent" : "text-slate-900"}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 shrink-0 text-xs text-slate-600">{label}</span>
      <div className="h-3 flex-1 overflow-hidden rounded-full bg-panel">
        <div className="h-full rounded-full bg-accent/70" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 shrink-0 text-right text-xs text-slate-600">{value}</span>
    </div>
  );
}

export default async function AnalyticsPage() {
  const db = getServerDb();
  const a: AnalyticsSnapshot | null = db ? await loadAnalytics(db) : null;

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <div className="mb-8">
        <Link href="/dashboard" className="text-xs text-accent hover:underline">← Dashboard</Link>
        <h1 className="mt-2 text-3xl font-bold">營運數據儀表板</h1>
        <p className="mt-1 text-sm text-slate-600">規劃書 §6.3 每週儀表板 —— 商品、詢問、人審、成本。</p>
      </div>

      {!a && (
        <p className="rounded-lg border border-line bg-panel/60 px-4 py-3 text-sm text-slate-500">未接 Supabase（缺 env）。</p>
      )}

      {a && (
        <>
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label="上架商品" value={String(a.publishedCount)} hint={`共 ${a.productTotal} 件（含整備中）`} accent />
            <Metric label="累計詢問" value={String(a.inquiryTotal)} hint={`${a.inquiryOpen} 待處理 · ${a.inquiryAnswered} 已回`} />
            <Metric
              label="AI 可自動回覆率"
              value={`${Math.round(a.inquiryAutoReplyRate * 100)}%`}
              hint={`${a.inquiryAutoReplyable}/${a.inquiryTotal} 則低風險`}
              accent
            />
            <Metric label="待人審" value={String(a.pendingReviews)} hint="規模化瓶頸指標 §5.2" accent={a.pendingReviews > 0} />
          </section>

          <section className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label="AI 呼叫次數" value={String(a.agentRunCount)} />
            <Metric label="AI 累計成本" value={`$${a.agentCostUsd.toFixed(4)}`} hint="USD（agent_runs 記帳）" />
            <Metric label="記憶累積" value={String(a.memoryCount)} />
            <Metric label="訂單 / 代管中" value={`${a.orderCount} / ${a.escrowHeldCount}`} hint="escrow funds_held" />
          </section>

          {/* 商品狀態漏斗 */}
          <section className="mt-8 rounded-xl border border-line bg-panel/40 p-5">
            <h2 className="mb-4 text-sm font-semibold text-slate-800">商品生命週期分佈</h2>
            <div className="space-y-2">
              {Object.entries(a.productCounts)
                .sort((x, y) => y[1] - x[1])
                .map(([status, n]) => (
                  <Bar
                    key={status}
                    label={PRODUCT_STATUS_LABEL[status] ?? status}
                    value={n}
                    max={a.productTotal}
                  />
                ))}
            </div>
          </section>

          <p className="mt-8 rounded-lg border border-line bg-panel/40 px-4 py-3 text-xs text-slate-500">
            📊 流量、詢問成本、再行銷 ROAS、冷受眾 CPL 等需接 Meta Pixel / Google Analytics（規劃書 §3.5/§6.3）；
            接上帳號後可在此併入。目前顯示的是系統可直接計算的營運面指標。
          </p>
        </>
      )}
    </main>
  );
}
