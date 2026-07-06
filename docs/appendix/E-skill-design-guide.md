# 附錄 E · Skill Design Guide

> 本附錄定義 JBG OS 中 **Skill**（Loop Engineering 第 6 層，見 `docs/00-canonical-model.md` §0.4）的設計準則、空白模板與真實範例。
> 引用的名詞、Entity（`Skill`, `Agent`, `Connector`）、命名規則一律以 `docs/00-canonical-model.md` 為準。
> 版本：v1.0 · 最後更新：2026-07-07

---

## E.1 什麼是 Skill (What a Skill Is)

**Skill = 可被 Agent 或 Loop 呼叫的、封裝好的能力單元。**（§0.4 第 6 層；§0.5 `Skill` entity，Agent Context。）

一個 Skill 是一段**有明確 I/O 契約的可組合能力**。它可以是：

- **純函式 (pure)**：無副作用、給定 input 必得同一 output（如 `estimate-price` 的計價數學、`normalize-brand-name`）。**優先做成純函式。**
- **模型呼叫型 (model-backed)**：內部經 `harness` 呼叫 Claude（如 `compose-fb-post`、`extract-brand`）。仍要有 schema 契約與 token 記帳。
- **connector 呼叫型 (io-backed)**：內部經某個 Connector 讀寫外部系統。**注意：真正的外部副作用只能在 Connector 發生**（§0.8），Skill 只是把 connector 的呼叫包成語意化能力。

> Skill 的載體：`packages/skills/<skill-id>/`。每個 Skill 一個資料夾，含實作、schema、測試。

### Skill 不是什麼

- **不是 Agent**：Agent 有 system prompt、自主決定用哪些 tool、可多輪推理（見附錄 H）。Skill 是被呼叫的單一能力，不自己決定「要不要做」「做幾次」。
- **不是 Connector**：Connector 是「對某個外部系統的唯一出口」，管憑證/rate limit/重試（見附錄 F）。Skill 是業務語意層，可以*用*一個 connector，但不*是* connector。
- **不是 Loop**：Loop 是有終止條件的多步驟迴圈（見附錄 G）。Skill 是一步。

---

## E.2 Skill 契約 (The Skill Contract)

每個 Skill **必須**宣告以下 8 項。缺任一項不得合併。

| # | 契約項 | 規則 |
|---|---|---|
| 1 | **id** | `kebab-case`、**動詞開頭**（§0.10）。例：`estimate-price`, `compose-fb-post`, `extract-brand`, `normalize-brand-name`。 |
| 2 | **input schema** | 用 `zod` 定義並 export；型別由 `z.infer` 導出。禁止 `any`。 |
| 3 | **output schema** | 同上。output 必為可序列化（能寫進 `LoopStep` / `AgentRun` trace）。 |
| 4 | **副作用宣告 (effects)** | 明寫 `effects: 'none' | 'model' | 'connector' | 'model+connector'`。純函式必須是 `'none'`。 |
| 5 | **模型/connector 依賴** | 若呼叫模型，用 `MODELS.*` 常數（**不硬寫版本字串**，§0.3）；若呼叫 connector，透過注入的 `deps`，不得自行 `fetch`。 |
| 6 | **錯誤語意 (error semantics)** | 用 typed error。區分 `SkillInputError`（呼叫方的錯，不重試）、`SkillTransientError`（可重試）、`SkillFatalError`（不可重試）。 |
| 7 | **冪等 (idempotency)** | 宣告 `idempotent: true | false`。純函式必為 `true`。有副作用者需說明冪等鍵（如 connector 提供的 external id）。 |
| 8 | **可觀測 (observability)** | 回傳 `meta`（tokens/costMicroUsd/latencyMs/modelId），供 §0.4 第 12 層 trace 記帳。 |

### 設計準則 (Design Principles)

