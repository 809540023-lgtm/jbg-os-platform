import { AgentRunner, inquiryAgent, type InquiryReply } from "@jbg/domain";
import type { ModelClient } from "@jbg/harness";
import { SupabaseInquiryRepo, createServiceClient, createSupabaseAgentRepos } from "@jbg/persistence";
import { afterEach, describe, expect, it } from "vitest";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasDb = Boolean(url && key);

/** fake：spec 問題 → 高信心自動回；議價 → 強制人審。 */
function makeClient(reply: InquiryReply): ModelClient {
  return { complete: async () => ({ text: JSON.stringify(reply), usage: { inputTokens: 60, outputTokens: 40 } }) };
}

describe.skipIf(!hasDb)("Inquiry Agent 端到端落真 DB（canonical §0.6 客服）", () => {
  const db = createServiceClient(url!, key!);
  const repo = new SupabaseInquiryRepo(db);
  let inquiryId = "";
  let productId = "";

  afterEach(async () => {
    if (inquiryId) await db.from("inquiries").delete().eq("id", inquiryId);
    if (productId) await db.from("products").delete().eq("id", productId);
    inquiryId = "";
    productId = "";
  });

  it("建立詢問 → 跑 agent → 存草稿；spec 問題可自動回", async () => {
    const { data: prod } = await db
      .from("products")
      .insert({ status: "published", title: "測試 製冰機", condition: "good", price_amount: 30000, price_currency: "TWD", attributes: [{ key: "磅數", value: "300磅" }] })
      .select("id")
      .single<{ id: string }>();
    productId = prod!.id;

    inquiryId = await repo.create({ productId, message: "這台磅數多少？", customerHandle: "測試", channel: "web" });

    const runner = new AgentRunner({ client: makeClient({
      inquiryId, intent: "spec", reply: "這台日產能 300 磅。", confidence: 0.9, requiresHumanReview: false, handoffNote: null,
    }), repos: createSupabaseAgentRepos(db) });

    const inq = await repo.get(inquiryId);
    const outcome = await runner.run(inquiryAgent, {
      inquiryId, message: inq!.message!, customerHandle: inq!.customerHandle, channel: "web",
      productCard: { title: inq!.productTitle, price: "NT$30,000", condition: "good", status: "published", attributes: inq!.productAttributes, description: null },
    });
    await repo.saveDraft(inquiryId, { reply: outcome.output.reply, confidence: outcome.output.confidence, requiresHuman: outcome.requiresHumanReview });

    expect(outcome.requiresHumanReview).toBe(false); // spec + 高信心 → 自動回
    const saved = await repo.get(inquiryId);
    expect(saved?.aiDraft).toContain("300 磅");
    expect(saved?.aiRequiresHuman).toBe(false);
    expect(saved?.status).toBe("in_progress");
  });

  it("議價問題 → 守則#4 強制人審（即使 agent 說不用）", async () => {
    const { data: prod } = await db
      .from("products").insert({ status: "published", title: "測試2", condition: "good", price_amount: 30000, price_currency: "TWD", attributes: [] })
      .select("id").single<{ id: string }>();
    productId = prod!.id;
    inquiryId = await repo.create({ productId, message: "可以便宜嗎", customerHandle: null, channel: "web" });

    const runner = new AgentRunner({ client: makeClient({
      inquiryId, intent: "price", reply: "我請專人處理。", confidence: 0.95, requiresHumanReview: false, handoffNote: "議價",
    }), repos: createSupabaseAgentRepos(db) });

    const outcome = await runner.run(inquiryAgent, {
      inquiryId, message: "可以便宜嗎", customerHandle: null, channel: "web",
      productCard: { title: "測試2", price: "NT$30,000", condition: "good", status: "published", attributes: [], description: null },
    });
    expect(outcome.requiresHumanReview).toBe(true); // price intent → 強制 HR
  });
});
