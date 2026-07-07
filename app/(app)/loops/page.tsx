import { listRecentExecutions, type ExecutionSummary } from "@jbg/persistence";
import Link from "next/link";
import { getServerDb } from "@/lib/server-db";

export const dynamic = "force-dynamic";

const STATUS_COLOR: Record<string, string> = {
  succeeded: "bg-emerald-500/15 text-emerald-300",
  running: "bg-blue-500/15 text-blue-300",
  waiting_human: "bg-amber-500/15 text-amber-300",
  failed: "bg-red-500/15 text-red-300",
  queued: "bg-zinc-500/15 text-zinc-300",
  cancelled: "bg-zinc-500/15 text-zinc-400",
};

/** Loop 執行清單（Observability，§0.4 layer12 / docs/09 Loops）。 */
export default async function LoopsPage() {
  const db = getServerDb();
  const rows: ExecutionSummary[] = db ? await listRecentExecutions(db, 30) : [];

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Link href="/" className="text-xs text-accent hover:underline">← Dashboard</Link>
      <h1 className="mt-2 mb-6 text-3xl font-bold">Loop 執行</h1>
      {!db && <p className="text-sm text-zinc-500">未接 Supabase。</p>}
      {db && rows.length === 0 && (
        <p className="rounded-lg border border-line bg-panel/60 px-4 py-6 text-center text-sm text-zinc-500">尚無執行紀錄。</p>
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
              <span className="text-xs text-zinc-500">{e.stepCount} steps · {new Date(e.createdAt).toLocaleString("zh-TW")}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
