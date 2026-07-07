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
  { match: "視覺鑑定師", json: { brand: { value: "萬利多", confidence: 0.9, isGuess: false }, category: { value: "製冰機", confidence: 0.9 }, colors: [{ name: "不鏽鋼銀", confidence: 0.9 }], attachments: ["冰鏟", "濾心"], defects: [{ type: "刮痕", area: "左側面板", severity: "minor", confidence: 0.6 }], overallConfidence: 0.9, notes: null } },
  { match: "OCR 抽取器", json: { rawText: "MANITOWOC IY-0504A 220V", fields: { model: { value: "IY-0504A", confidence: 0.85 }, serial: { value: "MT20230815", confidence: 0.8 }, size: { value: "500LB/日 220V", confidence: 0.8 }, material: { value: "不鏽鋼", confidence: 0.9 } }, language: "en", lowConfidence: false } },
  { match: "定價分析師", json: { productId: "x", suggestedAmount: 45000, minAmount: 38000, maxAmount: 52000, currency: "TWD", reasons: ["萬利多零件流通性高", "九成新僅面板輕微刮痕"], confidence: 0.8, requiresHumanReview: false } },
  { match: "社群文案", json: { productId: "x", title: "二手 萬利多 500磅 製冰機 台北｜保固三個月", body: "萬利多 IY-0504A，日產能 500 磅，220V。九成新、水路已清洗除垢。可驗收：製冰量、排水、噪音。附保固、可到府安裝，比買新省約 55%。", sellingPoints: ["500磅日產能", "水路除垢完成"], hashtags: ["#開店設備", "#二手製冰機"], complianceFlags: [], requiresHumanReview: true } },
  { match: "上架前品管", json: { productId: "x", decision: "pass", checks: [{ name: "completeness", status: "pass", reason: "規格、成色、可驗收項齊全" }] } },
  { match: "記憶萃取器", json: { memories: [] } },
];

function makeFakeClient(memorySlug: string): ModelClient {
  return {
    complete: async (req: ModelRequest) => {
      const hit = RESP.find((r) => req.system?.includes(r.match));
      let json = hit?.json ?? {};
      if (req.system?.includes("記憶萃取器")) {
        json = { memories: [{ slug: memorySlug, kind: "fact", content: "萬利多 500 磅製冰機（九成新）台北成交參考約 NT$45,000。", links: [], sourceRef: { type: "order", id: "44444444-4444-4444-4444-444444444444" }, confidence: 0.7 }] };
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
        vision: { photoId: photo.id, imageUrl: photo.storagePath, knownBrands: ["萬利多", "Scotsman", "力頓"], knownCategories: ["製冰機", "商用冰箱", "洗碗機", "爐具"] },
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
