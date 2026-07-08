"use server";

import { SupabaseInquiryRepo } from "@jbg/persistence";
import { revalidatePath } from "next/cache";
import { getServerDb } from "@/lib/server-db";
import { draftInquiryReply } from "@/lib/inquiry-runtime";

/** 客服核定送出回覆（守則#4：回覆客戶＝人審核定的動作）。 */
export async function sendAnswerAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const answer = String(formData.get("answer") ?? "").trim();
  if (!id || answer.length < 1) return;
  const db = getServerDb();
  if (!db) return;
  await new SupabaseInquiryRepo(db).markAnswered(id, answer);
  revalidatePath("/inquiries");
  revalidatePath("/");
}

/** 重新產生 AI 草稿（客服覺得草稿不好時）。 */
export async function redraftAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const db = getServerDb();
  if (!db) return;
  await draftInquiryReply(db, id);
  revalidatePath("/inquiries");
}
