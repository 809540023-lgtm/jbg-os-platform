import type { ModelClient } from "@jbg/harness";
import { describe, expect, it } from "vitest";
import { createInMemoryAgentRepos } from "../repo";
import { AgentRunner } from "../runner";
import { marketingAgent } from "./marketing";
import { priceAgent } from "./price";
import { reviewerAgent } from "./reviewer";

function fixedClient(text: string): ModelClient {
  return { complete: async () => ({ text, usage: { inputTokens: 30, outputTokens: 15 } }) };
}
const runnerWith = (text: string) =>
  new AgentRunner({ client: fixedClient(text), repos: createInMemoryAgentRepos() });

describe("priceAgent (docs/07 §7.3.3)", () => {
  const base = {
    productId: "p1",
    productCard: { brand: "Chanel", category: "handbag", condition: "excellent", attachments: [], defects: [] },
    comparableSales: [],
    currency: "TWD",
  };

  it("有效建議：reasons≥2、金額落在區間", async () => {
    const out = await runnerWith(
      JSON.stringify({
        productId: "p1",
        suggestedAmount: 60000,
        minAmount: 50000,
        maxAmount: 70000,
        currency: "TWD",
        reasons: ["品牌保值", "成色佳"],
        confidence: 0.8,
        requiresHumanReview: false,
      }),
    ).run(priceAgent, base);
    expect(out.output.suggestedAmount).toBe(60000);
    expect(out.requiresHumanReview).toBe(false);
  });

  it("低信心 → requiresHumanReview=true", async () => {
    const out = await runnerWith(
      JSON.stringify({
        productId: "p1",
        suggestedAmount: 30000,
        minAmount: 10000,
        maxAmount: 60000,
        currency: "TWD",
        reasons: ["資料少", "估計寬"],
        confidence: 0.4,
        requiresHumanReview: false,
      }),
    ).run(priceAgent, base);
    expect(out.requiresHumanReview).toBe(true);
  });

  it("guardrail：只有 1 條 reason 或金額超出區間 → schema 擋下並重試耗盡拋錯", async () => {
    await expect(
      runnerWith(
        JSON.stringify({
          productId: "p1",
          suggestedAmount: 99999, // 超出 max
          minAmount: 10000,
          maxAmount: 60000,
          currency: "TWD",
          reasons: ["只有一條"],
          confidence: 0.9,
          requiresHumanReview: false,
        }),
      ).run({ ...priceAgent, maxRetries: 0 }, base),
    ).rejects.toThrow();
  });
});

describe("marketingAgent (docs/07 §7.3.4)", () => {
  it("首次上架 → 需 HR；合規旗標非空也需 HR", async () => {
    const out = await runnerWith(
      JSON.stringify({
        productId: "p1",
        title: "正品 Chanel 經典包",
        body: "誠可議",
        sellingPoints: ["九成新"],
        hashtags: ["#chanel"],
        complianceFlags: [],
        requiresHumanReview: true,
      }),
    ).run(marketingAgent, {
      productId: "p1",
      productCard: { brand: "Chanel" },
      price: { amount: 60000, currency: "TWD" },
    });
    expect(out.requiresHumanReview).toBe(true);
  });
});

describe("reviewerAgent (docs/07 §7.3.5)", () => {
  const marketing = {
    productId: "p1",
    title: "t",
    body: "b",
    sellingPoints: [],
    hashtags: [],
    complianceFlags: [],
    requiresHumanReview: true,
  };
  const price = {
    productId: "p1",
    suggestedAmount: 60000,
    minAmount: 50000,
    maxAmount: 70000,
    currency: "TWD",
    reasons: ["a", "b"],
    confidence: 0.8,
    requiresHumanReview: false,
  };

  it("完整 → pass；自身不觸發 HR", async () => {
    const out = await runnerWith(
      JSON.stringify({
        productId: "p1",
        decision: "pass",
        checks: [{ name: "completeness", status: "pass", reason: "齊全" }],
      }),
    ).run(reviewerAgent, { productId: "p1", card: { title: "t" }, marketing, price });
    expect(out.output.decision).toBe("pass");
    expect(out.requiresHumanReview).toBe(false);
  });

  it("缺陷 → reject + reworkStage", async () => {
    const out = await runnerWith(
      JSON.stringify({
        productId: "p1",
        decision: "reject",
        checks: [{ name: "completeness", status: "fail", reason: "缺 title" }],
        reworkStage: "assemble",
      }),
    ).run(reviewerAgent, { productId: "p1", card: {}, marketing, price });
    expect(out.output.decision).toBe("reject");
    expect(out.output.reworkStage).toBe("assemble");
  });
});
