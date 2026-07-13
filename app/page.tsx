import { AGENT_CODE, PRODUCT_STATUS } from "@jbg/db";
import { listAgents, loadDashboard, type DashboardSnapshot } from "@jbg/persistence";
import Link from "next/link";
import { getServerDb } from "./lib/server-db";

export const dynamic = "force-dynamic";

/**
 * JBG OS Dashboard —— 有接 DB 時顯示即時狀態；無 DB（例如尚未設定的部署）回退靜態 canonical。
 */

const AGENT_META: Record<string, { name: string; role: string; done: boolean }> = {
  vision: { name: "Vision", role: "看照片：品牌/品類/瑕疵/信心", done: true },
  ocr: { name: "OCR", role: "抽文字：型號/序號/尺寸/成分", done: true },
  price: { name: "Price", role: "估價：建議價/區間/理由", done: true },
  marketing: { name: "Marketing", role: "寫 FB 文案草稿", done: true },
  reviewer: { name: "Reviewer", role: "自動品管：pass/reject", done: true },
  publisher: { name: "Publisher", role: "發佈到 FB（過 Policy + connector）", done: true },
  memory: { name: "Memory", role: "從成交萃取記憶", done: true },
  inquiry: { name: "Inquiry", role: "AI 客服：草擬詢問回覆（送出過人審）", done: true },
};

const LIFECYCLE = [
  "drive-ingest", "perceive", "assemble", "gap-check", "price", "compose",
  "review", "human-review", "publish", "engage", "close", "aftersale", "remember",
];
const DONE_STAGES = new Set([
  "perceive", "assemble", "gap-check", "price", "compose", "review",
  "human-review", "publish", "engage", "remember",
]);

const STATUS_COLOR: Record<string, string> = {
  succeeded: "bg-emerald-500/15 text-emerald-700",
  running: "bg-blue-500/15 text-blue-700",
  waiting_human: "bg-amber-500/15 text-amber-700",
  failed: "bg-red-500/15 text-red-700",
  queued: "bg-zinc-500/15 text-slate-700",
  cancelled: "bg-zinc-500/15 text-slate-600",
};

async function fetchLive(): Promise<{ snap: DashboardSnapshot; agentHR: Record<string, boolean> } | null> {
  const db = getServerDb();
  if (!db) return null;
  try {
    const [snap, agents] = await Promise.all([loadDashboard(db), listAgents(db)]);
    const agentHR: Record<string, boolean> = {};
    for (const a of agents) agentHR[a.code] = a.requiresHumanReview;
    return { snap, agentHR };
  } catch {
    return null;
  }
}

