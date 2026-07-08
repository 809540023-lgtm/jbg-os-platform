/**
 * Postgres enum 的 TS 鏡像 —— 對應 docs/00 §0.11 的權威狀態機。
 * 這是 status 值的 single source of truth：migration 的 CREATE TYPE 必須與此逐字一致。
 *
 * 用 `as const` 陣列 + derived union，讓值（runtime 可迭代）與型別（compile 期）同源。
 */

export const LOOP_EXECUTION_STATUS = [
  "queued",
  "running",
  "waiting_human",
  "succeeded",
  "failed",
  "cancelled",
] as const;
export type LoopExecutionStatus = (typeof LOOP_EXECUTION_STATUS)[number];

export const HUMAN_REVIEW_STATUS = [
  "pending",
  "approved",
  "rejected",
  "edited",
  "expired",
] as const;
export type HumanReviewStatus = (typeof HUMAN_REVIEW_STATUS)[number];

export const TASK_STATUS = [
  "open",
  "in_progress",
  "done",
  "blocked",
  "cancelled",
] as const;
export type TaskStatus = (typeof TASK_STATUS)[number];

export const LISTING_STATUS = [
  "draft",
  "in_review",
  "approved",
  "published",
  "sold",
  "archived",
] as const;
export type ListingStatus = (typeof LISTING_STATUS)[number];

export const AGENT_RUN_STATUS = [
  "queued",
  "running",
  "succeeded",
  "failed",
] as const;
export type AgentRunStatus = (typeof AGENT_RUN_STATUS)[number];

export const ACTOR_KIND = ["human", "agent", "system"] as const;
export type ActorKind = (typeof ACTOR_KIND)[number];

/** Canonical Agent 代號 —— docs/00 §0.6（v1.1 加入 inquiry 客服）。 */
export const AGENT_CODE = [
  "vision",
  "ocr",
  "price",
  "marketing",
  "reviewer",
  "publisher",
  "memory",
  "inquiry",
] as const;
export type AgentCode = (typeof AGENT_CODE)[number];

/** loop_step_kind —— 對齊 migration（含控制流 `branch`，見 R2 裁決）。 */
export const LOOP_STEP_KIND = [
  "agent",
  "skill",
  "connector",
  "human",
  "system",
  "branch",
] as const;
export type LoopStepKind = (typeof LOOP_STEP_KIND)[number];

/** policy_effect —— 對齊 migration（含 require_human，見 R3 裁決）。 */
export const POLICY_EFFECT = ["allow", "deny", "require_human"] as const;
export type PolicyEffectValue = (typeof POLICY_EFFECT)[number];

/** loop_step_status（loop_steps.status）—— 與 migration 逐字一致。 */
export const LOOP_STEP_STATUS = [
  "pending",
  "running",
  "succeeded",
  "failed",
  "skipped",
] as const;
export type LoopStepStatus = (typeof LOOP_STEP_STATUS)[number];

/**
 * product_status —— 對齊 migration（docs/06 落地值）。
 * 注意：docs/05 §5.12.2 曾述「Product 共用 listing_status」，與此 DB 真值不同；
 * 以 DB 為準，差異記於 docs/RECONCILIATION.md。
 */
export const PRODUCT_STATUS = [
  "ingested",
  "assembled",
  "gap",
  "priced",
  "composed",
  "reviewing",
  "published",
  "sold",
  "archived",
] as const;
export type ProductStatus = (typeof PRODUCT_STATUS)[number];

/** Memory 類型 —— docs/00 §0.5 Memory。 */
export const MEMORY_TYPE = [
  "fact",
  "preference",
  "feedback",
  "reference",
] as const;
export type MemoryType = (typeof MEMORY_TYPE)[number];

/** Connector 類型 —— docs/00 §0.8。 */
export const CONNECTOR_KIND = ["drive", "facebook", "line"] as const;
export type ConnectorKind = (typeof CONNECTOR_KIND)[number];
