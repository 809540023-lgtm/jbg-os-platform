import type { AgentCode, AgentRunStatus } from "@jbg/db";
import type { ModelMessage } from "@jbg/harness";
import type { z } from "zod";
import type { AgentRunId, LoopStepId } from "../shared/id";

/**
 * Agent 定義 —— docs/07 統一契約。每個 canonical Agent（§0.6）填一份。
 * I=input 型別，O=output 型別（由 outputSchema 驗證）。
 */
export interface AgentDef<I = unknown, O = unknown> {
  code: AgentCode;
  version: number;
  /** 一律 MODELS.*（§0.3）。 */
  model: string;
  system: string;
  buildMessages: (input: I) => ModelMessage[];
  outputSchema: z.ZodType<O>;
  /** 需要進 Human Review 的判斷（如低信心 / 高價）。 */
  requiresHumanReview?: (output: O, input: I) => boolean;
  maxRetries?: number;
}

/** 一次 Agent 執行的記錄（agent_runs） —— 可回放（守則7）。 */
export interface AgentRun {
  id: AgentRunId;
  agentCode: AgentCode;
  loopStepId?: LoopStepId;
  status: AgentRunStatus;
  input: unknown;
  output?: unknown;
  contextSnapshotId?: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  pricingMissing: boolean;
  attempts: number;
  error?: string;
  startedAt: string;
  finishedAt?: string;
}

/** 實際餵入模型的 context 快照（context_snapshots，可回放）。 */
export interface ContextSnapshot {
  id: string;
  agentRunId: AgentRunId;
  model: string;
  system?: string;
  messages: ModelMessage[];
  createdAt: string;
}
