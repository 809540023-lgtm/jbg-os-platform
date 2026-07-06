# 附錄 G · Loop Template

> 本附錄提供一份**可複製的空白 Loop 定義骨架**與填寫指引。
> Loop = Loop Engineering 第 4 層（`docs/00-canonical-model.md` §0.4）；`Loop` / `LoopExecution` / `LoopStep` entity 見 §0.5（Loop Context）；狀態機 enum 見 §0.11。
> **關係說明**：`docs/08`（Workflow）是 SHAP **實際的**流程與狀態機定義（`product-lifecycle` 及其各階段 loop，§0.7）；**本附錄是可複製的空白骨架**，用來新建任一 Loop。兩者不衝突：docs/08 是內容，本附錄是模具。
> 版本：v1.0 · 最後更新：2026-07-07

---

## G.1 Loop 是什麼（快速回顧）

**Loop = 由多步驟串成、有終止條件的自動化迴圈定義**（§0.4 第 4 層）。它是**定義**（`Loop` entity）；一次執行是 `LoopExecution`（LX，狀態機見 §0.11）；每一步是 `LoopStep`（對應一次 Agent / Skill / Connector 呼叫）。

- Loop 由 **Automation**（§0.4 第 5 層：cron / webhook / 事件 / 手動）觸發。
- Loop 內可呼叫 **Agent**（附錄 H）、**Skill**（附錄 E）、**Connector**（附錄 F）。
- Loop 可卡在 **Human Review**（§0.6），此時 LX 進入 `waiting_human`（§0.11）。

---

## G.2 空白模板 — TS 形式

`packages/loops/<loop-id>/definition.ts`，可直接複製：

```ts
// packages/loops/<loop-id>/definition.ts
import { z } from 'zod';
import type { LoopDefinition } from '@jbg/loop-core';

/** input schema：觸發這個 loop 需要的最小事實 */
export const InputSchema = z.object({
  // TODO
});
export type Input = z.infer<typeof InputSchema>;

export const definition: LoopDefinition<Input> = {
  // 識別
  id: '<loop-id>',                 // kebab-case（§0.10）
  version: 1,                      // 整數，破壞性變更 +1（§G.5）
  title: '',                      // 人看的一句話
  inputSchema: InputSchema,

  // 觸發（Automation，§0.4 第 5 層）
  trigger: {
    kind: 'cron' as 'cron' | 'webhook' | 'event' | 'manual',
    // cron: { schedule: '*/5 * * * *' }
    // event: { topic: 'product.assembled' }
  },

  // 終止條件（除了跑完所有 step，還有哪些提前終止）
  terminateWhen: {
    maxSteps: 20,
    maxDurationMs: 15 * 60 * 1000,
    // custom: (ctx) => boolean
  },

  // 重試策略（step 級預設，可被單一 step 覆蓋）
  retry: {
    maxAttempts: 3,
    backoff: 'exponential' as 'none' | 'fixed' | 'exponential',
    retryOn: ['transient'] as Array<'transient' | 'rate_limit'>, // 不重試 input/fatal
  },

  // 步驟（依序執行；‖ 並行用 parallel）
  steps: [
    {
      id: '<step-id>',            // kebab-case，LX trace 用
      // 三選一：呼叫 agent / skill / connector
      call: { type: 'skill', ref: '<skill-id>' },
      //     { type: 'agent', ref: 'price' }        // §0.6 代號
      //     { type: 'connector', ref: 'drive', method: 'listNewFiles' }
      input: (ctx) => ({ /* 從 ctx 組出這步的 input */ }),
      // 是否需要 Human Review（§0.6 / §0.9）
      humanReview: { required: false /*, when: (out) => out.confidence < 0.6 */ },
      // 平行群組（同 group 的 step 並行，對應 §0.7 的 ‖）
      // parallelGroup: 'perceive',
    },
  ],

  // 收尾
  onSuccess: (ctx) => {
    // 寫回 entity、發 event、更新狀態
  },
  onFailure: (ctx, err) => {
    // 補償 / 告警（經 line connector）/ 開 Task
  },
};

export default definition;
```

