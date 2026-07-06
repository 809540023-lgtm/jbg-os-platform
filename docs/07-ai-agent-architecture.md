# 07 · AI Agent Architecture + Human Review + Permission

> 本章定義 JBG OS 的 **Agent runtime**、7 個 Canonical Agent 的完整 I/O 契約、**Human Review (HR)** 關卡設計，以及 **Permission** 兩道防線。
> 所有名詞、Entity、Agent 代號、狀態機一律遵守 `docs/00-canonical-model.md`（下稱「合約」）。若本章與合約衝突，以合約為準。
> 對應合約：§0.4 第 3 層 Harness / 第 8 層 Sub-agent / 第 11 層 Permission、§0.6 Canonical Agents、§0.7 SHAP 主流程、§0.9 Permission、§0.11 狀態機。
>
> 版本：v1.0 · 最後更新：2026-07-07

---

## 7.0 本章心智模型 (Mental Model)

一句話：**Agent 是「有 I/O 契約的 AI 執行單元」，它只會「提議」，任何有外部副作用或不可逆的動作都要先過 Permission 或 Human Review。**

三個不可混淆的層次：

| 層次 | 是什麼 | 誰負責 | 載體 |
|---|---|---|---|
| **Agent** | AI 執行單元的**定義**（角色 + I/O schema + 可用 skill/connector） | 撰寫者 | `Agent` entity + `packages/domain/src/agent/agents/*`（R4 定案，依附錄 A 分層） |
| **AgentRun** | Agent 的**一次執行**（input/output/cost/trace） | Harness | `AgentRun` entity |
| **Harness** | 包住模型呼叫的**外殼**（重試、schema 驗證、記帳、逾時） | 平台 | `packages/harness` |

分工鐵律（合約 §0.6）：
**Perception（`vision`/`ocr`）只描述事實 → Reasoning（`price`/`marketing`）產生主張 → `reviewer` 把關 → `publisher` 執行 → `memory` 沉澱。**
每個 Agent **單一職責**，不越界；Agent **不得直接呼叫外部 API**，一律走 Connector（合約 §0.8）。

---

## 7.1 Agent 執行模型：一個 AgentRun 怎麼跑

### 7.1.1 生命週期 (The Canonical AgentRun Pipeline)

一次 `AgentRun` 一定照這條 pipeline 走。這是合約第 3 層（Harness）的具體實作。

```
LoopStep 觸發
   │
   ▼
[1] ContextBuilder → 產生 ContextSnapshot
        （entity 快照 + Memory recall + RAG + 前序 AgentRun 輸出）
   │
   ▼
[2] PromptRenderer → 用 Prompt 模板 + ContextSnapshot 渲染 messages
        （system + few-shot + user；輸出契約寫進 system）
   │
   ▼
[3] Harness.run() ── 迴圈外殼開始 ──────────────────
        ├─ Permission 前置檢查（此 Agent 允許呼叫哪些 tool/connector？）
        ├─ 呼叫模型（MODELS.REASONING / VISION / FAST）
        ├─ 收 tool_use → 只准呼叫白名單內的 Skill/Connector
        ├─ schema 驗證（Zod）：不合規 → repair prompt 重試（≤2 次）
        ├─ token 記帳（input/output/cache）→ cost
        └─ 逾時 / 錯誤 → 退避重試（見 §7.1.4）
   ── 迴圈外殼結束 ──────────────────────────────
   │
   ▼
[4] Output：schema-valid 的 domain object（VisionResult / PriceSuggestion / …）
   │
   ▼
[5] 落庫：寫 AgentRun（input, output, cost, latency, trace_id, model, status）
        寫 ContextSnapshot（可回放）
        寫 AuditLog（actor=agent, action, resource）
   │
   ▼
[6] 決策：pass through / 觸發 HumanReview / 觸發 sub-agent / 回退 LoopStep
```

**單一職責原則**：一個 Agent = 一個 `system prompt` + 一組 output schema + 一組被授權的 tool。若你發現一個 Agent 要「先看圖再估價再寫文案」——那是 **3 個 Agent**，由 Loop 串接，不是一個巨型 Agent。

### 7.1.2 型別骨架 (TS)

