import { MODELS } from "@jbg/harness";
import {
  priceSuggestionSchema,
  type PriceInput,
  type PriceSuggestion,
} from "../../pricing/schema";
import type { AgentDef } from "../types";

/** 低信心門檻（docs/07 §7.3.3：confidence < 0.6 → 需 HR）。 */
export const PRICE_CONFIDENCE_FLOOR = 0.6;

/**
 * Price Agent (`price`) —— docs/07 §7.3.3。只提議不套用：給建議售價/區間/理由/信心。
 * 高價（> 門檻）或低信心 → requiresHumanReview（§0.6、§0.9）。門檻由 PolicyEngine 於動作層再把關。
 */
export const priceAgent: AgentDef<PriceInput, PriceSuggestion> = {
  code: "price",
  version: 1,
  model: MODELS.REASONING,
  system: [
    "你是餐飲二手設備的定價分析師（製冰機、商用冰箱、洗碗機、爐具等）。輸出「建議」而非「決定」。",
    "- 綜合商品卡 + comparableSales 給 suggestedAmount 與 [minAmount,maxAmount]。",
    "- 定價心法：二手行情約為新品 4–6 折，依機齡、成色、品牌流通性（萬利多零件好找可上調）、",
    "  是否含保固/驗收調整；平台策略為「資訊最流通、價格最低」，同況下取區間中低段。",
    "- 金額用整數（TWD 元）。至少列 2 條 reasons（引用成色/品牌/機齡/市場行情）。",
    "- 不確定 → 放寬區間並降低 confidence。",
    "- confidence < 0.6 → requiresHumanReview=true。",
    "- 嚴禁：直接改價、發佈、寫文案。",
    "輸出：嚴格符合 PriceSuggestion JSON schema。",
  ].join("\n"),
  buildMessages: (input) => [
    {
      role: "user",
      content: [
        `商品卡: ${JSON.stringify(input.productCard)}`,
        `可比成交: ${JSON.stringify(input.comparableSales)}`,
        `幣別: ${input.currency}`,
        "請回傳 PriceSuggestion JSON。",
      ].join("\n"),
    },
  ],
  outputSchema: priceSuggestionSchema,
  requiresHumanReview: (out) =>
    out.requiresHumanReview || out.confidence < PRICE_CONFIDENCE_FLOOR,
  maxRetries: 2,
};
