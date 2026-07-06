import type { ModelClient } from "@jbg/harness";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createInMemoryAgentRepos } from "./repo";
import { AgentRunner } from "./runner";
import type { AgentDef } from "./types";

const echoAgent: AgentDef<{ text: string }, { echo: string; confidence: number }> = {
  code: "ocr",
  version: 1,
  model: "test-fast",
  system: "echo",
  buildMessages: (input) => [{ role: "user", content: input.text }],
  outputSchema: z.object({ echo: z.string(), confidence: z.number() }),
  requiresHumanReview: (out) => out.confidence < 0.5,
};

function client(text: string): ModelClient {
  return {
    complete: vi.fn(async () => ({ text, usage: { inputTokens: 10, outputTokens: 5 } })),
  };
}

describe("AgentRunner (docs/07)", () => {
  it("跑一個 Agent：寫 agent_runs（cost/trace）+ context_snapshots（可回放）", async () => {
    const repos = createInMemoryAgentRepos();
    const runner = new AgentRunner({
      client: client('{"echo":"hi","confidence":0.9}'),
      repos,
      pricing: { "test-fast": { inputPerMillionUsd: 1, outputPerMillionUsd: 2 } },
    });

    const outcome = await runner.run(echoAgent, { text: "hi" });

    expect(outcome.output.echo).toBe("hi");
    expect(outcome.requiresHumanReview).toBe(false);
    expect(outcome.run.status).toBe("succeeded");
    expect(outcome.run.costUsd).toBeGreaterThan(0);
    // 可回放：snapshot 存了實際餵入的 messages
    const snap = repos.snapshots.snapshots.get(outcome.run.contextSnapshotId!);
    expect(snap?.messages[0]?.content).toBe("hi");
    // agent_run 落庫
    expect(repos.runs.runs.get(outcome.run.id)?.status).toBe("succeeded");
  });

  it("低信心 → requiresHumanReview=true（升級人審）", async () => {
    const repos = createInMemoryAgentRepos();
    const runner = new AgentRunner({
      client: client('{"echo":"?","confidence":0.2}'),
      repos,
    });
    const outcome = await runner.run(echoAgent, { text: "blurry" });
    expect(outcome.requiresHumanReview).toBe(true);
  });

  it("模型持續壞輸出 → agent_run 記為 failed 並拋錯", async () => {
    const repos = createInMemoryAgentRepos();
    const runner = new AgentRunner({
      client: client('{"bad":true}'),
      repos,
    });
    await expect(runner.run(echoAgent, { text: "x" })).rejects.toThrow();
    const runs = [...repos.runs.runs.values()];
    expect(runs[0]?.status).toBe("failed");
  });
});