```ts
// packages/harness/src/types.ts
import { z } from "zod";

export const MODELS = {
  REASONING: process.env.MODEL_REASONING!, // 主推理：price / marketing / reviewer / memory
  VISION:    process.env.MODEL_VISION!,    // 圖片理解：vision（+ ocr 的視覺後援）
  FAST:      process.env.MODEL_FAST!,      // 便宜快任務：ocr、reviewer 的規則層
} as const;
// ⚠️ 模型 id 絕不硬寫；一律走 MODELS.* 常數，值來自環境/設定檔（合約 §0.3、§0.12-7）。

export type AgentId =
  | "vision" | "ocr" | "price" | "marketing"
  | "reviewer" | "publisher" | "memory";

export interface AgentDefinition<I, O> {
  id: AgentId;
  role: string;                    // 一句話職責
  model: keyof typeof MODELS;      // "REASONING" | "VISION" | "FAST"
  inputSchema: z.ZodType<I>;
  outputSchema: z.ZodType<O>;
  systemPrompt: string;            // 版本化，存 Prompt entity
  tools: string[];                 // 可用 Skill id（白名單）
  connectors: string[];            // 可用 Connector id（白名單）
  guardrails: Guardrail[];         // 硬性禁令 / 值域檢查
  requiresHumanReview: (out: O, ctx: RunContext) => boolean; // HR 觸發判斷
  evalMetrics: string[];           // EvalRun 指標名
}

export interface AgentRunResult<O> {
  runId: string;
  agentId: AgentId;
  status: "succeeded" | "failed" | "needs_human";
  output?: O;                      // schema-valid
  confidence?: number;             // 0..1，Agent 自評
  cost: { inputTokens: number; outputTokens: number; usd: number };
  latencyMs: number;
  traceId: string;
  contextSnapshotId: string;
}
```

### 7.1.3 Harness 是唯一入口

沒有任何程式碼可以「自己 fetch 一個模型 API」。所有模型呼叫走 `Harness.run(agentDef, input, ctx)`，它保證：

1. **Schema 驗證**：output 必過 `outputSchema.parse()`，失敗自動 repair 重試。
2. **Token 記帳**：每個 run 都有 cost，寫進 `AgentRun`（合約 §0.4 第 12 層 Observability）。
3. **Tool 白名單**：`tool_use` 只准命中 `def.tools` / `def.connectors`；越權即 `deny`（見 §7.5）。
4. **Trace**：每個 run 有 `traceId`，串起 `LoopExecution → LoopStep → AgentRun`。

### 7.1.4 失敗與重試（Harness 通則）

| 失敗類型 | 策略 |
|---|---|
| Schema 不合規 | 附上錯誤訊息做 **repair prompt**，重試 ≤2 次；仍失敗 → `status=failed` + 開 Task |
| 模型逾時 / 5xx | 指數退避重試（1s→4s→10s，≤3 次） |
| 低信心（`confidence < threshold`） | 不重試，直接 `needs_human` → 開 HumanReview |
| Tool/Connector deny | 不重試，`status=failed`，寫 AuditLog，升級 HR 或 Task |
| 連續失敗達門檻 | Loop 進 `failed`，LINE 通知老闆（`line` connector） |

---

## 7.2 統一的 Agent 契約模板 (The Agent Contract Template)

**每個 Agent 都照這 11 格填。** 這是全書 Agent 的權威模板，附錄 H 收錄空白版。

| 欄位 | 說明 |
|---|---|
| **1. id / 代號** | 合約 §0.6 的代號，如 `vision` |
| **2. 角色 (role)** | 一句話單一職責 |
| **3. system prompt 要點** | 角色、任務、**輸出契約**、禁令、信心自評規則 |
| **4. model** | `MODELS.REASONING` / `VISION` / `FAST` |
| **5. input schema** | TS type（來自哪個 Entity 快照） |
| **6. output schema** | TS type（產出哪個 Entity） |
| **7. tools / skills** | 可呼叫的 Skill id 白名單 |
| **8. connectors** | 可用 Connector id 白名單（多數 Agent = 空） |
| **9. guardrails** | 硬性禁令、值域、必填欄、合規詞庫 |
| **10. 需要 HR？** | 觸發條件（何時 `requiresHumanReview` 回 true） |
| **11. eval 指標** | EvalRun 評分維度 |

> 共同 guardrails（所有 Agent 適用）：**(a) 不得直接 fetch 外部 API；(b) 不得輸出契約以外的欄位；(c) 不確定就降信心而非編造；(d) 不得執行不可逆動作（那是 Permission/HR 的事）。**

---

## 7.3 逐一設計 7 個 Agent

### 7.3.1 Vision Agent (`vision`)

| 欄位 | 內容 |
|---|---|
| **id** | `vision` |
| **角色** | 看照片：辨識品牌、品類、顏色、瑕疵、附件、可信度。只描述**看得到的事實**。 |
| **system prompt 要點** | 你是二手商品鑑定的視覺分析師；只描述照片中看得到的；每個屬性附 0–1 信心；看不清就標 `uncertain` 並降信心；**不得猜品牌、不得估價、不得寫文案**。 |
| **model** | `MODELS.VISION` |
| **input** | `VisionInput`（`ProductPhoto` 快照） |
| **output** | `VisionResult` |
| **tools/skills** | `detect-brand-logo`, `assess-condition`（純視覺輔助 skill） |
| **connectors** | 無（照片由 Loop 前置的 `drive` connector 取得，非 Agent 直取） |
| **guardrails** | 品牌須來自 `Brand` 白名單否則標 `brand_guess=true`；瑕疵須引用可見區域；禁止估價/文案 |
| **需要 HR？** | 否。但 `overallConfidence < 0.6` 或 `brand_guess=true` → 升級（開 Task 補件或 HR） |
| **eval 指標** | `brand_accuracy`, `category_accuracy`, `defect_recall`, `calibration`（信心校準） |

