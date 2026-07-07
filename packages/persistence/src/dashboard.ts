import type { SupabaseClient } from "./client";

/** Dashboard read-model 查詢（read-only；給 UI server component 用）。 */

export interface ExecutionSummary {
  id: string;
  loopSlug: string;
  status: string;
  createdAt: string;
  stepCount: number;
}

export async function listRecentExecutions(
  db: SupabaseClient,
  limit = 10,
): Promise<ExecutionSummary[]> {
  const { data, error } = await db
    .from("loop_executions")
    .select("id, status, created_at, loops(slug), loop_steps(count)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listRecentExecutions: ${error.message}`);
  type Row = {
    id: string;
    status: string;
    created_at: string;
    loops: { slug: string } | null;
    loop_steps: { count: number }[];
  };
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    loopSlug: r.loops?.slug ?? "—",
    status: r.status,
    createdAt: r.created_at,
    stepCount: r.loop_steps?.[0]?.count ?? 0,
  }));
}

export async function productStatusCounts(
  db: SupabaseClient,
): Promise<Record<string, number>> {
  const { data, error } = await db.from("products").select("status");
  if (error) throw new Error(`productStatusCounts: ${error.message}`);
  const counts: Record<string, number> = {};
  for (const row of (data ?? []) as { status: string }[]) {
    counts[row.status] = (counts[row.status] ?? 0) + 1;
  }
  return counts;
}

export async function countRows(
  db: SupabaseClient,
  table: string,
  filter?: { column: string; value: string },
): Promise<number> {
  let q = db.from(table).select("*", { count: "exact", head: true });
  if (filter) q = q.eq(filter.column, filter.value);
  const { count, error } = await q;
  if (error) throw new Error(`countRows(${table}): ${error.message}`);
  return count ?? 0;
}

export interface AgentRow {
  code: string;
  name: string;
  requiresHumanReview: boolean;
}

export async function listAgents(db: SupabaseClient): Promise<AgentRow[]> {
  const { data, error } = await db
    .from("agents")
    .select("code, name, requires_human_review");
  if (error) throw new Error(`listAgents: ${error.message}`);
  return ((data ?? []) as { code: string; name: string; requires_human_review: boolean }[]).map(
    (r) => ({ code: r.code, name: r.name, requiresHumanReview: r.requires_human_review }),
  );
}

export interface DashboardSnapshot {
  executions: ExecutionSummary[];
  productCounts: Record<string, number>;
  productTotal: number;
  pendingReviews: number;
  agentCount: number;
  loopCount: number;
  memoryCount: number;
  agentRunCount: number;
}

/** 一次抓齊 Dashboard 需要的所有數字。 */
export async function loadDashboard(db: SupabaseClient): Promise<DashboardSnapshot> {
  const [executions, productCounts, pendingReviews, agentCount, loopCount, memoryCount, agentRunCount] =
    await Promise.all([
      listRecentExecutions(db, 8),
      productStatusCounts(db),
      countRows(db, "human_reviews", { column: "status", value: "pending" }),
      countRows(db, "agents"),
      countRows(db, "loops"),
      countRows(db, "memories"),
      countRows(db, "agent_runs"),
    ]);
  const productTotal = Object.values(productCounts).reduce((a, b) => a + b, 0);
  return { executions, productCounts, productTotal, pendingReviews, agentCount, loopCount, memoryCount, agentRunCount };
}
