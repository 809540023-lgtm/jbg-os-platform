import {
  SupabaseLoopExecutionRepo,
  SupabaseLoopStepRepo,
} from "@jbg/persistence";
import type { LoopExecutionId } from "@jbg/domain";
import Link from "next/link";
import { getServerDb } from "@/lib/server-db";

export const dynamic = "force-dynamic";

const STATUS_COLOR: Record<string, string> = {
  succeeded: "bg-emerald-500/15 text-emerald-700",
  running: "bg-blue-500/15 text-blue-700",
  waiting_human: "bg-amber-500/15 text-amber-700",
  failed: "bg-red-500/15 text-red-700",
  skipped: "bg-zinc-500/15 text-slate-600",
  pending: "bg-zinc-500/15 text-slate-700",
};

function duration(a?: string, b?: string): string {
  if (!a || !b) return "—";
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

/** 單一 LoopExecution 的 step 軌跡（Observability trace，Todo 17）。 */
export default async function LoopDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = getServerDb();

  if (!db) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <Link href="/loops" className="text-xs text-accent hover:underline">← Loops</Link>
        <p className="mt-4 text-sm text-slate-500">未接 Supabase。</p>
      </main>
    );
  }

  const execution = await new SupabaseLoopExecutionRepo(db).get(id as LoopExecutionId);
  const steps = await new SupabaseLoopStepRepo(db).listByExecution(id as LoopExecutionId);

  if (!execution) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <Link href="/loops" className="text-xs text-accent hover:underline">← Loops</Link>
        <p className="mt-4 text-sm text-slate-500">找不到此 LoopExecution。</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Link href="/loops" className="text-xs text-accent hover:underline">← Loops</Link>
      <div className="mt-2 mb-6 flex items-center gap-3">
        <h1 className="font-mono text-2xl font-bold text-accent">{execution.loopId}</h1>
        <span className={`rounded px-2 py-0.5 text-xs ${STATUS_COLOR[execution.status] ?? "bg-panel"}`}>{execution.status}</span>
      </div>
      <p className="mb-8 font-mono text-xs text-slate-500">
        {execution.id} · cursor {execution.cursor} · {new Date(execution.createdAt).toLocaleString("zh-TW")}
      </p>

      <ol className="relative space-y-3 border-l border-line pl-6">
        {steps.map((s) => (
          <li key={s.id} className="relative">
            <span className="absolute -left-[1.65rem] top-1.5 h-3 w-3 rounded-full border-2 border-ink bg-accent" />
            <div className="rounded-lg border border-line bg-panel/60 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <span className="font-mono text-xs text-slate-500">#{s.attempt}</span>
                  <span className="font-medium">{s.stepDefId}</span>
                  <span className="rounded bg-panel px-1.5 py-0.5 text-[10px] text-slate-600">{s.type}{s.ref ? `:${s.ref}` : ""}</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">{duration(s.startedAt, s.finishedAt)}</span>
                  <span className={`rounded px-2 py-0.5 text-xs ${STATUS_COLOR[s.status] ?? "bg-panel"}`}>{s.status}</span>
                </span>
              </div>
              {s.error && <p className="mt-2 text-xs text-red-600">{s.error}</p>}
            </div>
          </li>
        ))}
        {steps.length === 0 && <li className="text-sm text-slate-500">尚無 step 記錄。</li>}
      </ol>
    </main>
  );
}