```ts
// schema：packages/domain/src/<context>/schema.ts；Agent 定義：packages/domain/src/agent/agents/vision.ts（R4 定案）
export interface VisionInput {
  photoId: string;
  imageUrl: string;          // Supabase Storage signed URL
  knownBrands: string[];     // Brand 白名單
  knownCategories: string[]; // Category 白名單
}

export interface VisionResult {
  brand: { value: string | null; confidence: number; isGuess: boolean };
  category: { value: string | null; confidence: number };
  colors: { name: string; confidence: number }[];
  attachments: string[];      // 附件：防塵袋 / 盒 / 保卡 …
  defects: { type: string; area: string; severity: "minor"|"moderate"|"major"; confidence: number }[];
  overallConfidence: number;  // 0..1
  notes: string | null;
}
```

**範例 prompt 骨架**
```
[system]
你是二手精品的視覺鑑定師。只描述照片中「看得到」的事實。
規則：
- 每個屬性給 0..1 confidence；看不清標 uncertain 並降低 confidence。
- brand 只能從 <knownBrands> 選；若像但不在清單，isGuess=true。
- defects 必須指出可見區域（area）。
- 嚴禁：估價、寫文案、猜測看不到的資訊。
輸出：嚴格符合 VisionResult JSON schema，不要多餘欄位。

[user]
商品照片：<image>
knownBrands: {{knownBrands}}
knownCategories: {{knownCategories}}
```

### 7.3.2 OCR Agent (`ocr`)

| 欄位 | 內容 |
|---|---|
| **id** | `ocr` |
| **角色** | 抽文字：吊牌/型號/序號/尺寸/成分。逐字抽取，不腦補。 |
| **system prompt 要點** | 逐字抽取照片上的文字；分類到 model/serial/size/material/tag；讀不出的欄位留 null 並記錄原因；**不得翻譯、不得推論未印出的資訊**。 |
| **model** | `MODELS.FAST`（低信心區塊由 `MODELS.VISION` 後援） |
| **input** | `OCRInput`（`ProductPhoto` 快照） |
| **output** | `OCRResult` |
| **tools/skills** | `normalize-size`, `parse-material`（正規化 skill） |
| **connectors** | 無 |
| **guardrails** | 只輸出照片上實際出現的字元；序號格式不符標 `lowConfidence`；禁止補齊/翻譯 |
| **需要 HR？** | 否。序號/型號 `confidence < 0.5` → 開補件 Task |
| **eval 指標** | `char_error_rate`, `field_extraction_accuracy`, `serial_precision` |

```ts
// schema：packages/domain/src/<context>/schema.ts；Agent 定義：packages/domain/src/agent/agents/ocr.ts（R4 定案）
export interface OCRInput { photoId: string; imageUrl: string; hint?: "tag"|"label"|"serial"; }

export interface OCRResult {
  rawText: string;
  fields: {
    model:    { value: string | null; confidence: number };
    serial:   { value: string | null; confidence: number };
    size:     { value: string | null; confidence: number };
    material: { value: string | null; confidence: number };
  };
  language: string | null;
  lowConfidence: boolean;
}
```

**範例 prompt 骨架**
```
[system]
你是 OCR 抽取器。只輸出照片上「實際印出」的文字，逐字抹寫。
- 分類到 model / serial / size / material。
- 讀不出的欄位 = null，並讓 lowConfidence=true。
- 嚴禁翻譯、補齊、推論沒印出來的資訊。
輸出：嚴格符合 OCRResult JSON schema。
[user]
照片：<image> ；hint：{{hint}}
```

### 7.3.3 Price Agent (`price`)

| 欄位 | 內容 |
|---|---|
| **id** | `price` |
| **角色** | 估價：給建議售價、區間、理由、信心。**只提議，不套用。** |
| **system prompt 要點** | 綜合商品卡 + 市場記憶（Memory recall 的成交價/同類行情）給建議售價與區間；列出理由（品牌/成色/附件/稀有度）；金額用整數最小貨幣單位；不確定給寬區間並降信心。 |
| **model** | `MODELS.REASONING` |
| **input** | `PriceInput`（`Product` 快照 + Memory recall） |
| **output** | `PriceSuggestion` |
| **tools/skills** | `recall-comparable-sales`（查 Memory）, `estimate-price` |
| **connectors** | 無 |
| **guardrails** | `suggestedAmount` 必落在 `[minAmount, maxAmount]`；金額整數；理由至少 2 條；禁止直接改 `Price`（那是 publisher/HR 後的動作） |
| **需要 HR？** | **是**，當 `suggestedAmount > 高價門檻`（如 NT$30,000）**或** `confidence < 0.6`（合約 §0.6、§0.9） |
| **eval 指標** | `price_mape`（與實際成交誤差）, `range_coverage`, `calibration` |

