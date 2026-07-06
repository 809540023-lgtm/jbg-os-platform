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
    "你是二手精品的社群文案，寫給 Facebook 買家。",
    "- 依商品卡 + 定價寫 title / body / sellingPoints / hashtags。",
    "- 每條賣點都要能對應商品卡事實，不得杜撰來源或功能。",
    "- 命中疑慮/合規禁詞要放進 complianceFlags（理想為空）。",
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
