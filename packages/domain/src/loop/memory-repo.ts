import type { LoopExecutionId } from "../shared/id";
import type { LoopExecutionRepo, LoopRepos, LoopStepRepo } from "./repo";
import type { LoopExecution, LoopStepRecord } from "./types";

/** In-memory repo —— 供單元測試與本地 dry-run；正式環境用 Supabase 實作。 */
export class InMemoryLoopExecutionRepo implements LoopExecutionRepo {
  private readonly store = new Map<string, LoopExecution>();

  async create(execution: LoopExecution): Promise<void> {
    this.store.set(execution.id, structuredClone(execution));
  }
  async update(execution: LoopExecution): Promise<void> {
    this.store.set(execution.id, structuredClone(execution));
  }
  async get(id: LoopExecutionId): Promise<LoopExecution | null> {
    const found = this.store.get(id);
    return found ? structuredClone(found) : null;
  }
  async findByIdempotencyKey(
    loopId: string,
    key: string,
  ): Promise<LoopExecution | null> {
    for (const ex of this.store.values()) {
      if (ex.loopId === loopId && ex.idempotencyKey === key) {
        return structuredClone(ex);
      }
    }
    return null;
  }
}

export class InMemoryLoopStepRepo implements LoopStepRepo {
  private readonly store = new Map<string, LoopStepRecord[]>();

  async append(step: LoopStepRecord): Promise<void> {
    const list = this.store.get(step.loopExecutionId) ?? [];
    list.push(structuredClone(step));
    this.store.set(step.loopExecutionId, list);
  }
  async update(step: LoopStepRecord): Promise<void> {
    const list = this.store.get(step.loopExecutionId) ?? [];
    const idx = list.findIndex((s) => s.id === step.id);
    if (idx >= 0) list[idx] = structuredClone(step);
    else list.push(structuredClone(step));
    this.store.set(step.loopExecutionId, list);
  }
  async listByExecution(id: LoopExecutionId): Promise<LoopStepRecord[]> {
    return structuredClone(this.store.get(id) ?? []);
  }
}

export function createInMemoryLoopRepos(): LoopRepos {
  return {
    executions: new InMemoryLoopExecutionRepo(),
    steps: new InMemoryLoopStepRepo(),
  };
}
