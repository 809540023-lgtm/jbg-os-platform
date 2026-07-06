# 附錄 H · Agent Template

> 本附錄提供一份**可複製的空白 Agent 定義骨架**與填寫指引。
> Agent = Loop Engineering 第 8 層 sub-agent / §0.5 `Agent` entity（Agent Context）；7 個 canonical agent 與代號見 §0.6；統一 I/O 契約的**完整定義**寫在 `docs/07`（AI Agent Architecture）。
> **關係說明**：`docs/07` 是每個 agent 的權威契約內容；**本附錄是可複製的空白骨架**。新增或改寫 agent 時複製本骨架，內容對齊 §0.6 與 docs/07。
> **模型選用鐵律**：模型 id 一律查 `claude-api` 資料、用 `MODELS.REASONING` / `MODELS.VISION` / `MODELS.FAST` 常數指向設定檔，**絕不硬寫版本字串**（§0.3、§0.12-7）。
> 版本：v1.0 · 最後更新：2026-07-07

---

## H.1 Agent 是什麼（快速回顧）

**Agent = 有明確 I/O 契約的 AI 執行單元**（§0.2、§0.5）。它有 system prompt、input/output schema、可用的 tools/skills/connectors、guardrails，一次執行產生一筆 `AgentRun`（含 `ContextSnapshot`、cost、trace）。

- Agent **提議**，不擅自造成不可逆副作用（§0.9）。發佈/改價超門檻/回覆客戶 → 經 Permission / HR。
- Agent 呼叫能力經 **Skill**（附錄 E）；讀寫外部經 **Connector**（附錄 F），**不直接 fetch**。
- Agent 被 **Loop**（附錄 G）編排，也可被主流程委派為 sub-agent（§0.4 第 8 層）。

---

## H.2 空白模板 (Blank Template)

`packages/agents/<agent-code>/definition.ts`，可直接複製：

```ts
// packages/agents/<agent-code>/definition.ts
import { z } from 'zod';
import type { AgentDefinition } from '@jbg/agent-core';
import { MODELS } from '@jbg/config'; // §0.3：常數指向，不硬寫版本字串

/** input / output schema（TS，zod）—— 這是 Agent 的對外契約 */
export const InputSchema = z.object({
  // TODO
});
export type Input = z.infer<typeof InputSchema>;

export const OutputSchema = z.object({
  // TODO；reasoning 型建議附 rationale + confidence
});
export type Output = z.infer<typeof OutputSchema>;

export const definition: AgentDefinition<Input, Output> = {
  // 識別（§0.6 代號 / §0.10 命名）
  id: '<agent-code>',            // 例：vision / ocr / price / marketing / reviewer / publisher / memory
  title: '',

  // System prompt 骨架（版本化，對應 §0.5 Prompt entity）
  prompt: {
    id: '<agent-code>@1',        // promptId，破壞性變更 → 升號（§H.5）
    skeleton: `
[ROLE] 你是 …，單一職責是 …（§0.6 不越界）。
[TASK] 給定 <input>，產出 <output>。
[FACTS] {{context}}   ← 由 ContextBuilder 注入（RAG / memory / entity 快照）
[OUTPUT CONTRACT] 僅輸出符合 OutputSchema 的 JSON。
[GUARDRAILS] {{guardrails}}
`.trim(),
  },

  inputSchema: InputSchema,
  outputSchema: OutputSchema,

  // 可用的 skills / tools（附錄 E）
  skills: [/* 'estimate-price', ... */],
  // 可用的 connectors（附錄 F；只讀或讀寫依職責）
  connectors: [/* 'facebook', ... */],

  // 模型選用 —— 用常數（§0.3）
  model: MODELS.REASONING,       // vision 型用 MODELS.VISION；輕量分類/抽取用 MODELS.FAST
  modelParams: { temperature: 0.2, maxOutputTokens: 1024 },

  // guardrails（合規 / 禁止事項 / 輸出約束）
  guardrails: {
    mustNot: [/* '自行發佈到外部', '硬寫價格門檻' */],
    outputValidatedBySchema: true,
  },

  // 是否需要 Human Review（§0.6 / §0.9）
  humanReview: {
    required: false,
    // when: (out) => out.confidence < 0.6 || out.amount > THRESHOLD,
  },

  // Eval 指標（§0.5 EvalRun）
  eval: {
    metrics: [/* 'schema_valid_rate', 'human_override_rate', 'confidence_calibration' */],
    goldenSet: 'packages/agents/<agent-code>/golden/*.json',
  },

  // 成本 / 延遲預期（供觀測告警門檻，§0.4 第 12 層）
  expectations: { p50LatencyMs: 0, p95LatencyMs: 0, avgCostMicroUsd: 0 },

  // 失敗與升級策略
  onFailure: {
    strategy: 'retry_then_escalate' as
      | 'retry_then_escalate'
      | 'escalate'
      | 'fallback_model'
      | 'open_task',
    // fallbackModel: MODELS.FAST,
    escalateTo: 'human_review' as 'human_review' | 'task' | 'parent_loop',
  },
};

export default definition;
```

