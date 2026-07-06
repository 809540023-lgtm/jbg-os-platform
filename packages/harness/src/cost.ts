import type { ModelUsage } from "./model-client";

/**
 * Token 成本記帳（§0.4 layer 3 / 守則7）。
 * 定價「不硬寫在邏輯裡」：由設定表注入，值請以 `claude-api` skill 查證當前定價。
 */
export interface ModelPricing {
  /** 每 1M input tokens 的 USD 價。 */
  inputPerMillionUsd: number;
  /** 每 1M output tokens 的 USD 價。 */
  outputPerMillionUsd: number;
}

export type PricingTable = Record<string, ModelPricing>;

export interface CostRecord {
  model: string;
  usage: ModelUsage;
  costUsd: number;
  /** 該 model 無定價設定時為 true（成本以 0 計，需補設定）。 */
  pricingMissing: boolean;
}

export function computeCost(
  model: string,
  usage: ModelUsage,
  pricing: PricingTable,
): CostRecord {
  const p = pricing[model];
  if (!p) {
    return { model, usage, costUsd: 0, pricingMissing: true };
  }
  const costUsd =
    (usage.inputTokens / 1_000_000) * p.inputPerMillionUsd +
    (usage.outputTokens / 1_000_000) * p.outputPerMillionUsd;
  return { model, usage, costUsd, pricingMissing: false };
}
