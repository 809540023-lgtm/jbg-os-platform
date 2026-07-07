import { InMemoryFacebookConnector } from "@jbg/connectors";
import {
  AgentRunner,
  LoopRunner,
  PolicyEngine,
  agentActor,
  asId,
  createInMemoryAgentRepos,
  defaultMvpRules,
  productLifecycleLoop,
  type ProductPhoto,
} from "@jbg/domain";
import type { ModelClient, ModelRequest } from "@jbg/harness";
import {
  SupabaseLoopExecutionRepo,
  SupabaseLoopStepRepo,
  SupabaseMemoryRepo,
  SupabaseProductRepo,
  createServiceClient,
} from "@jbg/persistence";
import { buildLifecycleExecutor, type LifecycleInput } from "@jbg/skills";
import { afterEach, describe, expect, it } from "vitest";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasDb = Boolean(url && key);

const now = "2026-07-07T00:00:00.000Z";

const RESP: { match: string; json: unknown }[] = [
  { match: "視覺鑑定師", json: { brand: { value: "Chanel", confidence: 0.9, isGuess: false }, category: { value: "handbag", confidence: 0.9 }, colors: [{ name: "black", confidence: 0.9 }], attachments: ["dust bag"], defects: [{ type: "scratch", area: "corner", severity: "minor", confidence: 0.5 }], overallConfidence: 0.9, notes: null } },
  { match: "OCR 抽取器", json: { rawText: "caviar", fields: { model: { value: "Classic Flap", confidence: 0.8 }, serial: { value: "12345678", confidence: 0.8 }, size: { value: null, confidence: 0 }, material: { value: "caviar", confidence: 0.9 } }, language: "en", lowConfidence: false } },
  { match: "定價分析師", json: { productId: "x", suggestedAmount: 60000, minAmount: 50000, maxAmount: 70000, currency: "TWD", reasons: ["品牌保值", "成色佳"], confidence: 0.8, requiresHumanReview: false } },
  { match: "社群文案", json: { productId: "x", title: "Chanel 經典口蓋包", body: "九成新，附防塵袋。", sellingPoints: ["caviar 皮革"], hashtags: ["#chanel"], complianceFlags: [], requiresHumanReview: true } },
  { match: "上架前品管", json: { productId: "x", decision: "pass", checks: [{ name: "completeness", status: "pass", reason: "齊全" }] } },
  { match: "記憶萃取器", json: { memories: [{ slug: "it-chanel-flap-caviar-60k", kind: "fact", content: "Chanel Classic Flap caviar 成交約 NT$60,000。", links: [], sourceRef: { type: "order", id: "44444444-4444-4444-4444-444444444444" }, confidence: 0.7 }] } },
];

const fakeClient: ModelClient = {
  complete: async (req: ModelRequest) => ({
    text: JSON.stringify(RESP.find((r) => req.system?.includes(r.match))?.json ?? {}),
    usage: { inputTokens: 40, outputTokens: 20 },
  }),
};

// primary_photo_id 是 uuid 欄 → 用合法 uuid。
const photo: ProductPhoto = { id: asId("33333333-3333-3333-3333-333333333333"), productId: null, status: "perceived", driveFileId: "it-drive-1", driveFolderId: "f1", storagePath: "photos/it.jpg", contentHash: "ith", width: 800, height: 600, ocrResultId: null, visionResultId: null, isPrimary: true, createdAt: now, updatedAt: now };

describe.skipIf(!hasDb)("product-lifecycle 落真 DB（loop + product + memory）", () => {
  const db = createServiceClient(url!, key!);
  const cleanup: { execIds: string[]; productIds: string[]; memorySlugs: string[] } = { execIds: [], productIds: [], memorySlugs: [] };

  afterEach(async () => {
    for (const id of cleanup.execIds) await db.from("loop_executions").delete().eq("id", id);
    for (const id of cleanup.productIds) await db.from("products").delete().eq("id", id);
    for (const s of cleanup.memorySlugs) await db.from("memories").delete().eq("slug", s);
    cleanup.execIds = []; cleanup.productIds = []; cleanup.memorySlugs = [];
  });

  it("跑到人審暫停 → resume → loop_executions/loop_steps/products/memories 全落 DB", async () => {
    const facebook = new InMemoryFacebookConnector(() => now);
    const policy = new PolicyEngine({ rules: defaultMvpRules(), defaultEffect: "deny" });
    const agentRunner = new AgentRunner({ client: fakeClient, repos: createInMemoryAgentRepos() });
    const exec = buildLifecycleExecutor({
      agentRunner, policy, facebook,
      actor: agentActor(asId("actor-publisher"), "publisher"),
      // 空 brands/categories → brandId/categoryId 留 null，避開 in-memory 假 id 的 FK。
      brands: [], categories: [], now: () => now,
      productRepo: new SupabaseProductRepo(db),
      memoryRepo: new SupabaseMemoryRepo(db),
    });
    const runner = new LoopRunner({
      repos: { executions: new SupabaseLoopExecutionRepo(db), steps: new SupabaseLoopStepRepo(db) },
      executeStep: exec,
      sleep: async () => {},
    });

    const input: LifecycleInput = {
      driveFileId: "it-drive-1",
      photo,
      ocr: { photoId: "ph-it", imageUrl: "https://x/it.jpg" },
      vision: { photoId: "ph-it", imageUrl: "https://x/it.jpg", knownBrands: ["Chanel"], knownCategories: ["handbag"] },
    };

    const paused = await runner.run(productLifecycleLoop, input);
    cleanup.execIds.push(paused.id);
    const productId = (paused.context.assemble as { product: { id: string } }).product.id;
    cleanup.productIds.push(productId);
    cleanup.memorySlugs.push("it-chanel-flap-caviar-60k");
    expect(paused.status).toBe("waiting_human");

    const done = await runner.resume(productLifecycleLoop, paused.id);
    expect(done.status).toBe("succeeded");

    // product 落 DB（fresh client 讀回）
    const freshDb = createServiceClient(url!, key!);
    const { data: prod } = await freshDb.from("products").select("status, title").eq("id", productId).single<{ status: string; title: string | null }>();
    expect(prod?.status).toBe("assembled");

    // memory 落 DB
    const { data: mem } = await freshDb.from("memories").select("type, content").eq("slug", "it-chanel-flap-caviar-60k").single<{ type: string; content: string }>();
    expect(mem?.type).toBe("fact");

    // loop_steps 有 publish 且成功
    const steps = await new SupabaseLoopStepRepo(freshDb).listByExecution(done.id as never);
    expect(steps.find((s) => s.stepDefId === "publish")?.status).toBe("succeeded");
    expect(facebook.posts.size).toBe(1);
  });
});