1. **純函式優先**：能不呼叫模型就不呼叫。把計算/正規化/格式化抽成純 Skill，模型只做真正需要判斷的部分。
2. **窄輸入、窄輸出**：一個 Skill 做一件事。`estimate-price` 不順便寫文案。
3. **依賴注入**：模型 client 與 connector 都由參數 `deps` 傳入，方便測試 mock（§E.5）。Skill 內部不 `import` 具體 connector 實例。
4. **無隱藏狀態**：Skill 不讀寫全域變數、不快取跨呼叫狀態。需要記憶走 `Memory`（§0.5）由呼叫方提供。
5. **輸出可回放**：output + meta 足以讓人事後理解「為什麼是這個結果」。model-backed skill 建議回傳 `rationale` 與 `confidence`。

---

## E.3 空白模板 (Blank Template)

`packages/skills/<verb-noun>/index.ts` 檔案骨架，可直接複製：

```ts
// packages/skills/<verb-noun>/index.ts
import { z } from 'zod';
import type { SkillDeps, SkillMeta } from '@jbg/skills-core';
import { SkillInputError, SkillTransientError } from '@jbg/skills-core';

/** 1. id — kebab-case、動詞開頭 */
export const SKILL_ID = '<verb-noun>' as const;

/** 2. input schema */
export const InputSchema = z.object({
  // TODO: 定義輸入欄位
});
export type Input = z.infer<typeof InputSchema>;

/** 3. output schema — 必須可序列化 */
export const OutputSchema = z.object({
  // TODO: 定義輸出欄位
  // model-backed 建議附上：
  // rationale: z.string(),
  // confidence: z.number().min(0).max(1),
});
export type Output = z.infer<typeof OutputSchema>;

/** 4. 契約宣告（metadata，供 registry / eval / 文件產生器讀取） */
export const contract = {
  id: SKILL_ID,
  effects: 'none' as 'none' | 'model' | 'connector' | 'model+connector', // 5. 副作用
  idempotent: true,      // 7. 冪等
  usesModel: false,      // 若 true，內部用 MODELS.* 常數
  usesConnectors: [] as string[], // 6/7. 依賴的 connector id
} as const;

/** 主體。deps 注入 model client 與 connectors，方便測試 mock。 */
export async function run(
  rawInput: unknown,
  deps: SkillDeps,
): Promise<{ output: Output; meta: SkillMeta }> {
  // a. 驗證輸入（失敗 → 呼叫方的錯，不重試）
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new SkillInputError(SKILL_ID, parsed.error);
  }
  const input = parsed.data;

  const startedAt = Date.now();

  // b. 核心邏輯（純函式：直接算；model-backed：deps.model.complete(...)；
  //    connector：deps.connectors.<id>.someReadWrite(...)）
  // TODO: 實作

  const output: Output = OutputSchema.parse(/* TODO */ {});

  // c. 回傳 output + 觀測 meta
  return {
    output,
    meta: {
      skillId: SKILL_ID,
      latencyMs: Date.now() - startedAt,
      tokens: 0,           // model-backed 才填
      costMicroUsd: 0,
      modelId: null,       // model-backed 填 MODELS.* 實際解析出的 id
    },
  };
}

// 讓 registry 能自動掛載
export default { contract, InputSchema, OutputSchema, run };
```

> `@jbg/skills-core` 提供 `SkillDeps`（`{ model, connectors, logger }`）、`SkillMeta`、typed errors。所有 Skill 共用同一套 core，確保 harness / eval / trace 能統一處理。

---

## E.4 真實範例 (Worked Example) — `estimate-price`

**情境**：Price Agent（§0.6 `price`）需要一個把「商品屬性 + 市場記憶」轉成「建議售價 + 區間 + 理由 + 信心」的能力。這是 model-backed skill；但可比價的數學（折舊、幣別換算）抽成純子函式。

