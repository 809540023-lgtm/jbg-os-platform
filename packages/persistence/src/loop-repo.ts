import type {
  LoopExecution,
  LoopExecutionId,
  LoopExecutionRepo,
  LoopStepRecord,
  LoopStepRepo,
  StepType,
} from "@jbg/domain";
import type { SupabaseClient } from "./client";

const TERMINAL = new Set(["succeeded", "failed", "cancelled"]);

interface ExecRow {
  id: string;
  loop_id: string;
  status: LoopExecution["status"];
  input: unknown;
  context: Record<string, unknown> | null;
  cursor: number | null;
  idempotency_key: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
  loops?: { slug: string } | null;
}

interface StepRow {
  id: string;
  loop_execution_id: string;
  step_index: number;
  name: string;
  kind: StepType;
  ref: string | null;
  status: LoopStepRecord["status"];
  attempt: number;
  input: unknown;
  output: unknown;
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
}

/** loop_executions repo（domain LoopExecutionRepo 的 Supabase 實作）。 */
export class SupabaseLoopExecutionRepo implements LoopExecutionRepo {
  private readonly loopUuidBySlug = new Map<string, string>();

  constructor(private readonly db: SupabaseClient) {}

  private async resolveLoopUuid(slug: string): Promise<string> {
    const cached = this.loopUuidBySlug.get(slug);
    if (cached) return cached;
    const { data, error } = await this.db
      .from("loops")
      .select("id")
      .eq("slug", slug)
      .single<{ id: string }>();
    if (error || !data) throw new Error(`loop 未找到 (slug=${slug}): ${error?.message}`);
    this.loopUuidBySlug.set(slug, data.id);
    return data.id;
  }

  async create(execution: LoopExecution): Promise<void> {
    const loopUuid = await this.resolveLoopUuid(execution.loopId);
    const { error } = await this.db.from("loop_executions").insert({
      id: execution.id,
      loop_id: loopUuid,
      status: execution.status,
      input: execution.input ?? {},
      context: execution.context,
      cursor: execution.cursor,
      idempotency_key: execution.idempotencyKey ?? null,
      error: execution.error ?? null,
      started_at: execution.status === "running" ? execution.updatedAt : null,
      created_at: execution.createdAt,
      updated_at: execution.updatedAt,
    });
    if (error) throw new Error(`create loop_execution: ${error.message}`);
  }

  async update(execution: LoopExecution): Promise<void> {
    const { error } = await this.db
      .from("loop_executions")
      .update({
        status: execution.status,
        context: execution.context,
        cursor: execution.cursor,
        error: execution.error ?? null,
        updated_at: execution.updatedAt,
        finished_at: TERMINAL.has(execution.status) ? execution.updatedAt : null,
      })
      .eq("id", execution.id);
    if (error) throw new Error(`update loop_execution: ${error.message}`);
  }

  async get(id: LoopExecutionId): Promise<LoopExecution | null> {
    const { data, error } = await this.db
      .from("loop_executions")
      .select("*, loops(slug)")
      .eq("id", id)
      .maybeSingle<ExecRow>();
    if (error) throw new Error(`get loop_execution: ${error.message}`);
    return data ? toExecDomain(data) : null;
  }

  async findByIdempotencyKey(loopId: string, key: string): Promise<LoopExecution | null> {
    const loopUuid = await this.resolveLoopUuid(loopId);
    const { data, error } = await this.db
      .from("loop_executions")
      .select("*, loops(slug)")
      .eq("loop_id", loopUuid)
      .eq("idempotency_key", key)
      .maybeSingle<ExecRow>();
    if (error) throw new Error(`findByIdempotencyKey: ${error.message}`);
    return data ? toExecDomain(data) : null;
  }
}

/** loop_steps repo（domain LoopStepRepo 的 Supabase 實作）。 */
export class SupabaseLoopStepRepo implements LoopStepRepo {
  constructor(private readonly db: SupabaseClient) {}

  async append(step: LoopStepRecord): Promise<void> {
    const { count } = await this.db
      .from("loop_steps")
      .select("*", { count: "exact", head: true })
      .eq("loop_execution_id", step.loopExecutionId);
    const { error } = await this.db.from("loop_steps").insert({
      id: step.id,
      loop_execution_id: step.loopExecutionId,
      step_index: count ?? 0,
      name: step.stepDefId,
      kind: step.type,
      ref: step.ref ?? null,
      status: step.status,
      attempt: step.attempt,
      input: step.input ?? {},
      output: step.output ?? null,
      error: step.error ?? null,
      started_at: step.startedAt ?? null,
      finished_at: step.finishedAt ?? null,
    });
    if (error) throw new Error(`append loop_step: ${error.message}`);
  }

  async update(step: LoopStepRecord): Promise<void> {
    const { error } = await this.db
      .from("loop_steps")
      .update({
        status: step.status,
        output: step.output ?? null,
        error: step.error ?? null,
        finished_at: step.finishedAt ?? null,
      })
      .eq("id", step.id);
    if (error) throw new Error(`update loop_step: ${error.message}`);
  }

  async listByExecution(id: LoopExecutionId): Promise<LoopStepRecord[]> {
    const { data, error } = await this.db
      .from("loop_steps")
      .select("*")
      .eq("loop_execution_id", id)
      .order("step_index", { ascending: true });
    if (error) throw new Error(`listByExecution: ${error.message}`);
    return ((data ?? []) as StepRow[]).map(toStepDomain);
  }
}

function toExecDomain(row: ExecRow): LoopExecution {
  return {
    id: row.id as LoopExecutionId,
    loopId: (row.loops?.slug ?? row.loop_id) as LoopExecution["loopId"],
    status: row.status,
    input: row.input,
    context: row.context ?? {},
    cursor: row.cursor ?? 0,
    idempotencyKey: row.idempotency_key ?? undefined,
    error: row.error ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toStepDomain(row: StepRow): LoopStepRecord {
  return {
    id: row.id as LoopStepRecord["id"],
    loopExecutionId: row.loop_execution_id as LoopExecutionId,
    stepDefId: row.name,
    type: row.kind,
    ref: row.ref ?? undefined,
    status: row.status,
    attempt: row.attempt,
    input: row.input,
    output: row.output ?? undefined,
    error: row.error ?? undefined,
    startedAt: row.started_at ?? undefined,
    finishedAt: row.finished_at ?? undefined,
  };
}