export default async function DashboardPage() {
  const live = await fetchLive();
  const doneAgents = AGENT_CODE.filter((c) => AGENT_META[c]?.done).length;

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <header className="mb-10">
        <p className="text-sm font-medium tracking-widest text-accent">AI BUSINESS OPERATING SYSTEM</p>
        <h1 className="mt-2 text-4xl font-bold">JBG OS</h1>
        <p className="mt-3 max-w-2xl text-slate-600">
          把「一個人腦中的生意流程」外化成可被 AI Agent 執行、可被人類審核、可被記憶累積、可被觀測的系統。
          第一個實作：<span className="text-slate-800">Second-Hand AI Platform (SHAP)</span>。
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-600">
          <span className="rounded border border-line bg-panel px-2 py-1">Architecture Bible v1.0</span>
          <span className="rounded border border-line bg-panel px-2 py-1">Agents {doneAgents}/{AGENT_CODE.length}</span>
          <span className="rounded border border-line bg-panel px-2 py-1">63/63 tests ✓</span>
          <Link href="/p" className="rounded border border-accent/50 bg-accent/10 px-2 py-1 text-accent hover:bg-accent/20">餐飲二手設備目錄 →</Link>
          <Link href="/inquiries" className="rounded border border-line bg-panel px-2 py-1 hover:border-accent/50">AI 客服 →</Link>
          <Link href="/analytics" className="rounded border border-line bg-panel px-2 py-1 hover:border-accent/50">營運儀表板 →</Link>
          <span className={`rounded border px-2 py-1 ${live ? "border-emerald-600/50 bg-emerald-500/10 text-emerald-700" : "border-line bg-panel"}`}>
            {live ? "● Supabase 已連線" : "○ 靜態（未接 DB）"}
          </span>
        </div>
      </header>

      {live && (
        <Section title="系統即時狀態（Supabase）">
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Stat label="商品" value={live.snap.productTotal} />
            <Link href="/reviews" className="rounded-lg transition hover:ring-1 hover:ring-amber-500/40">
              <Stat label="待人審 →" value={live.snap.pendingReviews} accent={live.snap.pendingReviews > 0} />
            </Link>
            <Stat label="AI 呼叫" value={live.snap.agentRunCount} />
            <Stat label="Memories" value={live.snap.memoryCount} />
            <Stat label="Loops" value={live.snap.loopCount} />
          </div>
          <h3 className="mb-2 flex items-center justify-between text-sm font-medium text-slate-700">
            最近的 Loop 執行
            <Link href="/loops" className="text-xs text-accent hover:underline">全部 →</Link>
          </h3>
          {live.snap.executions.length === 0 ? (
            <p className="rounded-lg border border-line bg-panel/60 px-4 py-3 text-sm text-slate-500">
              尚無執行紀錄。跑一次 <code className="text-slate-600">product-lifecycle</code> 就會出現在這裡。
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full text-sm">
                <thead className="bg-panel text-left text-xs text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Loop</th>
                    <th className="px-3 py-2">狀態</th>
                    <th className="px-3 py-2">Steps</th>
                    <th className="px-3 py-2">時間</th>
                  </tr>
                </thead>
                <tbody>
                  {live.snap.executions.map((e) => (
                    <tr key={e.id} className="border-t border-line/60 hover:bg-panel/40">
                      <td className="px-3 py-2 font-mono text-xs">
                        <Link href={`/loops/${e.id}`} className="text-accent hover:underline">{e.loopSlug}</Link>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`rounded px-2 py-0.5 text-xs ${STATUS_COLOR[e.status] ?? "bg-panel"}`}>{e.status}</span>
                      </td>
                      <td className="px-3 py-2 text-slate-600">{e.stepCount}</td>
                      <td className="px-3 py-2 text-xs text-slate-500">{new Date(e.createdAt).toLocaleString("zh-TW")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      )}

      <Section title="Canonical Agents（§0.6）">
        <div className="grid gap-3 sm:grid-cols-2">
          {AGENT_CODE.map((code) => {
            const m = AGENT_META[code] ?? { name: code, role: "", done: false };
            const hr = live?.agentHR[code];
            return (
              <div key={code} className="rounded-lg border border-line bg-panel/60 p-4">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{m.name}</span>
                  <Badge done={m.done} />
                </div>
                <p className="mt-1 font-mono text-xs text-accent">{code}</p>
                <p className="mt-2 text-sm text-slate-600">{m.role}</p>
                {live && (
                  <p className="mt-2 text-xs text-slate-500">
                    需人審：{hr ? <span className="text-amber-700">是</span> : "否"}
                    <span className="ml-1 text-slate-400">· 來源 DB</span>
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="product-lifecycle 流程（§0.7）">
        <div className="flex flex-wrap items-center gap-2">
          {LIFECYCLE.map((stage, i) => (
            <span key={stage} className="flex items-center gap-2">
              <code className={`rounded px-2 py-1 text-xs ${DONE_STAGES.has(stage) ? "bg-emerald-500/15 text-emerald-700" : "border border-line bg-panel text-slate-600"}`}>{stage}</code>
              {i < LIFECYCLE.length - 1 && <span className="text-slate-400">→</span>}
            </span>
          ))}
        </div>
      </Section>

      <Section title="product_status 狀態機（§0.11，R1）">
        <div className="flex flex-wrap gap-2">
          {PRODUCT_STATUS.map((s) => {
            const n = live?.snap.productCounts[s];
            return (
              <code key={s} className="rounded border border-line bg-panel px-2 py-1 text-xs text-slate-700">
                {s}{n ? <span className="ml-1 text-accent">·{n}</span> : null}
              </code>
            );
          })}
        </div>
      </Section>

      <footer className="mt-12 border-t border-line pt-6 text-sm text-slate-500">
        規格：<code className="text-slate-600">docs/</code> Architecture Bible v1.0 · SSOT =
        <code className="text-slate-600"> docs/00-canonical-model.md</code>
      </footer>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="mb-4 text-lg font-semibold text-slate-800">{title}</h2>
      {children}
    </section>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-line bg-panel/60 p-4">
      <div className={`text-2xl font-bold ${accent ? "text-amber-700" : "text-slate-900"}`}>{value}</div>
      <div className="mt-1 text-xs text-slate-500">{label}</div>
    </div>
  );
}

function Badge({ done }: { done: boolean }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${done ? "bg-emerald-500/15 text-emerald-700" : "bg-zinc-500/15 text-slate-600"}`}>
      {done ? "✓ done" : "待建"}
    </span>
  );
}
