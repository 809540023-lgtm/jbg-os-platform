import { InMemoryFacebookConnector } from "@jbg/connectors";
import {
  AgentRunner,
  LoopRunner,
  PolicyEngine,
  agentActor,
  asId,
  createInMemoryAgentRepos,
  createInMemoryLoopRepos,
  defaultMvpRules,
  productLifecycleLoop,
  type Brand,
  type Category,
  type ProductPhoto,
} from "@jbg/domain";
import type { ModelClient, ModelRequest } from "@jbg/harness";
import { describe, expect, it } from "vitest";
import { publishListing } from "./publish-listing";
import { buildLifecycleExecutor, type LifecycleInput } from "./product-lifecycle-executor";

const now = "2026-07-07T00:00:00.000Z";

// ── fake model client：依 system prompt 分派各 agent 的合法 JSON ──
const RESP: { match: string; json: unknown }[] = [
  { match: "視覺鑑定師", json: {
    brand: { value: "Chanel", confidence: 0.9, isGuess: false },
    category: { value: "handbag", confidence: 0.9 },
    colors: [{ name: "black", confidence: 0.9 }],
    attachments: ["dust bag"],
    defects: [{ type: "scratch", area: "corner", severity: "minor", confidence: 0.5 }],
    overallConfidence: 0.9, notes: null,
  } },
  { match: "OCR 抽取器", json: {
    rawText: "caviar",
    fields: {
      model: { value: "Classic Flap", confidence: 0.8 },
      serial: { value: "12345678", confidence: 0.8 },
      size: { value: null, confidence: 0 },
      material: { value: "caviar", confidence: 0.9 },
    },
    language: "en", lowConfidence: false,
  } },
  { match: "定價分析師", json: {
    productId: "x", suggestedAmount: 60000, minAmount: 50000, maxAmount: 70000,
    currency: "TWD", reasons: ["品牌保值", "成色佳"], confidence: 0.8, requiresHumanReview: false,
  } },
  { match: "社群文案", json: {
    productId: "x", title: "Chanel 經典口蓋包", body: "九成新，附防塵袋。",
    sellingPoints: ["caviar 皮革", "經典款"], hashtags: ["#chanel"], complianceFlags: [],
    requiresHumanReview: true,
  } },
  { match: "上架前品管", json: {
    productId: "x", decision: "pass",
    checks: [{ name: "completeness", status: "pass", reason: "齊全" }],
  } },
  { match: "記憶萃取器", json: {
    memories: [{
      slug: "chanel-classic-flap-caviar-60k",
      kind: "fact", content: "Chanel Classic Flap caviar 成交參考約 NT$60,000。",
      links: [], sourceRef: { type: "order", id: "x" }, confidence: 0.7,
    }],
  } },
];

const fakeClient: ModelClient = {
  complete: async (req: ModelRequest) => {
    const hit = RESP.find((r) => req.system?.includes(r.match));
    return {
      text: JSON.stringify(hit?.json ?? {}),
      usage: { inputTokens: 40, outputTokens: 20 },
    };
  },
};

const brands: Brand[] = [{
  id: asId("b-chanel"), slug: "chanel", displayName: "Chanel",
  aliases: ["CHANEL"], tier: "luxury", isActive: true, createdAt: now, updatedAt: now,
}];
const categories: Category[] = [{
  id: asId("c-handbag"), slug: "handbag", displayName: "handbag",
  parentId: null, requiredAttributes: ["material"], createdAt: now, updatedAt: now,
}];
const photo: ProductPhoto = {
  id: asId("ph-1"), productId: null, status: "perceived",
  driveFileId: "drive-1", driveFolderId: "folder-1", storagePath: "photos/1.jpg",
  contentHash: "hash1", width: 800, height: 600,
  ocrResultId: null, visionResultId: null, isPrimary: true, createdAt: now, updatedAt: now,
};

