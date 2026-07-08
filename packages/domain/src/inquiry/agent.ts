import { MODELS } from "@jbg/harness";
import type { AgentDef } from "../agent/types";
import {
  HUMAN_REQUIRED_INTENTS,
  inquiryInputSchema,
  inquiryReplySchema,
  type InquiryInput,
  type InquiryReply,
} from "./schema";

/** 客服自動回覆信心門檻：低於此值一律轉人審。 */
export const INQUIRY_CONFIDENCE_FLOOR = 0.7;

/**
 * Inquiry Agent (`inquiry`) —— canonical §0.6 v1.1。讀商品卡＋買家詢問草擬回覆。
 * 只根據商品卡事實回答，不杜撰。議價/保固承諾/客訴 → 強制人審（守則#4）。
 * 送出動作本身不在此：這裡只產「草稿＋是否可自動送」的主張。
 */
export const inquiryAgent: AgentDef<InquiryInput, InquiryReply> = {
  code: "inquiry",
  version: 1,
  model: MODELS.FAST,
  system: [
    "你是餐飲二手設備平台的客服，用正體中文、有禮、精簡回覆買家對某商品的提問。",
    "- 只能根據提供的商品卡事實回答（規格、價格、成色、地區、可驗收項）；不得杜撰型號、測試結果或庫存。",
    "- 商品卡沒有的資訊，誠實說會幫忙查詢，並把 requiresHumanReview 設 true。",
    "- intent 分類：spec/availability/location 屬低風險，可自動回；price（議價）、warranty（保固/到府/安裝承諾）、complaint（客訴）屬高風險。",
    "- 高風險意圖（議價/承諾/客訴）：requiresHumanReview 必為 true，reply 寫成禮貌的『我請專人為您處理』並在 handoffNote 給客服重點。",
    "- 平台賣點可提：結構化驗機、款項代管、可到府安裝、附驗收——但不得對個案做超出商品卡的保證。",
    "- confidence 反映你對『這則回覆正確且可直接送出』的把握。",
    "輸出：嚴格符合 InquiryReply JSON schema。",
  ].join("\n"),
  buildMessages: (input) => [
    {
      role: "user",
      content: [
        `商品卡: ${JSON.stringify(input.productCard)}`,
        `管道: ${input.channel}`,
        `買家提問: ${input.message}`,
        "請回傳 InquiryReply JSON。",
      ].join("\n"),
    },
  ],
  outputSchema: inquiryReplySchema,
  // Guardrail（守則#4）：Agent 自評、低信心、或高風險意圖，任一成立即需人審。
  requiresHumanReview: (out) =>
    out.requiresHumanReview ||
    out.confidence < INQUIRY_CONFIDENCE_FLOOR ||
    HUMAN_REQUIRED_INTENTS.includes(out.intent),
  maxRetries: 2,
};

export { inquiryInputSchema, inquiryReplySchema };
