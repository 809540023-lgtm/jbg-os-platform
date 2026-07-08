import { z } from "zod";

/**
 * Inquiry（客服詢問）契約 —— canonical §0.6 v1.1（Inquiry Agent）。
 * 買家對某商品的提問 → Agent 草擬回覆 + 判斷是否可自動答（守則#4：送出需 HR）。
 */

/** 買家詢問常見意圖 —— 決定風險等級。 */
export const INQUIRY_INTENT = [
  "spec", // 規格/型號/尺寸/電壓
  "availability", // 是否現貨/還在不在
  "location", // 地區/可否到府/自取
  "price", // 議價/可否便宜（高風險）
  "warranty", // 保固/驗收/安裝承諾（高風險）
  "complaint", // 客訴/退換（高風險）
  "other",
] as const;
export type InquiryIntent = (typeof INQUIRY_INTENT)[number];

/** 強制人審的意圖（守則#4：議價/承諾/客訴不可由 AI 自動送出）。 */
export const HUMAN_REQUIRED_INTENTS: InquiryIntent[] = ["price", "warranty", "complaint"];

export const inquiryInputSchema = z.object({
  inquiryId: z.string(),
  message: z.string().min(1), // 買家提問
  customerHandle: z.string().nullable(),
  channel: z.enum(["web", "facebook", "line"]),
  // 該商品的結構化事實（回覆只能根據這些，不得杜撰）
  productCard: z.object({
    title: z.string().nullable(),
    price: z.string(), // 已格式化，如 "NT$45,000"
    condition: z.string(),
    status: z.string(), // published / reviewing…
    attributes: z.array(z.object({ key: z.string(), value: z.string() })),
    description: z.string().nullable(),
  }),
});
export type InquiryInput = z.infer<typeof inquiryInputSchema>;

export const inquiryReplySchema = z.object({
  inquiryId: z.string(),
  intent: z.enum(INQUIRY_INTENT),
  reply: z.string().min(1), // 草擬回覆（正體中文、有禮、只根據商品卡事實）
  confidence: z.number().min(0).max(1),
  /** 是否需要人工審核才能送出。Agent 自評 + guardrail 再強制。 */
  requiresHumanReview: z.boolean(),
  /** 需要人審或無法回答時，給客服的內部提示。 */
  handoffNote: z.string().nullable(),
});
export type InquiryReply = z.infer<typeof inquiryReplySchema>;