```ts
// schema：packages/domain/src/<context>/schema.ts；Agent 定義：packages/domain/src/agent/agents/price.ts（R4 定案）
export interface PriceInput {
  productId: string;
  productCard: { brand: string|null; category: string|null; condition: string; attachments: string[]; defects: string[] };
  comparableSales: { amount: number; currency: string; soldAt: string; source: "memory"|"market" }[];
  currency: string; // "TWD"
}

export interface PriceSuggestion {
  productId: string;
  suggestedAmount: number;   // 整數，最小貨幣單位（合約 §0.10）
  minAmount: number;
  maxAmount: number;
  currency: string;          // char(3)
  reasons: string[];         // ≥2 條
  confidence: number;        // 0..1
  requiresHumanReview: boolean; // Agent 自評 + 門檻
}
```

**範例 prompt 骨架**
```
[system]
你是二手定價分析師。輸出「建議」而非「決定」。
- 綜合商品卡 + comparableSales 給 suggestedAmount 與 [minAmount,maxAmount]。
- 金額用整數（最小貨幣單位）。至少列 2 條 reasons。
- 不確定 → 放寬區間並降低 confidence。
- 若 suggestedAmount > {{highValueThreshold}} 或 confidence < 0.6 → requiresHumanReview=true。
- 嚴禁：直接改價、發佈、寫文案。
輸出：嚴格符合 PriceSuggestion JSON schema。
[user]
商品卡：{{productCard}}
可比成交：{{comparableSales}}
高價門檻：{{highValueThreshold}} {{currency}}
```

### 7.3.4 Marketing Agent (`marketing`)

| 欄位 | 內容 |
|---|---|
| **id** | `marketing` |
| **角色** | 寫文案：FB 貼文、標題、hashtag、賣點。 |
| **system prompt 要點** | 依商品卡 + 定價寫 FB 貼文；語氣符合品牌調性；標題吸睛不誇大；賣點基於事實（不得杜撰未驗證的功能/來源）；產出 hashtag；**不得含合規禁詞**（保證正品絕對、醫療療效等）。 |
| **model** | `MODELS.REASONING` |
| **input** | `MarketingInput`（`Product` + `PriceSuggestion`） |
| **output** | `MarketingDraft`（= `Listing` draft） |
| **tools/skills** | `compose-fb-post`, `generate-hashtags` |
| **connectors** | 無（**不發佈**，發佈是 `publisher`） |
| **guardrails** | 賣點須對應商品卡事實；禁合規禁詞庫命中；長度上限；emoji 節制 |
| **需要 HR？** | **是（首次上架）**（合約 §0.6）；同商品後續改版可依 policy 放寬 |
| **eval 指標** | `factuality`（賣點對照事實）, `compliance_pass_rate`, `ctr_proxy`（人審評分） |

```ts
// schema：packages/domain/src/<context>/schema.ts；Agent 定義：packages/domain/src/agent/agents/marketing.ts（R4 定案）
export interface MarketingInput {
  productId: string;
  productCard: Record<string, unknown>;
  price: { amount: number; currency: string };
  brandVoice?: string;
}

export interface MarketingDraft {   // → Listing (status: draft)
  productId: string;
  title: string;
  body: string;               // FB 貼文本文
  sellingPoints: string[];    // 賣點，逐條可對應事實
  hashtags: string[];
  complianceFlags: string[];  // 命中的疑慮詞（理想為空）
  requiresHumanReview: boolean;
}
```

**範例 prompt 骨架**
```
[system]
你是二手精品的社群文案。寫給 Facebook 買家。
- 依商品卡 + 定價寫 title / body / sellingPoints / hashtags。
- 每條賣點都要能對應商品卡事實，不得杜撰來源或功能。
- 嚴禁合規禁詞：{{bannedTerms}}（命中要放進 complianceFlags）。
- 語氣：{{brandVoice}}。長度上限 {{maxLen}}。
- 這是「草稿」，不發佈。首次上架 requiresHumanReview=true。
輸出：嚴格符合 MarketingDraft JSON schema。
[user]
商品卡：{{productCard}} ；定價：{{price}}
```

### 7.3.5 Reviewer Agent (`reviewer`)

| 欄位 | 內容 |
|---|---|
| **id** | `reviewer` |
| **角色** | 品管：自動審商品卡完整性、文案合規、價格合理性，決定 `pass` 或 `reject` + 理由。**它是自動審關卡，本身不需 HR。** |
| **system prompt 要點** | 逐項檢查（完整性/合規/價格合理/照片充分）；每項給 pass/fail + 理由；任一致命項 fail → 整體 reject；輸出可回退到哪個 stage。 |
| **model** | `MODELS.FAST`（規則層）+ `MODELS.REASONING`（爭議項） |
| **input** | `ReviewInput`（商品卡草稿 + `MarketingDraft` + `PriceSuggestion`） |
| **output** | `ReviewResult` |
| **tools/skills** | `check-card-completeness`, `check-compliance`, `check-price-sanity` |
| **connectors** | 無 |
| **guardrails** | 判斷須逐項附理由；不得放行 `complianceFlags` 非空者；不得放行缺必填欄的商品卡 |
| **需要 HR？** | — （它就是自動審；`reject` 回退 Loop，`escalate` 才轉 HR） |
| **eval 指標** | `precision`（誤放行率）, `recall`（誤退回率）, `agreement_with_human` |

