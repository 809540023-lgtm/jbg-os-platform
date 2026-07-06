import { describe, expect, it } from "vitest";
import { createInMemoryLoopRepos } from "./memory-repo";
import { LoopRunner } from "./runner";
import type { LoopDef } from "./types";

const noSleep = async () => {};

function fixedIds() {
  let n = 0;
  return {
    exec: () => `lx-${n}` as never,
    step: () => `st-${(n += 1)}` as never,
  };
}

describe("LoopRunner (docs/08)", () => {
  it("跑完一條 Loop：queued → running → succeeded，每步有 loop_steps 記錄", async () => {
    const repos = createInMemoryLoopRepos();
    const runner = new LoopRunner({
      repos,
      executeStep: async ({ step }) => ({ output: { ran: step.id } }),
      sleep: noSleep,
    });
    const loop: LoopDef = {
      id: "test-loop",
      version: 1,
      trigger: { kind: "manual" },
      steps: [
        { id: "a", type: "skill", ref: "noop" },
        { id: "b", type: "agent", ref: "ocr" },
      ],
    };

    const lx = await runner.run(loop, { hello: "world" });

    expect(lx.status).toBe("succeeded");
    const steps = await repos.steps.listByExecution(lx.id);
    expect(steps.map((s) => s.stepDefId)).toEqual(["a", "b"]);
    expect(steps.every((s) => s.status === "succeeded")).toBe(true);
    expect(lx.context).toMatchObject({ a: { ran: "a" }, b: { ran: "b" } });
  });

  it("遇 human step 暫停在 waiting_human，resume 後續跑到 succeeded", async () => {
    const repos = createInMemoryLoopRepos();
    const runner = new LoopRunner({
      repos,
      executeStep: async ({ step }) => ({ output: step.id }),
      sleep: noSleep,
    });
    const loop: LoopDef = {
      id: "hr-loop",
      version: 1,
      trigger: { kind: "manual" },
      steps: [
        { id: "compose", type: "agent", ref: "marketing" },
        { id: "human-review", type: "human" },
        { id: "publish", type: "connector", ref: "facebook" },
      ],
    };

    const paused = await runner.run(loop, {});
    expect(paused.status).toBe("waiting_human");

    const done = await runner.resume(loop, paused.id);
    expect(done.status).toBe("succeeded");
    const steps = await repos.steps.listByExecution(done.id);
    expect(steps.find((s) => s.stepDefId === "publish")?.status).toBe("succeeded");
  });

  it("step 失敗且 failLoopOnError 預設 → LX 進 failed，錯誤被記錄", async () => {
    const repos = createInMemoryLoopRepos();
    const runner = new LoopRunner({
      repos,
      executeStep: async () => {
        throw new Error("boom");
      },
      sleep: noSleep,
    });
    const loop: LoopDef = {
      id: "fail-loop",
      version: 1,
      trigger: { kind: "manual" },
      steps: [{ id: "x", type: "skill", ref: "explode" }],
    };

    const lx = await runner.run(loop, {});
    expect(lx.status).toBe("failed");
    expect(lx.error).toContain("boom");
  });

  it("retry：前兩次失敗、第三次成功 → succeeded", async () => {
    const repos = createInMemoryLoopRepos();
    let calls = 0;
    const runner = new LoopRunner({
      repos,
      executeStep: async () => {
        calls += 1;
        if (calls < 3) throw new Error(`fail ${calls}`);
        return { output: "ok" };
      },
      sleep: noSleep,
    });
    const loop: LoopDef = {
      id: "retry-loop",
      version: 1,
      trigger: { kind: "manual" },
      steps: [
        { id: "flaky", type: "skill", ref: "flaky", retry: { maxAttempts: 3, backoffMs: 1 } },
      ],
    };

    const lx = await runner.run(loop, {});
    expect(lx.status).toBe("succeeded");
    expect(calls).toBe(3);
  });

  it("冪等：同 idempotencyKey 不重複建立新 LX", async () => {
    const repos = createInMemoryLoopRepos();
    let created = 0;
    const runner = new LoopRunner({
      repos,
      executeStep: async () => {
        created += 1;
        return { output: null };
      },
      sleep: noSleep,
    });
    const loop: LoopDef = {
      id: "idem-loop",
      version: 1,
      trigger: { kind: "manual" },
      idempotencyKey: (input) => (input as { fileId: string }).fileId,
      steps: [{ id: "ingest", type: "connector", ref: "drive" }],
    };

    const first = await runner.run(loop, { fileId: "file-1" });
    const second = await runner.run(loop, { fileId: "file-1" });
    expect(first.id).toBe(second.id);
    expect(created).toBe(1);
  });
});

// 保留：未來以 fixedIds 做快照測試
void fixedIds;
