import { listRecentExecutions, type ExecutionSummary } from "@jbg/persistence";
import Link from "next/link";
import { getServerDb } from "@/lib/server-db";
import { triggerDemoRunAction } from "./actions";

export const dynamic = "force-dynamic";

const STATUS_COLOR: Record<string, string> = {
  succeeded: "bg-emerald-500/15 text-emerald-700",
  running: "bg-blue-500/15 text-blue-700",
  waiting_human: "bg-amber-500/15 text-amber-700",
  failed: "bg-red-500/15 text-red-700",
  queued: "bg-zinc-500/15 text-slate-700",
  cancelled: "bg-zinc-500/15 text-slate-600",
};

/** Loop 執行清單（Observability，§0.4 layer12 / docs/09 Loops）。 */
export default async function LoopsPage() {
  const db = getServerDb();
  const rows: ExecutionSummary[] = db ? await listRecentExecutions(db, 30) : [];

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Link href="/" className="text-xs text-accent hover:underline">← Dashboard</Link>
      <div className="mt-2 mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Loop 執行</h1>
        {db && (
          <form action={triggerDemoRunAction}>
            <button className="rounded-md bg-accent/15 px-3 py-2 text-sm font-medium text-accent hover:bg-accent/25">
              ▶ 觸發一次 demo lifecycle
            </button>
          </form>
        )}
      </div>
      {!db && <p className="text-sm text-slate-500">未接 Supabase。</p>}
      {db && rows.length === 0 && (
        <p className="rounded-lg border border-line bg-panel/60 px-4 py-6 text-center text-sm text-slate-500">尚無執行紀錄。</p>
      )}
      <ul className="space-y-2">
        {rows.map((e) => (
          <li key={e.id}>
            <Link
              href={`/loops/${e.id}`}
              className="flex items-center justify-between rounded-lg border border-line bg-panel/60 px-4 py-3 transition hover:border-accent/50"
            >
              <span className="flex items-center gap-3">
                <span className={`rounded px-2 py-0.5 text-xs ${STATUS_COLOR[e.status] ?? "bg-panel"}`}>{e.status}</span>
                <span className="font-mono text-sm text-accent">{e.loopSlug}</span>
              </span>
              <span className="text-xs text-slate-500">{e.stepCount} steps · {new Date(e.createdAt).toLocaleString("zh-TW")}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
