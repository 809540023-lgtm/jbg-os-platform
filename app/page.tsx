import { AGENT_CODE, PRODUCT_STATUS } from "@jbg/db";

/**
 * JBG OS Dashboard —— MVP 首頁（server component）。
 * 目前為狀態總覽（讀 canonical model）；接上 Supabase 後改為即時 LoopExecution/HR 佇列。
 */

const AGENT_META: Record<string, { name: string; role: string; done: boolean }> = {
  vision: { name: "Vision", role: "看照片：品牌/品類/瑕疵/信心", done: true },
  ocr: { name: "OCR", role: "抽文字：型號/序號/尺寸/成分", done: true },
  price: { name: "Price", role: "估價：建議價/區間/理由", done: true },
  marketing: { name: "Marketing", role: "寫 FB 文案草稿", done: true },
  reviewer: { name: "Reviewer", role: "自動品管：pass/reject", done: true },
  publisher: { name: "Publisher", role: "發佈到 FB（需 connector）", done: false },
  memory: { name: "Memory", role: "萃取記憶（需 DB）", done: false },
};

const LIFECYCLE = [
  "drive-ingest",
  "perceive",
  "assemble",
  "gap-check",
  "price",
  "compose",
  "review",
  "human-review",
  "publish",
  "engage",
  "close",
  "aftersale",
  "remember",
];
const DONE_STAGES = new Set([
  "perceive",
  "assemble",
  "gap-check",
  "price",
  "compose",
  "review",
]);

const MVP_TODOS = [
  { n: "1–3", label: "M0 Runtime（Loop / Agent / Permission）", done: true },
  { n: "5–7", label: "M1 感知（ocr ‖ vision + perceive）", done: true },
  { n: "8–9", label: "M2 組裝（assemble + gap-check）", done: true },
  { n: "10–12", label: "推理 agents（price / marketing / reviewer）", done: true },
  { n: "4", label: "drive connector（需憑證）", done: false },
  { n: "13–15", label: "Human Review 面板 + publisher + LINE", done: false },
  { n: "16–17", label: "memory + Observability trace", done: false },
];

function Badge({ done }: { done: boolean }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
        done ? "bg-emerald-500/15 text-emerald-300" : "bg-zinc-500/15 text-zinc-400"
      }`}
    >
      {done ? "✓ done" : "待建"}
    </span>
  );
}

export default function DashboardPage() {
  const doneAgents = AGENT_CODE.filter((c) => AGENT_META[c]?.done).length;
  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <header className="mb-10">
        <p className="text-sm font-medium tracking-widest text-accent">
          AI BUSINESS OPERATING SYSTEM
        </p>
        <h1 className="mt-2 text-4xl font-bold">JBG OS</h1>
        <p className="mt-3 max-w-2xl text-zinc-400">
          把「一個人腦中的生意流程」外化成可被 AI Agent 執行、可被人類審核、可被記憶累積、可被觀測的系統。
          第一個實作：<span className="text-zinc-200">Second-Hand AI Platform (SHAP)</span>。
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-xs text-zinc-400">
          <span className="rounded border border-line bg-panel px-2 py-1">Architecture Bible v1.0</span>
          <span className="rounded border border-line bg-panel px-2 py-1">
            Agents {doneAgents}/{AGENT_CODE.length}
          </span>
          <span className="rounded border border-line bg-panel px-2 py-1">34/34 tests ✓</span>
        </div>
      </header>

      <Section title="MVP 進度">
        <ul className="space-y-2">
          {MVP_TODOS.map((t) => (
            <li
              key={t.n}
              className="flex items-center justify-between rounded-lg border border-line bg-panel/60 px-4 py-2.5"
            >
              <span>
                <span className="mr-2 font-mono text-xs text-zinc-500">Todo {t.n}</span>
                {t.label}
              </span>
              <Badge done={t.done} />
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Canonical Agents（§0.6）">
        <div className="grid gap-3 sm:grid-cols-2">
          {AGENT_CODE.map((code) => {
            const m = AGENT_META[code]!;
            return (
              <div key={code} className="rounded-lg border border-line bg-panel/60 p-4">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{m.name}</span>
                  <Badge done={m.done} />
                </div>
                <p className="mt-1 font-mono text-xs text-accent">{code}</p>
                <p className="mt-2 text-sm text-zinc-400">{m.role}</p>
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="product-lifecycle 流程（§0.7）">
        <div className="flex flex-wrap items-center gap-2">
          {LIFECYCLE.map((stage, i) => (
            <span key={stage} className="flex items-center gap-2">
              <code
                className={`rounded px-2 py-1 text-xs ${
                  DONE_STAGES.has(stage)
                    ? "bg-emerald-500/15 text-emerald-300"
                    : "bg-panel text-zinc-400 border border-line"
                }`}
              >
                {stage}
              </code>
              {i < LIFECYCLE.length - 1 && <span className="text-zinc-600">→</span>}
            </span>
          ))}
        </div>
      </Section>

      <Section title="product_status 狀態機（§0.11，R1）">
        <div className="flex flex-wrap gap-2">
          {PRODUCT_STATUS.map((s) => (
            <code key={s} className="rounded border border-line bg-panel px-2 py-1 text-xs text-zinc-300">
              {s}
            </code>
          ))}
        </div>
      </Section>

      <footer className="mt-12 border-t border-line pt-6 text-sm text-zinc-500">
        規格：<code className="text-zinc-400">docs/</code> Architecture Bible v1.0 · SSOT =
        <code className="text-zinc-400"> docs/00-canonical-model.md</code>
      </footer>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="mb-4 text-lg font-semibold text-zinc-200">{title}</h2>
      {children}
    </section>
  );
}
