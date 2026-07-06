import type { LoopExecutionId } from "../shared/id";
import type { LoopExecution, LoopStepRecord } from "./types";

/**
 * Repository 介面 —— domain 只依賴介面，實作在 db/app 層（Supabase）或測試的 in-memory。
 * 這讓 LoopRunner 可在無 DB 下被單元測試（docs/12 Todo1 Eval）。
 */
export interface LoopExecutionRepo {
  create(execution: LoopExecution): Promise<void>;
  update(execution: LoopExecution): Promise<void>;
  get(id: LoopExecutionId): Promise<LoopExecution | null>;
  /** 冪等：以 (loopId, idempotencyKey) 查既有 LX。 */
  findByIdempotencyKey(loopId: string, key: string): Promise<LoopExecution | null>;
}

export interface LoopStepRepo {
  append(step: LoopStepRecord): Promise<void>;
  update(step: LoopStepRecord): Promise<void>;
  listByExecution(id: LoopExecutionId): Promise<LoopStepRecord[]>;
}

export interface LoopRepos {
  executions: LoopExecutionRepo;
  steps: LoopStepRepo;
}