> `ContextSnapshot`（§0.5）掛點：每次 `AgentRun` 由 `ContextBuilder` 把 `{{context}}` 實際填入的內容存成 `ContextSnapshot`，供回放與 eval。Agent 定義本身只宣告「需要哪些 context 來源」，實際內容執行期注入。

---

## H.3 填寫指引（每欄怎麼填）

| 欄位 | 怎麼填 |
|---|---|
| `id` | §0.6 的 7 個代號之一（新 agent 需先加進 §0.6 才能用）。 |
| `prompt.id` | `<agent-code>@<n>`，版本化（§H.5）；prompt 本體存 `packages/prompts/`（§0.4 第 1 層）。 |
| `inputSchema`/`outputSchema` | 對齊 §0.6 的「主要輸入/輸出」與 §0.5 entity（如 price 輸出對應 `PriceSuggestion`）。 |
| `skills` | 只列真的會用到的 skill id（附錄 E）。編排/計算儘量下放 skill，prompt 只做判斷。 |
| `connectors` | 依職責，讀寫分明（perception 型通常無 connector；publisher 需 `facebook` 寫）。 |
| `model` | **只填常數**：推理→`MODELS.REASONING`、看圖→`MODELS.VISION`、輕量→`MODELS.FAST`。查 `claude-api` skill 決定常數對應哪個實際 id，寫在設定檔，**不寫進這裡**。 |
| `humanReview` | 對「不可逆/高風險/低信心」設條件（§0.9）。例：price 高價或低信心 → HR；marketing 首次上架 → HR（§0.6）。 |
| `eval.metrics` | 至少 schema 合法率 + 人類覆寫率；reasoning 型加信心校準。 |
| `expectations` | 填 p50/p95 延遲與均價，作為觀測告警門檻；上線後回填實測。 |
| `onFailure` | 定義重試/降級/升級：先重試 → 不行則 `fallback_model` 或升級 `human_review`/`task`。 |

---

## H.4 填好的範例 — `price`（Price Agent 骨架）

**情境**：§0.6 `price`。輸入 `Product` + 市場記憶，輸出 `PriceSuggestion`（建議售價/區間/理由/信心）。高價或低信心 → HR（§0.6、§0.9）。內部用 `estimate-price` skill（附錄 E.4）。

```ts
// packages/agents/price/definition.ts
import { z } from 'zod';
import type { AgentDefinition } from '@jbg/agent-core';
import { MODELS } from '@jbg/config';

export const InputSchema = z.object({
  productId: z.string().uuid(),
  brand: z.string(),
  category: z.string(),
  condition: z.enum(['new', 'like_new', 'good', 'fair']),
  // 市場記憶由 ContextBuilder 從 Memory recall 注入，故此處不含 comparables
});
export type Input = z.infer<typeof InputSchema>;

export const OutputSchema = z.object({
  suggestedAmount: z.number().int(),
  lowAmount: z.number().int(),
  highAmount: z.number().int(),
  currency: z.string().length(3),
  rationale: z.string(),
  confidence: z.number().min(0).max(1),
});
export type Output = z.infer<typeof OutputSchema>; // → 包成 PriceSuggestion（§0.5）

export const definition: AgentDefinition<Input, Output> = {
  id: 'price',
  title: 'Price Agent — 給二手商品建議售價、區間、理由與信心',

  prompt: {
    id: 'price@1',
    skeleton: `