```ts
// schema：packages/domain/src/<context>/schema.ts；Agent 定義：packages/domain/src/agent/agents/reviewer.ts（R4 定案）
export interface ReviewInput {
  productId: string;
  card: Record<string, unknown>;
  marketing: MarketingDraft;
  price: PriceSuggestion;
}

export interface ReviewResult {
  productId: string;
  decision: "pass" | "reject" | "escalate";
  checks: { name: string; status: "pass"|"fail"; reason: string }[];
  reworkStage?: "assemble" | "compose" | "price"; // reject 時回退到哪
  escalateReason?: string;                          // escalate → HR 用
}
```

**範例 prompt 骨架**
```
[system]
你是上架前品管。逐項檢查並決定 pass / reject / escalate。
檢查項：完整性(必填欄) / 合規(禁詞) / 價格合理(落在區間) / 照片充分。
- 每項給 status + reason。
- 任一致命項 fail → decision=reject，並指出 reworkStage。
- 有風險但需人判斷 → decision=escalate + escalateReason。
輸出：嚴格符合 ReviewResult JSON schema。
[user]
商品卡：{{card}} ；文案：{{marketing}} ；定價：{{price}}
```

### 7.3.6 Publisher Agent (`publisher`)

| 欄位 | 內容 |
|---|---|
| **id** | `publisher` |
| **角色** | 發佈：把通過的 Listing 送上 FB、記錄結果。**唯一會產生外部副作用的 Agent。** |
| **system prompt 要點** | 只在收到 `approved` Listing 時發佈；透過 `facebook` connector 呼叫；記錄回傳的 post id 與結果；失敗要回報不重複發。 |
| **model** | `MODELS.FAST`（多為工具編排，非長推理） |
| **input** | `PublishInput`（approved `Listing`） |
| **output** | `PublishResult`（`Listing.published` + FB post id） |
| **tools/skills** | `publish-fb-post`（薄封裝，實際走 connector） |
| **connectors** | **`facebook`**（唯一有 connector 的 Agent；合約 §0.8） |
| **guardrails** | 只接受 `listing_status=approved`；**發佈前必過 PolicyEngine**（見 §7.5）；冪等（同 Listing 不重發，用 idempotency key） |
| **需要 HR？** | 否；**但受 Permission 管**——policy 可設 `require_human`（合約 §0.6、§0.9） |
| **eval 指標** | `publish_success_rate`, `idempotency_violations`（應為 0）, `policy_deny_rate` |

```ts
// schema：packages/domain/src/<context>/schema.ts；Agent 定義：packages/domain/src/agent/agents/publisher.ts（R4 定案）
export interface PublishInput {
  listingId: string;
  productId: string;
  status: "approved";        // 只接受 approved
  content: { title: string; body: string; hashtags: string[]; mediaUrls: string[] };
  idempotencyKey: string;    // 冪等：= listingId + version
}

export interface PublishResult {
  listingId: string;
  published: boolean;
  externalPostId: string | null; // FB post id
  publishedAt: string | null;
  error?: string;
}
```

**範例 prompt 骨架**
```
[system]
你是發佈執行器。只在 status=approved 時執行。
- 呼叫 publish-fb-post（內部走 facebook connector），帶 idempotencyKey。
- 記錄 externalPostId 與 publishedAt。
- 失敗 → published=false + error，不得重試發佈（交給 Harness）。
- 嚴禁：改內容、改價、直接 fetch FB API。
輸出：嚴格符合 PublishResult JSON schema。
[user]
Listing：{{listing}}
```
> 注意：`publisher` 的模型主要負責「決定要不要發、組什麼參數」。真正的 HTTP 動作在 `facebook` connector，且**發佈前 Harness 會先問 PolicyEngine**。

### 7.3.7 Memory Agent (`memory`)

| 欄位 | 內容 |
|---|---|
| **id** | `memory` |
| **角色** | 記憶：從成交/詢問/售後萃取可重用事實，寫入 `Memory`。 |
| **system prompt 要點** | 從事件抽「跨執行可重用」的事實（成交價區間、熱門品牌、常見問題、售後模式）；分類 fact/preference/feedback/reference；產生 slug 與 `[[link]]`；**不寫一次性、不寫 PII 明碼**。 |
| **model** | `MODELS.REASONING` |
| **input** | `MemoryInput`（`Order`/`Inquiry`/`AfterSale` 事件） |
| **output** | `MemoryDraft[]`（→ `Memory` records） |
| **tools/skills** | `extract-fact`, `link-memory`（產生 MemoryLink） |
| **connectors** | 無 |
| **guardrails** | 只萃取可重用事實；PII 去識別化；每筆須可溯源（來源 event id）；寫入 Memory **受 Permission 管**（見 §7.5） |
| **需要 HR？** | 否（但敏感類別如客訴 → policy 可設 `require_human`） |
| **eval 指標** | `fact_reusability`（人審抽樣）, `dedup_rate`, `link_precision` |

