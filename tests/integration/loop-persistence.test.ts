import { LoopRunner, type LoopDef } from "@jbg/domain";
import {
  SupabaseLoopExecutionRepo,
  SupabaseLoopStepRepo,
  createServiceClient,
} from "@jbg/persistence";
import { afterEach, describe, expect, it } from "vitest";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasDb = Boolean(url && key);

// 需要本地 Supabase（`supabase start`）+ env 才跑；否則跳過（CI 無 DB 時不失敗）。
describe.skipIf(!hasDb)("Loop persistence（真 Supabase）", () => {
  const db = createServiceClient(url!, key!);
  const created: string[] = [];

  afterEach(async () => {
    for (const id of created) await db.from("loop_executions").delete().eq("id", id);
    created.length = 0;
  });

  // 用已 seed 的 loop slug（loops 表有 'product-lifecycle'）以滿足 loop_id FK。
  const loop: LoopDef = {
    id: "product-lifecycle",
    version: 1,
    trigger: { kind: "manual" },
    steps: [
      { id: "perceive", type: "skill", ref: "perceive" },
      { id: "assemble", type: "skill", ref: "assemble" },
    ],
  };

  it("LoopRunner 跑一條 loop → loop_executions/loop_steps 落真 DB，狀態機正確", async () => {
    const repos = {
      executions: new SupabaseLoopExecutionRepo(db),
      steps: new SupabaseLoopStepRepo(db),
    };
    const runner = new LoopRunner({
      repos,
      executeStep: async ({ step }) => ({ output: { ok: step.id } }),
      sleep: async () => {},
    });

    const lx = await runner.run(loop, { hello: "db" });
    created.push(lx.id);
    expect(lx.status).toBe("succeeded");

    // 用「全新 client + 全新 repo」讀回 → 證明真的在 DB，不是記憶體。
    const freshRepos = {
      executions: new SupabaseLoopExecutionRepo(createServiceClient(url!, key!)),
      steps: new SupabaseLoopStepRepo(createServiceClient(url!, key!)),
    };
    const persisted = await freshRepos.executions.get(lx.id);
    expect(persisted?.status).toBe("succeeded");
    expect(persisted?.loopId).toBe("product-lifecycle"); // slug 由 loop_id join 還原
    expect(persisted?.context).toMatchObject({ perceive: { ok: "perceive" }, assemble: { ok: "assemble" } });

    const steps = await freshRepos.steps.listByExecution(lx.id);
    expect(steps.map((s) => s.stepDefId)).toEqual(["perceive", "assemble"]);
    expect(steps.every((s) => s.status === "succeeded")).toBe(true);

    // 直接查原始 row 再確認一次。
    const { data } = await db
      .from("loop_executions")
      .select("status, loop_id, cursor")
      .eq("id", lx.id)
      .single<{ status: string; loop_id: string; cursor: number }>();
    expect(data?.status).toBe("succeeded");
  });
});
