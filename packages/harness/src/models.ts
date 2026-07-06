/**
 * MODELS — 全專案唯一的模型 id 來源（canonical §0.3、CLAUDE.md 守則 5）。
 *
 * 規則：
 * - 任何 Agent / Skill / Harness 呼叫模型，一律引用 MODELS.REASONING / VISION / FAST，
 *   禁止在別處硬寫模型字串。
 * - 預設值可用 env（MODEL_REASONING / MODEL_VISION / MODEL_FAST）覆寫。
 * - 更新預設 id 前，請用 `claude-api` skill 確認當前最新、可用的模型 id 與定價，勿憑記憶。
 *
 * 下列 fallback 為撰寫本骨架時的當前 Claude 模型 id；上線前請覆核。
 */
export const MODELS = {
  /** 主推理 / Agent 決策（price, marketing, reviewer, memory 萃取）。 */
  REASONING: process.env.MODEL_REASONING ?? "claude-sonnet-5",
  /** 圖片理解（vision agent、含圖 OCR 輔助）。 */
  VISION: process.env.MODEL_VISION ?? "claude-sonnet-5",
  /** 便宜快速的小任務（分類、格式化、gap-check 判斷）。 */
  FAST: process.env.MODEL_FAST ?? "claude-haiku-4-5-20251001",
} as const;

export type ModelTier = keyof typeof MODELS;
