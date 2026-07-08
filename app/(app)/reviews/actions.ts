"use server";

import { triageReview } from "@jbg/domain";
import { decideReview, listPendingReviews, type ReviewDecision } from "@jbg/persistence";
import { revalidatePath } from "next/cache";
import { getServerDb } from "@/lib/server-db";
import { buildLifecycleRuntime } from "@/lib/lifecycle-runtime";

/** 人審決策 server action（表單送出）。核准且綁 loop 時，自動 resume 該 loop。 */
export async function decideReviewAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const decision = String(formData.get("decision") ?? "") as ReviewDecision;
  if (!id || (decision !== "approved" && decision !== "rejected")) return;

  const db = getServerDb();
  if (!db) return;

  // 取出綁定的 loop_execution（若有）。
  const { data: review } = await db
    .from("human_reviews")
    .select("loop_execution_id")
    .eq("id", id)
    .maybeSingle<{ loop_execution_id: string | null }>();

  await decideReview(db, { id, decision, decidedAt: new Date().toISOString() });

  // 核准 → 續跑對應 loop（waiting_human → publish → remember → succeeded）。
  if (decision === "approved" && review?.loop_execution_id) {
    try {
      await buildLifecycleRuntime(db).resume(review.loop_execution_id);
    } catch {
      // resume 失敗不影響決策已寫入；trace 會顯示 loop 狀態。
    }
  }

  revalidatePath("/reviews");
  revalidatePath("/loops");
  revalidatePath("/");
}

/**
 * 智能分流一鍵放行（規劃書 §5.2）：把所有 triage 判為 auto_pass 的 pending 全部核准，
 * 並 resume 對應 loop。人力集中在 needs_human 的品項。
 */
export async function bulkAutoPassAction(): Promise<void> {
  const db = getServerDb();
  if (!db) return;
  const pending = await listPendingReviews(db);
  const runtime = buildLifecycleRuntime(db);
  const now = new Date().toISOString();

  for (const r of pending) {
    const t = triageReview({ targetKind: r.targetKind, confidence: r.confidence, amount: r.amount });
    if (t.recommendation !== "auto_pass") continue;
    await decideReview(db, {
      id: r.id,
      decision: "approved",
      note: `智能分流自動放行：${t.reasons.join("；")}`,
      decidedAt: now,
    });
    if (r.loopExecutionId) {
      try {
        await runtime.resume(r.loopExecutionId);
      } catch {
        // resume 失敗不影響決策；trace 反映 loop 狀態。
      }
    }
  }

  revalidatePath("/reviews");
  revalidatePath("/loops");
  revalidatePath("/");
}
