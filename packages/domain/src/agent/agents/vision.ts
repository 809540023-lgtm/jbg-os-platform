import { MODELS } from "@jbg/harness";
import {
  visionResultSchema,
  type VisionInput,
  type VisionResult,
} from "../../perception/schema";
import type { AgentDef } from "../types";

/** Vision 低信心升級門檻（docs/07 §7.3.1：overallConfidence < 0.6 或 brand isGuess → 升級）。 */
export const VISION_CONFIDENCE_FLOOR = 0.6;

/**
 * Vision Agent (`vision`) —— docs/07 §7.3.1。只描述照片中看得到的事實：
 * 品牌/品類/顏色/瑕疵/附件 + 各自信心。不猜品牌、不估價、不寫文案。
 */
export const visionAgent: AgentDef<VisionInput, VisionResult> = {
  code: "vision",
  version: 1,
  model: MODELS.VISION,
  system: [
    "你是二手精品的視覺鑑定師。只描述照片中「看得到」的事實。",
    "- 每個屬性給 0..1 confidence；看不清標 uncertain 並降低 confidence。",
    "- brand 只能從 knownBrands 選；若像但不在清單，isGuess=true。",
    "- defects 必須指出可見區域（area）。",
    "- 嚴禁：估價、寫文案、猜測看不到的資訊。",
    "輸出：嚴格符合 VisionResult JSON schema，不要多餘欄位。",
  ].join("\n"),
  buildMessages: (input) => {
    const text = [
      `knownBrands: ${JSON.stringify(input.knownBrands)}`,
      `knownCategories: ${JSON.stringify(input.knownCategories)}`,
      "請回傳 VisionResult JSON。",
    ].join("\n");
    // 真實 http(s) 圖片 → 送 image content block 讓 Claude 看得到；否則退回純文字（fake/本地）。
    const isUrl = /^https?:\/\//.test(input.imageUrl);
    return [
      {
        role: "user",
        content: isUrl
          ? [{ type: "image", source: { type: "url", url: input.imageUrl } }, { type: "text", text }]
          : `商品照片: ${input.imageUrl}\n${text}`,
      },
    ];
  },
  outputSchema: visionResultSchema,
  // 低信心或品牌用猜的 → 升級（開 Task 補件或 HR）。
  requiresHumanReview: (out) =>
    out.overallConfidence < VISION_CONFIDENCE_FLOOR || out.brand.isGuess,
  maxRetries: 2,
};
