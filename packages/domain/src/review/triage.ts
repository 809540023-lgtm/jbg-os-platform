/**
 * 人審佇列智能分流 —— 規劃書 §5.2：人審佇列是規模化真正的瓶頸。
 * 高信心、低風險的項目建議自動放行，人力集中在需要判斷的品項。
 * 純函式、無副作用；實際「自動放行」仍是一個明確動作（守則#4/#9），由 UI/Policy 執行。
 */

/** 高信心門檻：達標且低風險才建議自動放行。 */
export const TRIAGE_CONFIDENCE_FLOOR = 0.85;
/** 金額上限：超過此金額（TWD）一律人工判斷（高價風險）。 */
export const TRIAGE_AUTO_PASS_MAX_AMOUNT = 30000;

export interface TriageInput {
  targetKind: string; // price_suggestion | listing | ...
  confidence: number | null;
  amount: number | null; // TWD
}

export type TriageRecommendation = "auto_pass" | "needs_human";

export interface TriageResult {
  recommendation: TriageRecommendation;
  reasons: string[];
}

export function triageReview(input: TriageInput): TriageResult {
  const reasons: string[] = [];

  // 首次上架文案 = 合規風險，一律人工（規劃書：marketing 首次上架需 HR）。
  if (input.targetKind === "listing") {
    return { recommendation: "needs_human", reasons: ["首次上架文案需合規把關"] };
  }

  if (input.targetKind === "price_suggestion") {
    if (input.confidence == null) {
      return { recommendation: "needs_human", reasons: ["無信心資料，保守人工判斷"] };
    }
    if (input.confidence < TRIAGE_CONFIDENCE_FLOOR) {
      reasons.push(`估價信心 ${Math.round(input.confidence * 100)}% < ${TRIAGE_CONFIDENCE_FLOOR * 100}% 門檻`);
    }
    if (input.amount != null && input.amount > TRIAGE_AUTO_PASS_MAX_AMOUNT) {
      reasons.push(`金額 NT$${input.amount.toLocaleString("zh-TW")} 超過自動放行上限，屬高價需人工`);
    }
    if (reasons.length === 0) {
      return {
        recommendation: "auto_pass",
        reasons: [
          `估價信心 ${Math.round(input.confidence * 100)}% ≥ 門檻`,
          input.amount != null ? `金額 NT$${input.amount.toLocaleString("zh-TW")} 在自動放行範圍內` : "低金額風險",
        ],
      };
    }
    return { recommendation: "needs_human", reasons };
  }

  // 其他類型預設人工。
  return { recommendation: "needs_human", reasons: ["此類型預設人工判斷"] };
}
