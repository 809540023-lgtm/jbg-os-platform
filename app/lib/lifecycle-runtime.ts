import { randomUUID } from "node:crypto";
import { InMemoryFacebookConnector } from "@jbg/connectors";
import {
  AgentRunner,
  LoopRunner,
  PolicyEngine,
  agentActor,
  asId,
  defaultMvpRules,
  productLifecycleLoop,
  type ProductPhoto,
} from "@jbg/domain";
import { AnthropicModelClient, MODEL_PRICING, type ModelClient, type ModelRequest } from "@jbg/harness";
import {
  SupabaseLoopExecutionRepo,
  SupabaseLoopStepRepo,
  SupabaseMemoryRepo,
  SupabaseProductRepo,
  createSupabaseAgentRepos,
  type SupabaseClient,
} from "@jbg/persistence";
import { buildLifecycleExecutor, type LifecycleInput } from "@jbg/skills";

/**
 * Demo lifecycle runtime —— 用 fake agent（不需 API key）把整條 product-lifecycle
 * 接上真 Supabase repo。供「觸發一次」按鈕與「人審核准後 resume」共用。
 * 正式版把 fakeClient 換成 Anthropic client、facebook 換成真 connector 即可。
 */

const RESP: { match: string; json: unknown }[] = [
  { match: "視覺鑑定師", json: { brand: { value: "Chanel", confidence: 0.9, isGuess: false }, category: { value: "handbag", confidence: 0.9 }, colors: [{ name: "black", confidence: 0.9 }], attachments: ["dust bag"], defects: [{ type: "scratch", area: "corner", severity: "minor", confidence: 0.5 }], overallConfidence: 0.9, notes: null } },
  { match: "OCR 抽取器", json: { rawText: "caviar", fields: { model: { value: "Classic Flap", confidence: 0.8 }, serial: { value: "12345678", confidence: 0.8 }, size: { value: null, confidence: 0 }, material: { value: "caviar", confidence: 0.9 } }, language: "en", lowConfidence: false } },
  { match: "定價分析師", json: { productId: "x", suggestedAmount: 60000, minAmount: 50000, maxAmount: 70000, currency: "TWD", reasons: ["品牌保值", "成色佳"], confidence: 0.8, requiresHumanReview: false } },
  { match: "社群文案", json: { productId: "x", title: "Chanel 經典口蓋包", body: "九成新，附防塵袋。", sellingPoints: ["caviar 皮革"], hashtags: ["#chanel"], complianceFlags: [], requiresHumanReview: true } },
  { match: "上架前品管", json: { productId: "x", decision: "pass", checks: [{ name: "completeness", status: "pass", reason: "齊全" }] } },
  { match: "記憶萃取器", json: { memories: [] } },
];

function makeFakeClient(memorySlug: string): ModelClient {
  return {
    complete: async (req: ModelRequest) => {
      const hit = RESP.find((r) => req.system?.includes(r.match));
      let json = hit?.json ?? {};
      if (req.system?.includes("記憶萃取器")) {
        json = { memories: [{ slug: memorySlug, kind: "fact", content: "Chanel Classic Flap caviar 成交約 NT$60,000。", links: [], sourceRef: { type: "order", id: "44444444-4444-4444-4444-444444444444" }, confidence: 0.7 }] };
      }
      return { text: JSON.stringify(json), usage: { inputTokens: 40, outputTokens: 20 } };
    },
  };
}

export function buildLifecycleRuntime(db: SupabaseClient) {
  const facebook = new InMemoryFacebookConnector();
  const policy = new PolicyEngine({ rules: defaultMvpRules(), defaultEffect: "deny" });

  // 有 ANTHROPIC_API_KEY → 真 Claude；否則 fake（demo 不需 key 也能跑）。
  const realClient = AnthropicModelClient.fromEnv();

  function makeRunner(memorySlug: string) {
    const client = realClient ?? makeFakeClient(memorySlug);
    const agentRunner = new AgentRunner({
      client,
      repos: createSupabaseAgentRepos(db),
      pricing: realClient ? MODEL_PRICING : undefined,
    });
    const executor = buildLifecycleExecutor({
      agentRunner, policy, facebook,
      actor: agentActor(asId("00000000-0000-0000-0000-0000000000a1"), "publisher"),
      brands: [], categories: [],
      productRepo: new SupabaseProductRepo(db),
      memoryRepo: new SupabaseMemoryRepo(db),
    });
    return new LoopRunner({
      repos: { executions: new SupabaseLoopExecutionRepo(db), steps: new SupabaseLoopStepRepo(db) },
      executeStep: executor,
    });
  }

  return {
    loop: productLifecycleLoop,
    /** 觸發一條新的 demo lifecycle（跑到 human-review 暫停）。 */
    async trigger(): Promise<{ executionId: string; status: string }> {
      const driveFileId = randomUUID();
      const photo: ProductPhoto = {
        id: asId(randomUUID()), productId: null, status: "perceived",
        driveFileId, driveFolderId: "demo-folder", storagePath: `photos/${driveFileId}.jpg`,
        contentHash: driveFileId, width: 800, height: 600,
        ocrResultId: null, visionResultId: null, isPrimary: true,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      };
      const input: LifecycleInput = {
        driveFileId, photo,
        ocr: { photoId: photo.id, imageUrl: photo.storagePath },
        vision: { photoId: photo.id, imageUrl: photo.storagePath, knownBrands: ["Chanel"], knownCategories: ["handbag"] },
      };
      const runner = makeRunner(`demo-mem-${driveFileId.slice(0, 8)}`);
      const ex = await runner.run(productLifecycleLoop, input);
      return { executionId: ex.id, status: ex.status };
    },
    /** 人審核准後續跑（waiting_human → publish → remember → succeeded）。 */
    async resume(executionId: string): Promise<string> {
      const runner = makeRunner(`demo-mem-${executionId.slice(0, 8)}`);
      const ex = await runner.resume(productLifecycleLoop, executionId as never);
      return ex.status;
    },
  };
}
