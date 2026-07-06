import {
  type ModelClient,
  type PricingTable,
  runModel,
} from "@jbg/harness";
import { newId } from "../shared/id";
import type { AgentRunId, LoopStepId } from "../shared/id";
import type { AgentRepos } from "./repo";
import type { AgentDef, AgentRun, ContextSnapshot } from "./types";

export interface AgentRunnerDeps {
  client: ModelClient;
  repos: AgentRepos;
  pricing?: PricingTable;
  now?: () => string;
  newRunId?: () => AgentRunId;
  newSnapshotId?: () => string;
}

export interface AgentRunOutcome<O> {
  output: O;
  run: AgentRun;
  requiresHumanReview: boolean;
}

/**
 * AgentRunner —— docs/07。跑一次 Agent：
 * 建 context_snapshots（可回放）→ 經 harness runModel（schema 驗證 + 重試）→
 * 寫 agent_runs（input/output/cost/trace）。狀態走 §0.11 agent_run_status。
 */
export class AgentRunner {
  private readonly client: ModelClient;
  private readonly repos: AgentRepos;
  private readonly pricing: PricingTable;
  private readonly now: () => string;
  private readonly newRunId: () => AgentRunId;
  private readonly newSnapshotId: () => string;

  constructor(deps: AgentRunnerDeps) {
    this.client = deps.client;
    this.repos = deps.repos;
    this.pricing = deps.pricing ?? {};
    this.now = deps.now ?? (() => new Date().toISOString());
    this.newRunId = deps.newRunId ?? (() => newId<"AgentRun">());
    this.newSnapshotId = deps.newSnapshotId ?? (() => newId<"AgentRun">());
  }

  async run<I, O>(
    agent: AgentDef<I, O>,
    input: I,
    opts?: { loopStepId?: LoopStepId },
  ): Promise<AgentRunOutcome<O>> {
    const runId = this.newRunId();
    const messages = agent.buildMessages(input);
    const startedAt = this.now();

    const snapshot: ContextSnapshot = {
      id: this.newSnapshotId(),
      agentRunId: runId,
      model: agent.model,
      system: agent.system,
      messages,
      createdAt: startedAt,
    };
    await this.repos.snapshots.create(snapshot);

    const run: AgentRun = {
      id: runId,
      agentCode: agent.code,
      loopStepId: opts?.loopStepId,
      status: "running",
      input,
      contextSnapshotId: snapshot.id,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      pricingMissing: false,
      attempts: 0,
      startedAt,
    };
    await this.repos.runs.create(run);

    try {
      const result = await runModel<O>({
        client: this.client,
        model: agent.model,
        system: agent.system,
        messages,
        schema: agent.outputSchema,
        maxRetries: agent.maxRetries ?? 2,
        pricing: this.pricing,
      });

      run.status = "succeeded";
      run.output = result.value;
      run.attempts = result.attempts;
      run.inputTokens = result.usage.inputTokens;
      run.outputTokens = result.usage.outputTokens;
      run.costUsd = result.cost.costUsd;
      run.pricingMissing = result.cost.pricingMissing;
      run.finishedAt = this.now();
      await this.repos.runs.update(run);

      const requiresHumanReview =
        agent.requiresHumanReview?.(result.value, input) ?? false;
      return { output: result.value, run, requiresHumanReview };
    } catch (e) {
      run.status = "failed";
      run.error = e instanceof Error ? e.message : String(e);
      run.finishedAt = this.now();
      await this.repos.runs.update(run);
      throw e;
    }
  }
}
