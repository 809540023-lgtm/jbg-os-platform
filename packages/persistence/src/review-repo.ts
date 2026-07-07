import type { SupabaseClient } from "./client";

/** Human Review read + decide（docs/07 §7.4，附錄 K）。 */

export interface PendingReview {
  id: string;
  targetKind: string;
  targetId: string;
  reason: string | null;
  loopExecutionId: string | null;
  createdAt: string;
}

export async function listPendingReviews(
  db: SupabaseClient,
  limit = 50,
): Promise<PendingReview[]> {
  const { data, error } = await db
    .from("human_reviews")
    .select("id, target_kind, target_id, reason, loop_execution_id, created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`listPendingReviews: ${error.message}`);
  type Row = {
    id: string;
    target_kind: string;
    target_id: string;
    reason: string | null;
    loop_execution_id: string | null;
    created_at: string;
  };
  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id,
    targetKind: r.target_kind,
    targetId: r.target_id,
    reason: r.reason,
    loopExecutionId: r.loop_execution_id,
    createdAt: r.created_at,
  }));
}

export type ReviewDecision = "approved" | "rejected";

/** 人審決策 → 更新 human_reviews；回寫 decided_at / note（§0.11 human_review_status）。 */
export async function decideReview(
  db: SupabaseClient,
  input: { id: string; decision: ReviewDecision; note?: string; decidedAt: string },
): Promise<void> {
  const { error } = await db
    .from("human_reviews")
    .update({
      status: input.decision,
      decision_note: input.note ?? null,
      decided_at: input.decidedAt,
    })
    .eq("id", input.id)
    .eq("status", "pending"); // 只動仍 pending 的（避免重複決策）
  if (error) throw new Error(`decideReview: ${error.message}`);
}
