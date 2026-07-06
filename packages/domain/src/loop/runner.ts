import { newId } from "../shared/id";
import type { LoopExecutionId, LoopStepId } from "../shared/id";
import { loopExecutionMachine } from "./state";
import type { LoopRepos } from "./repo";
import type { LoopDef, LoopExecution, LoopStepDef, LoopStepRecord } from "./types";

/** 執行單一 step 的結果。 */
export interface StepResult {
  output?: unknown;
}

/**
 * StepExecutor —— 把 step 分派到對應的執行器（agent/skill/connector）。
 * M0 由呼叫端注入；Todo 2+ 會接上 AgentRunner / skills / connectors。
 * human / branch 型由 runner 自行處理，不會呼叫 executor。
 */
export type StepExecutor = (args: {
  step: LoopStepDef;
  input: unknown;
  execution: LoopExecution;
}) => Promise<StepResult>;

export interface LoopRunnerDeps {
  repos: LoopRepos;
  executeStep: StepExecutor;
  now?: () => string;
  sleep?: (ms: number) => Promise<void>;
  newExecutionId?: () => LoopExecutionId;
  newStepId?: () => LoopStepId;
}

/**
 * LoopRunner —— docs/08。跑一次 LoopExecution 的狀態機：
 * queued → running →（遇 human/requiresHumanReview 則）waiting_human，其餘 → succeeded/failed。
 * 每一步寫 loop_steps（可回放，守則7）。狀態只走 §0.11 合法邊。
 */
export class LoopRunner {
  private readonly repos: LoopRepos;
  private readonly executeStep: StepExecutor;
  private readonly now: () => string;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly newExecutionId: () => LoopExecutionId;
  private readonly newStepId: () => LoopStepId;

  constructor(deps: LoopRunnerDeps) {
    this.repos = deps.repos;
    this.executeStep = deps.executeStep;
    this.now = deps.now ?? (() => new Date().toISOString());
    this.sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.newExecutionId = deps.newExecutionId ?? (() => newId<"LoopExecution">());
    this.newStepId = deps.newStepId ?? (() => newId<"LoopStep">());
  }

  /** 觸發一次執行（含冪等檢查）。回傳終態或 waiting_human 的 LX。 */
  async run(loop: LoopDef, input: unknown): Promise<LoopExecution> {
    if (loop.idempotencyKey) {
      const key = loop.idempotencyKey(input);
      const existing = await this.repos.executions.findByIdempotencyKey(loop.id, key);
      if (existing) return existing;
    }

    const ts = this.now();
    const execution: LoopExecution = {
      id: this.newExecutionId(),
      loopId: loop.id as LoopExecution["loopId"],
      status: "queued",
      input,
      context: {},
      cursor: 0,
      idempotencyKey: loop.idempotencyKey?.(input),
      createdAt: ts,
      updatedAt: ts,
    };
    await this.repos.executions.create(execution);

    this.transition(execution, "running");
    await this.repos.executions.update(execution);

    return this.drive(loop, execution);
  }

  /** 人審通過後續跑（waiting_human → running → …）。 */
  async resume(loop: LoopDef, executionId: LoopExecutionId): Promise<LoopExecution> {
    const execution = await this.repos.executions.get(executionId);
    if (!execution) throw new Error(`LoopExecution not found: ${executionId}`);
    if (execution.status !== "waiting_human") {
      throw new Error(`resume 只適用 waiting_human，當前為 ${execution.status}`);
    }
    // 略過剛通過人審的那一步。
    execution.cursor += 1;
    this.transition(execution, "running");
    await this.repos.executions.update(execution);
    return this.drive(loop, execution);
  }

  /** 從 cursor 開始逐步推進。 */
  private async drive(loop: LoopDef, execution: LoopExecution): Promise<LoopExecution> {
    for (let i = execution.cursor; i < loop.steps.length; i += 1) {
      const step = loop.steps[i]!;
      execution.cursor = i;

      // human / requiresHumanReview → 暫停等人審。
      if (step.type === "human" || step.requiresHumanReview) {
        await this.recordStep(execution, step, "skipped", undefined, undefined);
        this.transition(execution, "waiting_human");
        await this.repos.executions.update(execution);
        return execution;
      }

      if (step.type === "branch") {
        // branch 由定義決定下一步；M0 直接記錄並續行（實際跳轉留給 Todo 後續）。
        await this.recordStep(execution, step, "succeeded", undefined, {});
        continue;
      }

      const result = await this.runStepWithRetry(loop, execution, step);
      if (!result.ok) {
        if (step.failLoopOnError === false) continue;
        execution.error = result.error;
        this.transition(execution, "failed");
        await this.repos.executions.update(execution);
        return execution;
      }
      execution.context[step.id] = result.value.output ?? null;
    }

    this.transition(execution, "succeeded");
    await this.repos.executions.update(execution);
    return execution;
  }

  private async runStepWithRetry(
    _loop: LoopDef,
    execution: LoopExecution,
    step: LoopStepDef,
  ): Promise<{ ok: true; value: StepResult } | { ok: false; error: string }> {
    const maxAttempts = step.retry?.maxAttempts ?? 1;
    const backoffMs = step.retry?.backoffMs ?? 0;
    const input = step.input ? step.input(execution.context) : execution.input;

    let lastError = "unknown error";
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const record = await this.recordStep(execution, step, "running", input, undefined, attempt);
      try {
        const result = await this.executeStep({ step, input, execution });
        await this.finishStep(execution, record, "succeeded", result.output);
        return { ok: true, value: result };
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
        await this.finishStep(execution, record, "failed", undefined, lastError);
        if (attempt < maxAttempts && backoffMs > 0) {
          await this.sleep(backoffMs * 2 ** (attempt - 1));
        }
      }
    }
    return { ok: false, error: lastError };
  }

  private transition(execution: LoopExecution, to: LoopExecution["status"]): void {
    loopExecutionMachine.assertTransition(execution.status, to);
    execution.status = to;
    execution.updatedAt = this.now();
  }

  private async recordStep(
    execution: LoopExecution,
    step: LoopStepDef,
    status: LoopStepRecord["status"],
    input?: unknown,
    output?: unknown,
    attempt = 1,
  ): Promise<LoopStepRecord> {
    const record: LoopStepRecord = {
      id: this.newStepId(),
      loopExecutionId: execution.id,
      stepDefId: step.id,
      type: step.type,
      ref: step.ref,
      status,
      attempt,
      input,
      output,
      startedAt: this.now(),
    };
    await this.repos.steps.append(record);
    return record;
  }

  private async finishStep(
    _execution: LoopExecution,
    record: LoopStepRecord,
    status: LoopStepRecord["status"],
    output?: unknown,
    error?: string,
  ): Promise<void> {
    record.status = status;
    record.output = output;
    record.error = error;
    record.finishedAt = this.now();
    await this.repos.steps.update(record);
  }
}