---

## G.3 空白模板 — JSON 形式

適合存 DB（`Loop` entity）或非 TS 環境宣告；語意與 TS 版一一對應（`input` 的函式在 JSON 版用宣告式 `inputMapping`）：

```json
{
  "id": "<loop-id>",
  "version": 1,
  "title": "",
  "trigger": { "kind": "cron", "schedule": "*/5 * * * *" },
  "terminateWhen": { "maxSteps": 20, "maxDurationMs": 900000 },
  "retry": { "maxAttempts": 3, "backoff": "exponential", "retryOn": ["transient"] },
  "steps": [
    {
      "id": "<step-id>",
      "call": { "type": "skill", "ref": "<skill-id>" },
      "inputMapping": { "field": "$.trigger.someField" },
      "humanReview": { "required": false },
      "parallelGroup": null
    }
  ],
  "onSuccess": { "emit": "some.event" },
  "onFailure": { "notify": "line", "openTask": true }
}
```

---

## G.4 填寫指引（每欄怎麼填）

| 欄位 | 怎麼填 |
|---|---|
| `id` | `kebab-case`，動詞或名詞短語，全系統唯一（`drive-ingest`, `product-lifecycle`）。 |
| `version` | 從 1 起。**只要改了 step 結構、input schema、或語意 → +1**（§G.5）。 |
| `inputSchema` | 觸發此 loop 的最小事實。愈窄愈好；別把整個 Product 塞進來，塞 id 讓 step 自己 recall。 |
| `trigger.kind` | `cron`（定時，如監看 Drive）/ `webhook`（外部推來，如 FB 留言）/ `event`（內部事件，如 `product.assembled`）/ `manual`（人手動點）。 |
| `terminateWhen` | 一定要有 `maxSteps` 與 `maxDurationMs` 當保險絲，避免無限迴圈燒 token/成本。 |
| `retry` | 只重試 `transient` / `rate_limit`；**絕不重試** `input`（呼叫方錯）或 `fatal`。這與附錄 E/F 的 typed error 對齊。 |
| `steps[].call` | 指向 agent 代號（§0.6）/ skill id（§0.10）/ connector id+method（§0.8）。Loop 自己**不**寫業務邏輯與 `fetch`，只編排。 |
| `steps[].input` | 純函式 `(ctx) => input`，從前面步驟的 output 與 trigger 組出這步的 input。 |
| `steps[].humanReview` | `required` 或條件式 `when`。凡「不可逆 / 高風險」（發佈、超門檻改價、回覆客戶）預設需 HR（§0.9）。 |
| `parallelGroup` | 同名者並行（對應 §0.7 的 `‖`，如 perceive 階段 OCR ‖ Vision）。 |
| `onSuccess` / `onFailure` | 收尾副作用一律經 connector / event；失敗要能告警（`line`）與開 `Task`（§0.5）。 |

---

## G.5 填好的最小範例 — `drive-ingest`

**情境**：SHAP `product-lifecycle` 的第一階段（§0.7 `[drive-ingest]`）。定時監看 Google Drive 新照片，下載、去重、建 `ProductPhoto`、發 `photo.ingested` 事件讓下游 `perceive` 接手。純 ingest，無 HR。