function makeDeps() {
  const facebook = new InMemoryFacebookConnector(() => now);
  const policy = new PolicyEngine({ rules: defaultMvpRules(), defaultEffect: "deny" });
  const agentRunner = new AgentRunner({ client: fakeClient, repos: createInMemoryAgentRepos() });
  const actor = agentActor(asId("actor-publisher"), "publisher");
  return {
    facebook, policy,
    exec: buildLifecycleExecutor({ agentRunner, policy, facebook, actor, brands, categories, now: () => now }),
    actor,
  };
}

const input: LifecycleInput = {
  driveFileId: "drive-1",
  photo,
  ocr: { photoId: "ph-1", imageUrl: "https://x/1.jpg" },
  vision: { photoId: "ph-1", imageUrl: "https://x/1.jpg", knownBrands: ["Chanel"], knownCategories: ["handbag"] },
};

describe("product-lifecycle e2e (§0.7 端到端)", () => {
  it("跑到 human-review 暫停 → resume → 發 FB + 萃取 Memory → succeeded", async () => {
    const { facebook, exec } = makeDeps();
    const repos = createInMemoryLoopRepos();
    const runner = new LoopRunner({ repos, executeStep: exec, sleep: async () => {} });

    const paused = await runner.run(productLifecycleLoop, input);
    expect(paused.status).toBe("waiting_human");
    // 暫停前已完成感知→組裝→估價→文案→審核
    expect((paused.context.assemble as { product: { brandId: string } }).product.brandId).toBe("b-chanel");
    expect(facebook.posts.size).toBe(0); // 尚未發佈

    const done = await runner.resume(productLifecycleLoop, paused.id);
    expect(done.status).toBe("succeeded");

    const publish = done.context.publish as { published: boolean; externalPostId: string };
    expect(publish.published).toBe(true);
    expect(publish.externalPostId).toMatch(/^fb_/);
    expect(facebook.posts.size).toBe(1);

    const remember = done.context.remember as { memories: unknown[] };
    expect(remember.memories.length).toBeGreaterThanOrEqual(1);
  });

  it("冪等：同 driveFileId 不重複建立 LX", async () => {
    const { exec } = makeDeps();
    const repos = createInMemoryLoopRepos();
    const runner = new LoopRunner({ repos, executeStep: exec, sleep: async () => {} });
    const a = await runner.run(productLifecycleLoop, input);
    const b = await runner.run(productLifecycleLoop, input);
    expect(a.id).toBe(b.id);
  });
});

describe("publishListing (§7.5 發佈前過 PolicyEngine)", () => {
  const publishInput = {
    listingId: "l1", productId: "p1", status: "approved" as const,
    content: { title: "t", body: "b", hashtags: [], mediaUrls: [] },
    idempotencyKey: "l1-v1",
  };

  it("未經人審 → needsHuman，不發佈", async () => {
    const facebook = new InMemoryFacebookConnector(() => now);
    const policy = new PolicyEngine({ rules: defaultMvpRules(), defaultEffect: "deny" });
    const actor = agentActor(asId("a"), "publisher");
    const r = await publishListing({ policy, facebook, actor }, publishInput, { humanApproved: false });
    expect(r.needsHuman).toBe(true);
    expect(r.published).toBe(false);
    expect(facebook.posts.size).toBe(0);
  });

  it("已人審 → 發佈；同 idempotencyKey 不重發", async () => {
    const facebook = new InMemoryFacebookConnector(() => now);
    const policy = new PolicyEngine({ rules: defaultMvpRules(), defaultEffect: "deny" });
    const actor = agentActor(asId("a"), "publisher");
    const deps = { policy, facebook, actor };
    const r1 = await publishListing(deps, publishInput, { humanApproved: true });
    const r2 = await publishListing(deps, publishInput, { humanApproved: true });
    expect(r1.published).toBe(true);
    expect(r2.externalPostId).toBe(r1.externalPostId); // 冪等
    expect(facebook.posts.size).toBe(1);
  });
});
