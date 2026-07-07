import { MODELS } from "@jbg/harness";
import {
  ocrResultSchema,
  type OCRInput,
  type OCRResult,
} from "../../perception/schema";
import type { AgentDef } from "../types";

/**
 * OCR Agent (`ocr`) —— docs/07 §7.3.2。逐字抽取吊牌/型號/序號/尺寸/成分，不腦補。
 * 低信心（序號/型號 confidence < 0.5）→ 由 assemble/gap-check 開補件 Task。
 * TODO(harness): ModelClient 目前為純文字；接上實圖需支援 image content block。
 */
export const ocrAgent: AgentDef<OCRInput, OCRResult> = {
  code: "ocr",
  version: 1,
  model: MODELS.FAST,
  system: [
    "你是 OCR 抽取器，處理餐飲設備的銘牌/標籤照片。只輸出照片上「實際印出」的文字，逐字抄寫。",
    "- 分類：model=型號、serial=序號、size=尺寸/產能（如 500LB、220V、六門）、material=材質。",
    "- 銘牌常見欄位：型號、序號、電壓、頻率、冷媒、產地、製造年月——優先抓這些。",
    "- 讀不出的欄位 = null，並讓 lowConfidence=true。",
    "- 嚴禁翻譯、補齊、推論沒印出來的資訊。",
    "輸出：嚴格符合 OCRResult JSON schema，不要多餘欄位或文字。",
  ].join("\n"),
  buildMessages: (input) => [
    {
      role: "user",
      content: [
        `照片: ${input.imageUrl}`,
        input.hint ? `hint: ${input.hint}` : "",
        "請回傳 OCRResult JSON。",
      ]
        .filter(Boolean)
        .join("\n"),
    },
  ],
  outputSchema: ocrResultSchema,
  requiresHumanReview: () => false,
  maxRetries: 2,
};
