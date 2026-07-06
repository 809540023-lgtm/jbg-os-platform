import type { LoopExecutionStatus, LoopStepKind, LoopStepStatus } from "@jbg/db";
import type { LoopExecutionId, LoopId, LoopStepId } from "../shared/id";

/**
 * Loop DSL 的 step 型別（docs/08）= DB loop_step_kind 超集，額外含控制流 `branch`。
 * 持久化時 `branch` 記為 DB 的 `system`（見 docs/RECONCILIATION.md）。
 */
export type StepType = LoopStepKind | "branch";
export type StepStatus = LoopStepStatus;

/**
 * Loop DSL —— docs/08。一個 Loop 的「定義」(steps 圖 + 觸發 + 終止)。
 * LoopExecution 是它的一次執行實例（帶狀態機）。
 */

export type LoopTrigger =
  | { kind: "manual" }
  | { kind: "cron"; expression: string }
  | { kind: "webhook"; source: string }
  | { kind: "event"; eventType: string };

export interface RetryPolicy {
  maxAttempts: number;
  /** 退避基數（ms），第 n 次等待 backoffMs * 2^(n-1）。 */
  backoffMs: number;
}

/** 一步的定義。input mapping 用前面 step 的輸出組出本步輸入。 */
export interface LoopStepDef<Ctx = Record<string, unknown>> {
  id: string;
  type: StepType;
  /** agent 代號 / skill id / connector id；branch/human 可省略。 */
  ref?: string;
  /** 由累積 context 算出本步輸入。 */
  input?: (ctx: Ctx) => unknown;
  /** branch step：回傳下一個 step id（null = 結束）。 */
  branch?: (ctx: Ctx) => string | null;
  requiresHumanReview?: boolean;
  retry?: RetryPolicy;
  /** 失敗時是否讓整條 LX 失敗（預設 true）。false = 記錄後續跑。 */
  failLoopOnError?: boolean;
}

export interface LoopDef<Ctx = Record<string, unknown>> {
  /** kebab-case，如 "drive-ingest"、"product-lifecycle"。 */
  id: string;
  version: number;
  trigger: LoopTrigger;
  steps: LoopStepDef<Ctx>[];
  /** 冪等鍵：同鍵不重複建立 LX（docs/08 冪等三閘之一）。 */
  idempotencyKey?: (input: unknown) => string;
}

export interface LoopExecution {
  id: LoopExecutionId;
  loopId: LoopId;
  status: LoopExecutionStatus;
  input: unknown;
  /** 累積的步驟輸出（stepId → output），供後續步驟 input mapping 使用。 */
  context: Record<string, unknown>;
  /** 下一個要執行的 step index（供 waiting_human 後 resume）。 */
  cursor: number;
  idempotencyKey?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LoopStepRecord {
  id: LoopStepId;
  loopExecutionId: LoopExecutionId;
  stepDefId: string;
  type: StepType;
  ref?: string;
  status: StepStatus;
  attempt: number;
  input: unknown;
  output?: unknown;
  error?: string;
  startedAt?: string;
  finishedAt?: string;
}