```ts
// packages/skills/estimate-price/index.ts
import { z } from 'zod';
import type { SkillDeps, SkillMeta } from '@jbg/skills-core';
import { SkillInputError, SkillTransientError } from '@jbg/skills-core';
import { MODELS } from '@jbg/config'; // §0.3：不硬寫版本字串

export const SKILL_ID = 'estimate-price' as const;

export const InputSchema = z.object({
  productId: z.string().uuid(),
  brand: z.string(),
  category: z.string(),
  condition: z.enum(['new', 'like_new', 'good', 'fair']),
  // 市場記憶：由呼叫方（Price Agent）從 Memory recall 後傳入
  comparables: z
    .array(
      z.object({
        soldAmount: z.number().int(), // 最小貨幣單位（§0.10）
        currency: z.string().length(3),
        soldAt: z.string().datetime(),
        similarity: z.number().min(0).max(1),
      }),
    )
    .max(20),
  targetCurrency: z.string().length(3).default('TWD'),
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
export type Output = z.infer<typeof OutputSchema>;

export const contract = {
  id: SKILL_ID,
  effects: 'model' as const,
  idempotent: false, // 模型輸出可能有微幅變動；固定 temperature 可近似冪等
  usesModel: true,
  usesConnectors: [] as string[],
} as const;

/** 純子函式：把可比價正規化到同幣別（可單獨測、無副作用） */
export function normalizeComparables(
  comparables: Input['comparables'],
  targetCurrency: string,
  fx: (from: string, to: string) => number,
): number[] {
  return comparables.map((c) =>
    Math.round(c.soldAmount * fx(c.currency, targetCurrency)),
  );
}

export async function run(
  rawInput: unknown,
  deps: SkillDeps,
): Promise<{ output: Output; meta: SkillMeta }> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) throw new SkillInputError(SKILL_ID, parsed.error);
  const input = parsed.data;

  const startedAt = Date.now();

  // 純函式部分：先算好可比價的統計特徵餵給模型當事實
  const normalized = normalizeComparables(
    input.comparables,
    input.targetCurrency,
    deps.fx, // fx 由 deps 注入，測試時可 mock
  );

  let result;
  try {
    result = await deps.model.complete({
      model: MODELS.REASONING, // §0.3：常數指向，不硬寫
      promptId: 'estimate-price@1', // §0.5 Prompt entity，版本化
      input: {
        brand: input.brand,
        category: input.category,
        condition: input.condition,
        normalizedComparables: normalized,
        targetCurrency: input.targetCurrency,
      },
      schema: OutputSchema, // harness 負責 schema 驗證與重試
      temperature: 0.2,
    });
  } catch (err) {
    // 模型 503 / timeout → 可重試
    throw new SkillTransientError(SKILL_ID, err);
  }

  const output = OutputSchema.parse(result.value);

  return {
    output,
    meta: {
      skillId: SKILL_ID,
      latencyMs: Date.now() - startedAt,
      tokens: result.usage.totalTokens,
      costMicroUsd: result.usage.costMicroUsd,
      modelId: result.modelId, // harness 回填實際解析出的 id
    },
  };
}

export default { contract, InputSchema, OutputSchema, run };
```

**呼叫方（Price Agent）怎麼用**：Agent 先從 `Memory` recall 可比價，組成 `input`，呼叫 `estimate-price.run(input, deps)`，把 `output` 包成 `PriceSuggestion`（§0.5），若 `confidence` 低或金額超門檻 → 依 §0.9 觸發 `HumanReview`。**Skill 本身不決定要不要送人審**——那是 Agent/Policy 的責任。

---

## E.5 Skill vs Agent vs Connector 的界線

用這張決策表判斷「這件事該是 Skill 還是別的」：

| 問題 | 若是 → | 落點 |
|---|---|---|
| 需要自主決定「要不要做、做幾次、用哪些工具」，有 system prompt、可多輪？ | 是 | **Agent**（附錄 H） |
| 是「對某個外部系統讀寫」的唯一出口，要管憑證/rate limit/重試/webhook 驗證？ | 是 | **Connector**（附錄 F） |
| 是有終止條件、串多步驟、可能卡 HR 的迴圈？ | 是 | **Loop**（附錄 G） |
| 是一個**單一、被呼叫、有 I/O 契約**的能力（純算 / 一次模型呼叫 / 一次 connector 語意包裝）？ | 是 | **Skill**（本附錄） |

