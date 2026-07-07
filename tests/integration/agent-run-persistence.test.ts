import { AgentRunner, ocrAgent } from "@jbg/domain";
import type { ModelClient } from "@jbg/harness";
import { createServiceClient, createSupabaseAgentRepos } from "@jbg/persistence";
import { afterEach, describe, expect, it } from "vitest";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasDb = Boolean(url && key);

const OCR_JSON = JSON.stringify({
  rawText: "caviar",
  fields: {
    model: { value: "Classic Flap", confidence: 0.8 },
    serial: { value: "12345678", confidence: 0.8 },
    size: { value: null, confidence: 0 },
    material: { value: "caviar", confidence: 0.9 },
  },
  language: "en",
  lowConfidence: false,
});

const client: ModelClient = {
  complete: async () => ({ text: OCR_JSON, usage: { inputTokens: 120, outputTokens: 30 } }),
};

describe.skipIf(!hasDb)("agent_runs / context_snapshots 落真 DB（可回放）", () => {
  const db = createServiceClient(url!, key!);
  let runId = "";

  afterEach(async () => {
    if (runId) await db.from("agent_runs").delete().eq("id", runId); // cascade snapshots
    runId = "";
  });

  it("跑 ocr agent → agent_runs + context_snapshots 落 DB，cost 以 micro-USD 保存", async () => {
    const runner = new AgentRunner({
      client,
      repos: createSupabaseAgentRepos(db),
      pricing: { [ocrAgent.model]: { inputPerMillionUsd: 1, outputPerMillionUsd: 5 } },
    });

    const outcome = await runner.run(ocrAgent, { photoId: "p1", imageUrl: "https://x/p1.jpg" });
    runId = outcome.run.id;
    expect(outcome.output.fields.model.value).toBe("Classic Flap");

    const fresh = createServiceClient(url!, key!);

    // agent_run 落庫，agent_id join 回 code='ocr'
    const { data: run } = await fresh
      .from("agent_runs")
      .select("status, input_tokens, output_tokens, cost_amount, agents(code)")
      .eq("id", runId)
      .single<{ status: string; input_tokens: number; output_tokens: number; cost_amount: number; agents: { code: string } }>();
    expect(run?.status).toBe("succeeded");
    expect(run?.agents.code).toBe("ocr");
    expect(run?.input_tokens).toBe(120);
    // cost = (120/1e6*1)+(30/1e6*5) = 0.00027 USD → 270 micro-USD
    expect(run?.cost_amount).toBe(270);

    // context_snapshot 可回放（存了實際餵入的 messages）
    const { data: snap } = await fresh
      .from("context_snapshots")
      .select("content")
      .eq("agent_run_id", runId)
      .single<{ content: { model: string; messages: { content: string }[] } }>();
    expect(snap?.content.messages[0]?.content).toContain("https://x/p1.jpg");
    expect(snap?.content.model).toBe(ocrAgent.model);
  });
});