```ts
// schema：packages/domain/src/<context>/schema.ts；Agent 定義：packages/domain/src/agent/agents/memory.ts（R4 定案）
export interface MemoryInput {
  sourceType: "order" | "inquiry" | "aftersale";
  sourceId: string;
  payload: Record<string, unknown>;
}

export interface MemoryDraft {          // → Memory
  slug: string;                          // kebab-case
  kind: "fact" | "preference" | "feedback" | "reference";
  content: string;                       // 去識別化
  links: string[];                       // [[slug]] → MemoryLink
  sourceRef: { type: string; id: string };
  confidence: number;
}
```

**範例 prompt 骨架**
```
[system]
你是記憶萃取器。只保留「未來還會用到」的事實。
- 分類 fact / preference / feedback / reference。
- 產生 kebab-case slug 與 [[slug]] 關聯。
- PII（姓名/電話/地址）一律去識別化。
- 每筆註明 sourceRef（可溯源）。丟棄一次性瑣事。
輸出：MemoryDraft[]，嚴格符合 schema。
[user]
事件：{{sourceType}} #{{sourceId}}
payload：{{payload}}
```

---

## 7.4 Human Review (HR)：關卡，不是 Agent

**HR 不是 Agent，是 Workflow 中的一道關卡。** 它把 `LoopExecution` 從 `running` 轉到 `waiting_human`，等人在 UI 決策後轉回 `running`（合約 §0.11）。對應合約 §0.11 `human_review_status` 與**附錄 K**（Human Review Checklist）。

### 7.4.1 觸發條件 (Triggers)

HR 由 **Reviewer Agent 的 `escalate`** 或 **PolicyEngine 回傳 `require_human`** 觸發。SHAP 主流程中的觸發點：

| 觸發來源 | 條件 | 對應 stage |
|---|---|---|
| `price` | `suggestedAmount > 高價門檻` 或 `confidence < 0.6` | `[human-review]` |
| `marketing` | **首次上架** | `[human-review]` |
| `reviewer` | `decision=escalate`（合規/價格爭議） | `[human-review]` |
| `publisher` | policy = `require_human`（例：新 FB 粉專首發） | `[publish]` 前 |
| `memory` | 敏感類別（客訴事實）依 policy | `[remember]` |
| `gap-check` | 缺必填資料需人補件 | `[gap-check]` |

### 7.4.2 Payload（要給人看什麼）

`HumanReview` entity 的 payload 必須讓人**在一個畫面內就能決策**：

```ts
// packages/governance/human-review/schema.ts
export interface HumanReviewPayload {
  reviewId: string;
  targetType: "price_suggestion" | "listing_draft" | "review_escalation" | "publish" | "memory";
  targetId: string;
  loopExecutionId: string;             // 回寫用
  reason: string;                      // 為什麼需要人看
  summary: string;                     // 一句話重點
  proposal: Record<string, unknown>;   // AI 的提議（價格/文案…）
  evidence: {                          // 佐證，讓人快速判斷
    photos: string[];
    productCard: Record<string, unknown>;
    agentRuns: { agentId: AgentId; output: unknown; confidence: number }[];
    comparableSales?: unknown[];
  };
  suggestedActions: ("approve" | "reject" | "edit")[];
  deadline: string;                    // 逾時時間
}
```

### 7.4.3 人可做的動作與回寫

| 動作 | 語意 | `human_review_status` | 回寫效果 |
|---|---|---|---|
| **approve** | 同意 AI 提議 | `approved` | 提議套用；LX `waiting_human → running` 續走下一 stage |
| **reject** | 否決 | `rejected` | 依 `reworkStage` 回退 Loop（或整條 fail） |
| **edit** | 修改後同意 | `edited` | 用人改後的值覆蓋 proposal，套用並續走；差異寫 AuditLog |
| （逾時） | 未處理 | `expired` | 見 §7.4.4 |

回寫流程（Harness / LoopRunner 負責）：

```
人在 UI 按下 → 更新 HumanReview.status
   → 寫 AuditLog(actor=human, action, before/after)
   → 更新 LoopExecution: waiting_human → running（approve/edit）
                        或 → running 回退 reworkStage（reject）
   → 若 edited：把人改後的值寫回對應 Entity（PriceSuggestion/Listing…）
   → 續跑 Loop
```

```ts
export interface HumanReviewDecision {
  reviewId: string;
  actorId: string;                 // human user
  action: "approve" | "reject" | "edit";
  editedProposal?: Record<string, unknown>; // action=edit 時
  note?: string;
}
```

### 7.4.4 逾時策略 (Timeout)

