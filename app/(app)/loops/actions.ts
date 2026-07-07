"use server";

import { revalidatePath } from "next/cache";
import { getServerDb } from "@/lib/server-db";
import { buildLifecycleRuntime } from "@/lib/lifecycle-runtime";

/**
 * 觸發一條 demo product-lifecycle（fake agents，落真 DB）。
 * 跑到 human-review 暫停 → 建一筆 human_review 綁住該 execution（供 /reviews 核准後 resume）。
 */
export async function triggerDemoRunAction(): Promise<void> {
  const db = getServerDb();
  if (!db) return;

  const { executionId, status } = await buildLifecycleRuntime(db).trigger();

  if (status === "waiting_human") {
    await db.from("human_reviews").insert({
      target_kind: "loop_execution",
      target_id: executionId,
      status: "pending",
      reason: "product-lifecycle 發佈前審核（demo）",
      loop_execution_id: executionId,
    });
  }

  revalidatePath("/loops");
  revalidatePath("/reviews");
  revalidatePath("/");
}