[ROLE] 你是二手/代購商品的定價分析師，單一職責是「估價」，不寫文案、不發佈。
[TASK] 依商品屬性與市場可比價，給出建議售價、合理區間、理由、信心(0-1)。
[FACTS] {{context}}   ← 品牌行情、近期可比成交（Memory recall）、幣別
[OUTPUT CONTRACT] 僅輸出符合 OutputSchema 的 JSON。金額為整數（最小貨幣單位）。
[GUARDRAILS] 不得自行套用價格；不得杜撰不存在的可比價；低信心要如實下調 confidence。
`.trim(),
  },

  inputSchema: InputSchema,
  outputSchema: OutputSchema,

  skills: ['estimate-price'],   // 附錄 E.4
  connectors: [],               // 估價不需對外寫

  model: MODELS.REASONING,      // §0.3：常數，不硬寫版本字串
  modelParams: { temperature: 0.2, maxOutputTokens: 800 },

  guardrails: {
    mustNot: ['自行套用/寫入價格', '杜撰可比價', '硬寫價格門檻於 prompt'],
    outputValidatedBySchema: true,
  },

  humanReview: {
    required: false,
    // 門檻值來自 Policy（§0.9），不硬寫在此
    when: (out) => out.confidence < 0.6, // 高價門檻另由 PolicyEngine 判斷
  },

  eval: {
    metrics: ['schema_valid_rate', 'human_override_rate', 'confidence_calibration', 'price_mae_vs_actual_sold'],
    goldenSet: 'packages/agents/price/golden/*.json',
  },

  expectations: { p50LatencyMs: 1500, p95LatencyMs: 4000, avgCostMicroUsd: 3000 },

  onFailure: {
    strategy: 'retry_then_escalate',
    escalateTo: 'human_review',
  },
};

export default definition;
```

**執行流**：Loop 呼叫 `price` agent → ContextBuilder recall 可比價存 `ContextSnapshot` → agent 用 `estimate-price` skill → 產出 `PriceSuggestion` → 依 `humanReview.when` 或 PolicyEngine（高價門檻，§0.9）決定是否進 HR。

---

## H.5 Prompt 版本化與 ContextSnapshot 掛點

- **Prompt 版本化**：`prompt.id = <agent-code>@<n>`。改動 prompt 語意 / output schema → 升號並保留舊版，讓歷史 `AgentRun` 能用當時 prompt 回放。prompt 本體存 `packages/prompts/`（§0.4 第 1 層，`Prompt` entity §0.5）。
- **ContextSnapshot 掛點**：每次 `AgentRun` 把實際注入 `{{context}}` 的內容（RAG chunks、recall 的 Memory、entity 快照）存成 `ContextSnapshot`（§0.5），供：(1) 事後回放「當時模型看到什麼」；(2) eval 重跑；(3) debug 幻覺來源。
- **模型 id 掛點**：`model` 只存常數；實際解析出的模型 id 由 harness 在 `AgentRun.meta.modelId` 回填，供成本歸因與 migration 稽核。**查 `claude-api` 資料維護 `MODELS.*` → 實際 id 的對應，不在 agent 定義硬寫。**

---

## 本章交付物 (Deliverables)

- 空白 Agent 模板（system prompt 骨架 + I/O schema + skills/connectors + guardrails + HR + eval + 模型常數 + 成本/延遲 + 失敗升級）（§H.2）。
- 逐欄填寫指引（§H.3）。
- 填好的 `price` agent 範例（§H.4）。
- Prompt 版本化與 ContextSnapshot / 模型 id 掛點（§H.5）。

## 驗收條件 (Acceptance Criteria)

一個 Agent 定義可合併，當且僅當：

- [ ] `id` 為 §0.6 合法代號；`prompt.id` 有版本號。
- [ ] `inputSchema` / `outputSchema`（zod）對齊 §0.5 entity 與 §0.6 I/O。
- [ ] `model` **只用 `MODELS.*` 常數**，全檔**無硬寫模型版本字串**；查 `claude-api` 維護對應。
- [ ] 能力經 `skills`、外部讀寫經 `connectors`，**Agent 內無直接 `fetch`**。
- [ ] 有 `guardrails`、`humanReview`（不可逆/高風險/低信心設條件）、`eval.metrics`、`expectations`、`onFailure`。
- [ ] 價格門檻等策略值走 `PolicyEngine`（§0.9），**不硬寫在 prompt/定義**。
- [ ] 有 golden set 供 `EvalRun`；`ContextSnapshot` 掛點就緒。