- 每個 HR 有 `deadline`（依 targetType 設；如發佈類 24h、補件類 72h）。
- 逾時 → `human_review_status = expired`。預設處理：
  - **保守預設**：`expired` 視同 `reject`（不放行有副作用的動作）→ LX 回退或 `failed`，並 LINE 通知老闆。
  - **可放行類**（低風險，如非首次文案改版）：policy 可設 `expired → auto-approve`，但必寫 AuditLog 標記 `auto_approved_on_timeout`。
- 逾時前送提醒：`deadline - 6h` 透過 `line` connector 推播。

> 完整人審清單（每種 targetType 要檢查什麼）見**附錄 K**。

---

## 7.5 Permission：兩道防線

依合約 §0.9，Permission = **RLS（資料級）+ PolicyEngine（動作級）** 兩道防線。原則：**AI 可提議任何事，但有外部副作用或不可逆的動作預設要 Permission 檢查或 HR。**

### 7.5.1 第一道：Supabase RLS（資料級）

- 所有 table 預設 `deny`，逐表寫 policy（Policy schema 見 `docs/06`）。
- 兩種 Actor：`human`（Supabase Auth user）與 `agent`（system identity）。
- Agent 以受限 service identity 連線，**只能存取其職責所需的 table**（如 `vision` 不能寫 `orders`）。
- RLS 擋「能不能讀/寫這筆資料」；**擋不了「能不能做這個動作」**——那是第二道防線的事。

### 7.5.2 第二道：PolicyEngine（動作級）

PolicyEngine 在**每個有副作用的動作前**被 Harness 呼叫。

**判斷輸入：**
```ts
// packages/governance/policy/schema.ts
export interface PolicyRequest {
  actor:    { type: "human" | "agent" | "system"; id: string; role?: string };
  action:   string;   // e.g. "listing.publish" | "price.apply" | "customer.reply"
  resource: { type: string; id: string; ownerId?: string };
  context:  {
    amount?: number;          // 改價/成交金額（整數）
    currency?: string;
    isFirstPublish?: boolean;
    confidence?: number;      // 觸發 Agent 的信心
    channel?: string;         // fb / line …
    [k: string]: unknown;
  };
}
```

**回傳：**
```ts
export type PolicyDecision =
  | { effect: "allow"; policyId: string }
  | { effect: "deny";  policyId: string; reason: string }
  | { effect: "require_human"; policyId: string; reason: string; reviewTemplate: string };
```

- `allow` → 動作放行。
- `deny` → 動作中止，寫 AuditLog，升級 Task/HR。
- `require_human` → 開 `HumanReview`，LX 進 `waiting_human`（接回 §7.4）。

**評估順序**：`deny` 優先 → `require_human` → `allow`；命中最具體規則者勝，全不命中 → **預設 deny**（fail-closed）。

### 7.5.3 關鍵策略清單（action → 預設 policy）

| action | 說明 | 預設 policy | 條件 / 門檻 |
|---|---|---|---|
| `listing.publish` | 發佈到 FB | `require_human`（首次） / `allow`（後續同粉專） | `isFirstPublish=true` → `require_human` |
| `price.apply` | 套用定價到 Product | `allow`（≤ 門檻） / `require_human`（> 門檻） | `amount > NT$30,000` 或 `confidence < 0.6` → `require_human` |
| `price.change` | 改已上架商品價格 | `require_human`（超門檻幅度） | 調幅 `> ±20%` 或跨門檻 → `require_human` |
| `customer.reply` | 代客戶回覆訊息 | `require_human`（MVP） | MVP 半自動：AI 起草 → 人送出；成熟後放寬低風險模板 |
| `resource.delete` | 刪除 Product/Listing/Memory | `require_human` | 一律人審（不可逆） |
| `memory.write` | 寫入 Memory | `allow`（fact/reference） / `require_human`（feedback 敏感） | 客訴/負面回饋類 → `require_human` |
| `fb.reply_comment` | 回 FB 留言 | `require_human`（MVP） | 同 `customer.reply` |
| `drive.read` | 讀 Drive 照片 | `allow` | 唯讀，低風險 |

> 門檻值（NT$30,000、±20%…）存在 `Policy` 設定，不硬寫在程式；本表為預設值，可依老闆偏好調整。

### 7.5.4 Agent 越權防護

- Harness 在收到模型的 `tool_use` 時，先比對 `def.tools` / `def.connectors` 白名單；不在白名單 → 直接 `deny`（不呼叫模型再問一次）。
- 任何 connector 呼叫都帶 `actor=agent`，connector 層再做一次 PolicyEngine 檢查（縱深防禦）。
- 所有 `deny` / `require_human` 都寫 `AuditLog`，供 Observability 追蹤。

---

## 7.6 多 Agent 協作：在 SHAP 主流程中誰呼叫誰

對照合約 §0.7 `product-lifecycle` Workflow。**協調者是 `LoopRunner`（不是某個 Agent）**；Agent 之間**不直接互呼**，而是由 Loop 把上一步 `AgentRun` 的 output 當下一步的 input。

