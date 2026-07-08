"use server";

import { SupabaseInquiryRepo } from "@jbg/persistence";
import { getServerDb } from "@/lib/server-db";
import { draftInquiryReply } from "@/lib/inquiry-runtime";

export interface InquiryFormState {
  ok: boolean;
  message: string;
  reply?: string;
  pendingHuman?: boolean;
}

/** 公開商品頁的詢問表單：建立詢問 → 立即由 Inquiry Agent 草擬回覆。 */
export async function submitInquiryAction(
  _prev: InquiryFormState,
  formData: FormData,
): Promise<InquiryFormState> {
  const productId = String(formData.get("productId") ?? "");
  const message = String(formData.get("message") ?? "").trim();
  const handle = String(formData.get("handle") ?? "").trim() || null;
  if (!productId || message.length < 2) {
    return { ok: false, message: "請輸入您的問題。" };
  }

  const db = getServerDb();
  if (!db) return { ok: false, message: "系統暫時無法受理，請稍後再試。" };

  try {
    const repo = new SupabaseInquiryRepo(db);
    const id = await repo.create({ productId, message, customerHandle: handle, channel: "web" });
    const draft = await draftInquiryReply(db, id);
    if (!draft) return { ok: true, message: "已收到您的詢問，我們會盡快回覆！" };
    if (draft.requiresHumanReview) {
      return { ok: true, message: "已收到您的詢問，專人將盡快與您聯繫確認細節。", pendingHuman: true };
    }
    return { ok: true, message: "已收到您的詢問！以下是初步回覆：", reply: draft.reply };
  } catch {
    return { ok: false, message: "送出失敗，請稍後再試。" };
  }
}
