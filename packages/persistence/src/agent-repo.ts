import type {
  AgentRun,
  AgentRunRepo,
  ContextSnapshot,
  ContextSnapshotRepo,
} from "@jbg/domain";
import type { AgentRunStatus } from "@jbg/db";
import type { SupabaseClient } from "./client";

/**
 * agent_runs / context_snapshots 的 Supabase 實作（守則7：每次 AI 呼叫可回放）。
 *
 * 注意：
 * - agent_runs.agent_id 是 uuid FK → 以 agent code 解析（agents 表已 seed）。
 * - cost：domain 的 costUsd 為浮點 USD；token 成本常 < 1 分，若存「分」會歸零。
 *   故 cost_amount 存 **micro-USD**（costUsd × 1e6，四捨五入），cost_currency='USD'。
 * - context_snapshots.agent_run_id FK → agent_runs：AgentRunner 已改成先建 run 再建 snapshot。
 */

const MICRO = 1_000_000;

interface AgentRunRow {
  id: string;
  status: AgentRunStatus;
  input: unknown;
  output: unknown;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_amount: number | null;
  error: string | null;
  loop_step_id: string | null;
  started_at: string;
  finished_at: string | null;
  agents?: { code: string } | null;
}

export class SupabaseAgentRunRepo implements AgentRunRepo {
  private readonly agentUuidByCode = new Map<string, string>();
  constructor(private readonly db: SupabaseClient) {}

  private async resolveAgentUuid(code: string): Promise<string> {
    const cached = this.agentUuidByCode.get(code);
    if (cached) return cached;
    const { data, error } = await this.db
      .from("agents")
      .select("id")
      .eq("code", code)
      .single<{ id: string }>();
    if (error || !data) throw new Error(`agent 未找到 (code=${code}): ${error?.message}`);
    this.agentUuidByCode.set(code, data.id);
    return data.id;
  }

  async create(run: AgentRun): Promise<void> {
    const agentId = await this.resolveAgentUuid(run.agentCode);
    const { error } = await this.db.from("agent_runs").insert({
      id: run.id,
      agent_id: agentId,
      loop_step_id: run.loopStepId ?? null,
      status: run.status,
      input: run.input ?? {},
      output: run.output ?? null,
      input_tokens: run.inputTokens,
      output_tokens: run.outputTokens,
      cost_amount: Math.round(run.costUsd * MICRO),
      cost_currency: "USD",
      error: run.error ?? null,
      started_at: run.startedAt,
      finished_at: run.finishedAt ?? null,
    });
    if (error) throw new Error(`create agent_run: ${error.message}`);
  }

  async update(run: AgentRun): Promise<void> {
    const { error } = await this.db
      .from("agent_runs")
      .update({
        status: run.status,
        output: run.output ?? null,
        input_tokens: run.inputTokens,
        output_tokens: run.outputTokens,
        cost_amount: Math.round(run.costUsd * MICRO),
        error: run.error ?? null,
        finished_at: run.finishedAt ?? null,
      })
      .eq("id", run.id);
    if (error) throw new Error(`update agent_run: ${error.message}`);
  }
}

export class SupabaseContextSnapshotRepo implements ContextSnapshotRepo {
  constructor(private readonly db: SupabaseClient) {}

  async create(snapshot: ContextSnapshot): Promise<void> {
    const { error } = await this.db.from("context_snapshots").insert({
      id: snapshot.id,
      agent_run_id: snapshot.agentRunId,
      content: {
        model: snapshot.model,
        system: snapshot.system,
        messages: snapshot.messages,
      },
    });
    if (error) throw new Error(`create context_snapshot: ${error.message}`);
  }
}

/** 便利工廠：組出可餵給 AgentRunner 的 Supabase repos。 */
export function createSupabaseAgentRepos(db: SupabaseClient) {
  return {
    runs: new SupabaseAgentRunRepo(db),
    snapshots: new SupabaseContextSnapshotRepo(db),
  };
}

export type { AgentRunRow };
