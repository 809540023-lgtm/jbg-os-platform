"use server";

import { decideReview, type ReviewDecision } from "@jbg/persistence";
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
