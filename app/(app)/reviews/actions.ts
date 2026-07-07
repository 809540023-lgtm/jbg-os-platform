"use server";

import { decideReview, type ReviewDecision } from "@jbg/persistence";
import { revalidatePath } from "next/cache";
import { getServerDb } from "@/lib/server-db";

/** 人審決策 server action（表單送出）。 */
export async function decideReviewAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const decision = String(formData.get("decision") ?? "") as ReviewDecision;
  if (!id || (decision !== "approved" && decision !== "rejected")) return;

  const db = getServerDb();
  if (!db) return;

  await decideReview(db, { id, decision, decidedAt: new Date().toISOString() });
  // TODO: 若 review 綁 loop_execution → resume（waiting_human → running）。
  revalidatePath("/reviews");
  revalidatePath("/");
}
