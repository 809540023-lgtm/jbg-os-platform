import type { AgentRunner } from "../agent/runner";
import { ocrAgent } from "../agent/agents/ocr";
import { visionAgent } from "../agent/agents/vision";
import type { OCRInput, OCRResult, VisionInput, VisionResult } from "./schema";

/**
 * perceive —— docs/07 §7.3 + docs/08 `perceive` 階段：ocr ‖ vision 並行。
 * 部分成功語意（§docs/08）：任一 Agent 失敗不拖垮另一；各自回報成功/錯誤，
 * 由後續 assemble 決定是否足以組卡、或開補件 Task。
 */
export interface PerceiveInput {
  ocr: OCRInput;
  vision: VisionInput;
}

export interface PerceiveResult {
  ocr?: OCRResult;
  vision?: VisionResult;
  ocrError?: string;
  visionError?: string;
  /** vision 自評需升級（低信心/品牌用猜）。 */
  visionNeedsReview: boolean;
}

export async function perceive(
  runner: AgentRunner,
  input: PerceiveInput,
): Promise<PerceiveResult> {
  const [ocrOutcome, visionOutcome] = await Promise.allSettled([
    runner.run(ocrAgent, input.ocr),
    runner.run(visionAgent, input.vision),
  ]);

  const result: PerceiveResult = { visionNeedsReview: false };

  if (ocrOutcome.status === "fulfilled") result.ocr = ocrOutcome.value.output;
  else result.ocrError = String(ocrOutcome.reason?.message ?? ocrOutcome.reason);

  if (visionOutcome.status === "fulfilled") {
    result.vision = visionOutcome.value.output;
    result.visionNeedsReview = visionOutcome.value.requiresHumanReview;
  } else {
    result.visionError = String(visionOutcome.reason?.message ?? visionOutcome.reason);
  }

  return result;
}
