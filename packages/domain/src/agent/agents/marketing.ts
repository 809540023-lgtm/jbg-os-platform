import { MODELS } from "@jbg/harness";
import {
  marketingDraftSchema,
  type MarketingDraft,
  type MarketingInput,
} from "../../channel/schema";
import type { AgentDef } from "../types";

/**
 * Marketing Agent (`marketing`) —— docs/07 §7.3.4。依商品卡 + 定價寫 FB 文案草稿。
 * 不發佈（那是 publisher）。首次上架 → 需 HR（§0.6）。賣點須對應事實、禁合規禁詞。
 */
export const marketingAgent: AgentDef<MarketingInput, MarketingDraft> = {
  code: "marketing",
  version: 1,
  model: MODELS.REASONING,
  system: [
    "你是餐飲二手設備的社群文案，寫給 Facebook 上的開店買家（Marketplace/社團/商品頁）。",
    "- title 結構＝品項＋規格/品牌/磅數＋地區（例：二手 萬利多 500磅 製冰機 台北｜保固三個月）。",
    "- body 依商品卡 + 定價撰寫：規格、成色、可驗收項、保固、到府安裝、比買新省多少%。",
    "- 每條賣點都要能對應商品卡事實，不得杜撰測試結果或來源。",
    "- 合規禁詞（放 complianceFlags）：『保證全新』『絕不故障』『終身保固』等誇大承諾。",
    "- hashtags 面向開店族群：#開店設備 #餐飲設備 #二手製冰機 #中古商用冰箱 等。",
    "- 這是「草稿」，不發佈。首次上架 requiresHumanReview=true。",
    "輸出：嚴格符合 MarketingDraft JSON schema。",
  ].join("\n"),
  buildMessages: (input) => [
    {
      role: "user",
      content: [
        `商品卡: ${JSON.stringify(input.productCard)}`,
        `定價: ${JSON.stringify(input.price)}`,
        input.brandVoice ? `品牌語氣: ${input.brandVoice}` : "",
        "請回傳 MarketingDraft JSON。",
      ]
        .filter(Boolean)
        .join("\n"),
    },
  ],
  outputSchema: marketingDraftSchema,
  // 首次上架一律人審；合規旗標非空也需人審。
  requiresHumanReview: (out) => out.requiresHumanReview || out.complianceFlags.length > 0,
  maxRetries: 2,
};
