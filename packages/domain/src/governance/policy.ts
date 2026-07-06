import type { Money } from "../shared/money";
import type { Actor } from "./actor";

/**
 * PolicyEngine —— docs/00 §0.9 第二道防線（動作級授權；第一道是 RLS）。
 * 原則：AI 可「提議」任何事，但有外部副作用或不可逆的動作預設需 Permission 或 Human Review。
 */

/** Canonical action 代號（副作用類動作）。 */
export const ACTIONS = {
  PUBLISH: "listing.publish",
  PRICE_APPLY: "price.apply",
  REPLY_CUSTOMER: "inquiry.reply",
  DELETE: "resource.delete",
  MEMORY_WRITE: "memory.write",
} as const;
export type Action = string;

export type PolicyEffect = "allow" | "deny" | "require_human";

export interface PolicyRequest {
  actor: Actor;
  action: Action;
  resource: { kind: string; id?: string };
  /** 動作相關的判斷資料（金額、信心分數…）。 */
  context?: { amount?: Money; confidence?: number; [k: string]: unknown };
}

export interface PolicyDecision {
  effect: PolicyEffect;
  reason: string;
  /** 命中的 rule id（稽核用）。 */
  ruleId?: string;
}

export interface PolicyRule {
  id: string;
  when: (req: PolicyRequest) => boolean;
  effect: PolicyEffect;
  reason: string;
}

export interface PolicyEngineConfig {
  rules: PolicyRule[];
  /** 未命中任何 rule 時的預設（deny-first）。 */
  defaultEffect?: PolicyEffect;
  /** 高價門檻：price.apply 超過此金額需人審。 */
  priceHumanReviewThreshold?: Money;
}

export class PolicyEngine {
  private readonly rules: PolicyRule[];
  private readonly defaultEffect: PolicyEffect;

  constructor(config: PolicyEngineConfig) {
    this.rules = config.rules;
    this.defaultEffect = config.defaultEffect ?? "deny";
  }

  decide(req: PolicyRequest): PolicyDecision {
    for (const rule of this.rules) {
      if (rule.when(req)) {
        return { effect: rule.effect, reason: rule.reason, ruleId: rule.id };
      }
    }
    return {
      effect: this.defaultEffect,
      reason: `未命中任何規則，套用預設 ${this.defaultEffect}（deny-first）`,
    };
  }
}

/**
 * MVP 預設規則集（對應 docs/12 Todo3 + seed/policies.sql）：
 * - human actor：交給 RLS 管資料層，動作層一律 allow。
 * - 讀取類（.read / .list）：allow。
 * - publish：一律 require_human。
 * - price.apply 超門檻：require_human。
 * - 其餘 agent 副作用：default deny。
 */
export function defaultMvpRules(opts?: { priceThreshold?: Money }): PolicyRule[] {
  const threshold = opts?.priceThreshold;
  return [
    {
      id: "human-actor-allow",
      when: (r) => r.actor.kind === "human",
      effect: "allow",
      reason: "human actor 由 RLS 管制資料層，動作層放行",
    },
    {
      id: "read-actions-allow",
      when: (r) => /\.(read|list|get)$/.test(r.action),
      effect: "allow",
      reason: "唯讀動作放行",
    },
    {
      id: "publish-requires-human",
      when: (r) => r.action === ACTIONS.PUBLISH,
      effect: "require_human",
      reason: "發佈至 FB 為不可逆外部副作用，一律人審（§0.9）",
    },
    {
      id: "price-apply-threshold",
      when: (r) =>
        r.action === ACTIONS.PRICE_APPLY &&
        threshold !== undefined &&
        r.context?.amount !== undefined &&
        r.context.amount.currency === threshold.currency &&
        r.context.amount.amount > threshold.amount,
      effect: "require_human",
      reason: "定價超過高價門檻，需人審",
    },
  ];
}