```ts
// packages/loops/drive-ingest/definition.ts
import { z } from 'zod';
import type { LoopDefinition } from '@jbg/loop-core';

export const InputSchema = z.object({
  sinceIso: z.string().datetime(), // 上次成功 ingest 的時間點（游標）
});
export type Input = z.infer<typeof InputSchema>;

export const definition: LoopDefinition<Input> = {
  id: 'drive-ingest',
  version: 1,
  title: '監看 Google Drive 資料夾，下載並登記新商品照片',
  inputSchema: InputSchema,

  trigger: { kind: 'cron', schedule: '*/5 * * * *' }, // 每 5 分鐘

  terminateWhen: { maxSteps: 50, maxDurationMs: 10 * 60 * 1000 },

  retry: { maxAttempts: 3, backoff: 'exponential', retryOn: ['transient', 'rate_limit'] },

  steps: [
    {
      id: 'list-new-files',
      call: { type: 'connector', ref: 'drive', method: 'listNewFiles' }, // 附錄 F.4.1
      input: (ctx) => ({ sinceIso: ctx.input.sinceIso }),
      humanReview: { required: false },
    },
    {
      id: 'dedupe',
      call: { type: 'skill', ref: 'dedupe-drive-files' }, // 純函式：以 fileId+md5 去重（附錄 E）
      input: (ctx) => ({ files: ctx.steps['list-new-files'].output.data }),
      humanReview: { required: false },
    },
    {
      id: 'download-and-register',
      call: { type: 'skill', ref: 'register-product-photo' }, // 下載(經 drive connector)+建 ProductPhoto
      input: (ctx) => ({ files: ctx.steps['dedupe'].output.newFiles }),
      humanReview: { required: false },
    },
  ],

  onSuccess: (ctx) => {
    for (const photo of ctx.steps['download-and-register'].output.photos) {
      ctx.emit('photo.ingested', { productPhotoId: photo.id }); // 下游 perceive 接手
    }
    ctx.setCursor({ sinceIso: ctx.now() }); // 推進游標
  },

  onFailure: (ctx, err) => {
    ctx.connectors.line.push(
      { to: ctx.env.LINE_BOSS_USER_ID, text: `drive-ingest 失敗：${err.message}` },
      { idempotencyKey: `drive-ingest-fail-${ctx.executionId}` },
    );
  },
};

export default definition;
```

---

## G.6 測試與 Eval 掛點

1. **單元測試**：以 mock connectors（附錄 F.6）與 mock skills 跑 `LoopRunner`，斷言 step 順序、input mapping、retry 行為、`onSuccess`/`onFailure` 觸發。
2. **狀態機測試**：驗 LX 狀態轉移合法（§0.11：`queued→running→…`；卡 HR → `waiting_human`）。
3. **Eval 掛點**：Loop 的一次執行 = `LoopExecution`，可掛 `EvalRun`（§0.5）評「整條流程是否達成目標」（如 `drive-ingest` 是否零漏檔零重複）。準備 golden 資料夾快照當 fixture。
4. **保險絲測試**：驗 `terminateWhen`（maxSteps / maxDuration）確實中止。

## G.7 命名與版本化

- **id**：`kebab-case`（§0.10）。
- **version**：整數；step 結構 / input schema / 語意變更 → +1。舊版 LX 用當時的 version 定義回放（`ContextSnapshot` 概念延伸）。
- **每個 step id** 也用 `kebab-case`，因為它進 `LoopStep` trace，要能被觀測面板讀（§0.4 第 12 層）。

---

## 本章交付物 (Deliverables)

- 空白 Loop 模板 TS 版（§G.2）與 JSON 版（§G.3）。
- 逐欄填寫指引（§G.4）。
- 填好的最小範例 `drive-ingest`（§G.5）。
- 測試/eval 掛點、命名與版本化規則（§G.6–G.7）。

## 驗收條件 (Acceptance Criteria)

一個 Loop 定義可合併，當且僅當：

- [ ] `id` 為 `kebab-case`，`version` 為整數且遵守 +1 規則。
- [ ] 有 `inputSchema`（zod）、`trigger`、`terminateWhen`（含 maxSteps + maxDuration 保險絲）。
- [ ] `retry` 只對 `transient`/`rate_limit` 重試。
- [ ] 每個 step 指向 agent/skill/connector，**Loop 內無業務邏輯、無直接 `fetch`**。
- [ ] 「不可逆 / 高風險」step 有 `humanReview`（§0.9）。
- [ ] `onSuccess`/`onFailure` 的副作用一律經 connector / event；失敗有告警與（必要時）開 Task。
- [ ] 有以 mock 跑 `LoopRunner` 的測試與狀態機測試；已標明與 `docs/08` 的對應關係。