**經驗法則**：

- 能寫成「input → output 的函式簽章」而不需要「決定策略」→ **Skill**。
- 一旦你想在裡面寫「如果 X 就再問一次模型、否則升級人審」這種**編排**邏輯 → 那是 **Agent 或 Loop**，不是 Skill。
- 一旦你想在裡面 `fetch('https://graph.facebook.com/...')` → **停**。那必須經 **Connector**（§0.8）。Skill 只能透過 `deps.connectors.facebook.*` 使用它。

---

## E.6 測試準則 (Testing)

Skill 是系統裡**最該有高覆蓋率**的一層，因為它被大量組合復用。

1. **純函式部分：table-driven 單元測試**。`normalizeComparables`、正規化、格式化等給定 input 斷言 output，涵蓋邊界（空陣列、極值、非法幣別）。
2. **model-backed：mock `deps.model`**。斷言「餵給模型的 input 正確」「output schema 被驗證」「模型丟錯時映射成 `SkillTransientError`」。不要在單元測試打真模型。
3. **connector-backed：mock `deps.connectors.<id>`**（見附錄 F §F.6）。斷言「有呼叫正確 connector 方法」「connector 丟錯時錯誤語意正確」。
4. **契約測試**：斷言 `InputSchema` / `OutputSchema` 對已知樣本可解析；schema 變更要視為破壞性變更（配合 `promptId` 版本升號）。
5. **Eval 掛點**：model-backed skill 要能被 `EvalRun`（§0.5）評分。準備 golden set（input → 期望 output 特徵），供附錄後續 eval 章節掛入。

```ts
// packages/skills/estimate-price/estimate-price.test.ts（示意）
import { describe, it, expect, vi } from 'vitest';
import skill, { normalizeComparables } from './index';

describe('normalizeComparables', () => {
  it('換算到目標幣別', () => {
    const fx = (from: string, to: string) => (from === 'JPY' && to === 'TWD' ? 0.21 : 1);
    expect(normalizeComparables(
      [{ soldAmount: 10000, currency: 'JPY', soldAt: '2026-01-01T00:00:00Z', similarity: 0.9 }],
      'TWD', fx,
    )).toEqual([2100]);
  });
});

describe('estimate-price.run', () => {
  it('模型 timeout → SkillTransientError', async () => {
    const deps = {
      model: { complete: vi.fn().mockRejectedValue(new Error('ETIMEDOUT')) },
      connectors: {},
      fx: () => 1,
      logger: console,
    } as any;
    await expect(skill.run(
      { productId: crypto.randomUUID(), brand: 'Chanel', category: 'bag',
        condition: 'good', comparables: [] }, deps,
    )).rejects.toThrow(/transient/i);
  });
});
```

---

## 本章交付物 (Deliverables)

- Skill 契約 8 項清單（§E.2）。
- 可複製空白模板 `packages/skills/<verb-noun>/index.ts`（§E.3）。
- 真實範例 `estimate-price`（含純子函式抽離、model-backed、typed error）（§E.4）。
- Skill/Agent/Connector 界線決策表（§E.5）與測試準則（§E.6）。

## 驗收條件 (Acceptance Criteria)

一個 Skill 可合併，當且僅當：

- [ ] id 為 `kebab-case`、動詞開頭。
- [ ] export `InputSchema` / `OutputSchema`（zod），且 `run` 內部先 `safeParse` 輸入。
- [ ] `contract` 宣告 `effects` / `idempotent` / `usesModel` / `usesConnectors`，且與實作一致。
- [ ] 呼叫模型時使用 `MODELS.*` 常數，**無硬寫版本字串**。
- [ ] 不直接 `fetch` 外部 API；外部讀寫一律經注入的 connector。
- [ ] 使用 typed error（Input/Transient/Fatal）並語意正確。
- [ ] 回傳 `meta`（latency/tokens/cost/modelId）。
- [ ] 純函式部分有單元測試；model/connector 部分有 mock 測試。
