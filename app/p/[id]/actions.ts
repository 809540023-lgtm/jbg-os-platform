"use server";

import { SupabaseInquiryRepo } from "@jbg/persistence";
import { getServerDb } from "@/lib/server-db";
import { draftInquiryReply } from "@/lib/inquiry-runtime";
import { clientIp, rateLimit } from "@/lib/rate-limit";

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
  // 蜜罐：真人看不到的欄位，被填 = 機器人 → 假裝成功、不建立資料、不燒 AI。
  if (String(formData.get("company") ?? "").trim() !== "") {
    return { ok: true, message: "已收到您的詢問，我們會盡快回覆！" };
  }

  const productId = String(formData.get("productId") ?? "");
  const message = String(formData.get("message") ?? "").trim();
  const handle = String(formData.get("handle") ?? "").trim() || null;
  if (!productId || message.length < 2) {
    return { ok: false, message: "請輸入您的問題。" };
  }
  if (message.length > 1000) {
    return { ok: false, message: "問題內容過長，請精簡後再試。" };
  }

  // Rate limit：每 IP 10 分鐘最多 5 則，擋機器人灌爆 / AI 帳單攻擊。
  const ip = await clientIp();
  if (!rateLimit(`inquiry:${ip}`, 5, 10 * 60 * 1000)) {
    return { ok: false, message: "詢問過於頻繁，請稍後再試（或直接聯繫我們）。" };
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