```
[perceive]     LoopRunner 並行派 ocr ‖ vision （sub-agent，各自獨立 context）
      ↓        合流：OCRResult + VisionResult
[assemble]     Skill: assemble-product-card（非 Agent，純函式合併）
      ↓
[gap-check]    缺件 → Task / HumanReview（補件）
      ↓
[price]        LoopRunner 派 price（吃商品卡 + memory recall）→ PriceSuggestion
      ↓        price.requiresHumanReview → PolicyEngine(price.apply)
[compose]      LoopRunner 派 marketing（吃商品卡 + 定價）→ MarketingDraft
      ↓
[review]       LoopRunner 派 reviewer → pass / reject / escalate
      ↓        reject → 回退 reworkStage；escalate → HR
[human-review] 依 §7.4 觸發（高風險）
      ↓
[publish]      LoopRunner 派 publisher → PolicyEngine(listing.publish)
      ↓        allow → facebook connector 發佈；require_human → HR
[engage]       Inquiry 進來（MVP 半自動：AI 起草 → customer.reply 走 HR）
[close/aftersale]
[remember]     LoopRunner 派 memory → PolicyEngine(memory.write) → Memory
```

**委派 sub-agent 規則（合約 §0.4 第 8 層）：**
- 主流程（`LoopRunner`）委派 sub-agent 時，給它**獨立的 ContextSnapshot**（只含它需要的事實，最小權限）。
- sub-agent 的 output 經 schema 驗證後，才回主流程；主流程不信任未驗證輸出。
- sub-agent 一樣受 tool/connector 白名單與 PolicyEngine 約束。

**避免越權的三條硬規則：**
1. **Agent 不得直接呼叫外部 API** —— 一律走 Connector（合約 §0.8）；Harness 攔截未授權 `tool_use`。
2. **Agent 之間不直接互呼** —— 由 Loop 傳遞資料，避免隱藏依賴與權限繞過。
3. **有副作用的動作先過 PolicyEngine** —— 發佈/改價/回覆/刪除/敏感記憶寫入，一律先問（§7.5.3）。

---

## 本章交付物 (Deliverables)

1. `packages/harness/` —— `Harness.run()`：ContextSnapshot → Prompt → 模型 → schema 驗證 → 記帳 → 輸出，含重試/逾時（§7.1）。
2. `packages/domain/src/agent/agents/{vision,ocr,price,marketing,reviewer,publisher,memory}.ts` —— 7 個 Agent 定義（照 §7.2 模板 11 格）；各 Agent 的 I/O schema 放對應 context package（`perception`/`pricing`/`channel`/`review`…）的 `schema.ts`（Zod + z.infer 型別）；prompt 放 `@jbg/prompts`。（R4 定案，依附錄 A 分層）
3. `packages/governance/human-review/` —— `HumanReviewPayload` / `HumanReviewDecision` 型別 + 回寫 LX 的 `resolveHumanReview()`（§7.4）。
4. `packages/governance/policy/` —— `PolicyEngine`：`PolicyRequest → PolicyDecision`，含 §7.5.3 關鍵策略清單的預設規則（fail-closed）。
5. `MODELS` 常數設定檔（`MODELS.REASONING/VISION/FAST`，值來自 env，不硬寫模型 id）。
6. 每個 Agent 的 `EvalRun` 指標定義（§7.3 各表最後一列）。
7. 對外文件交叉引用：HR 清單 → 附錄 K；Agent 空白模板 → 附錄 H；Connector 規範 → 附錄 F；Policy schema → `docs/06`。

## 驗收條件 (Acceptance Criteria)

- [ ] 7 個 Agent 代號與職責與合約 §0.6 完全一致（`vision/ocr/price/marketing/reviewer/publisher/memory`）。
- [ ] 每個 Agent 都有 **Zod 驗證的 output schema**；Harness 對不合規輸出會 repair 重試 ≤2 次，仍失敗則 `status=failed`。
- [ ] 沒有任何模型 id 被硬寫；全部走 `MODELS.*`。
- [ ] 每個 `AgentRun` 都落庫 `input/output/cost/latency/traceId/contextSnapshotId`（Observability 可回放）。
- [ ] `price`（高價/低信心）、`marketing`（首次上架）、`reviewer`（escalate）能正確觸發 HR，且 LX 狀態依 §0.11 `running → waiting_human → running` 轉移。
- [ ] HR 三動作 `approve/reject/edit` 與逾時 `expired` 都能正確回寫 `LoopExecution` 與 `AuditLog`；`edit` 會覆寫對應 Entity。
- [ ] `PolicyEngine` 對 §7.5.3 清單每個 action 回傳正確 `allow/deny/require_human`；全不命中時 **預設 deny**。
- [ ] 任何 Agent 嘗試呼叫白名單外的 tool/connector 一律被 Harness `deny` 並寫 AuditLog。
- [ ] 只有 `publisher` 掛 `facebook` connector；其餘 Agent 的 `connectors` 為空；無任何 Agent 直接 fetch 外部 API。
- [ ] SHAP 主流程中 Agent 不互呼，皆由 `LoopRunner` 傳遞資料並派 sub-agent（獨立 ContextSnapshot、最小權限）。
