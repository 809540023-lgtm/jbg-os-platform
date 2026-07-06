import { MODELS } from "@jbg/harness";
import {
  reviewResultSchema,
  type ReviewInput,
  type ReviewResult,
} from "../../review/schema";
import type { AgentDef } from "../types";

/**
 * Reviewer Agent (`reviewer`) —— docs/07 §7.3.5。上架前自動品管：
 * 逐項檢查完整性/合規/價格合理/照片充分 → pass | reject(+reworkStage) | escalate。
 * 它本身是自動審關卡，不需 HR；escalate 才轉人審。
 */
export const reviewerAgent: AgentDef<ReviewInput, ReviewResult> = {
  code: "reviewer",
  version: 1,
  model: MODELS.FAST,
  system: [
    "你是上架前品管。逐項檢查並決定 pass / reject / escalate。",
    "檢查項：完整性(必填欄) / 合規(禁詞) / 價格合理(落在區間) / 照片充分。",
    "- 每項給 status + reason。",
    "- 任一致命項 fail → decision=reject，並指出 reworkStage。",
    "- complianceFlags 非空一律不得 pass。",
    "- 有風險但需人判斷 → decision=escalate + escalateReason。",
    "輸出：嚴格符合 ReviewResult JSON schema。",
  ].join("\n"),
  buildMessages: (input) => [
    {
      role: "user",
      content: [
        `商品卡: ${JSON.stringify(input.card)}`,
        `文案: ${JSON.stringify(input.marketing)}`,
        `定價: ${JSON.stringify(input.price)}`,
        "請回傳 ReviewResult JSON。",
      ].join("\n"),
    },
  ],
  outputSchema: reviewResultSchema,
  // 自動審關卡本身不觸發 HR（escalate 由後續流程轉 HR）。
  requiresHumanReview: () => false,
  maxRetries: 2,
};
