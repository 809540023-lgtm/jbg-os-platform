# 08 · Workflow / Loops

> 本章依 `docs/00-canonical-model.md` 為合約撰寫。所有 Entity、Agent、Loop、階段名、狀態機 enum 與 §0.5–0.11 完全一致。
> 階段名一律使用合約版：`drive-ingest` / `perceive` / `assemble` / `gap-check` / `price` / `compose` / `review` / `human-review` / `publish` / `engage` / `close` / `aftersale` / `remember`。
> 本章談「實際流程」（product-lifecycle 的每個 Loop 怎麼跑）；空白模板見 **附錄 G（Loop Template）**，兩者刻意不重複。
>
> 版本：v1.0 · 最後更新：2026-07-07

---

## 8.0 本章的位置

Loop Engineering 12 層（§0.4）中，本章聚焦第 4 層 **Loop** 與第 5 層 **Automation**，並串起第 6 層 Skill、第 7 層 Connector、第 8 層 Sub-agent。它回答一個問題：

> **「一件商品從 Google Drive 的一張照片，到 FB 成交、售後、沉澱成記憶」這條線，怎麼被拆成可被 `LoopRunner` 執行、可被人審核、可被觀測的具體步驟？**

讀完本章，Claude Code 應能：

1. 分清 `Workflow` / `Loop` / `LoopStep` 三者關係與各自的 DB 載體。
2. 依 **Loop DSL schema**（§8.2 給 TS type）寫出任何一個 Loop 定義。
3. 照著 §8.15 的完整 DSL 範例實作 `LoopRunner`。
4. 知道每個階段對應哪個 Agent / Skill / Connector、觸發方式、失敗處理、狀態機轉移。

---

## 8.1 Workflow vs Loop vs LoopStep（三層關係）

三個名詞都在 **Loop Context**（§0.5），是嚴格的三層編排結構：

| 概念 | 定義 | 粒度 | DB 載體 | 執行實例 |
|---|---|---|---|---|
| **`Workflow`** | 多個 `Loop` 組成的業務流程（SHAP 主流程 = `product-lifecycle`） | 最大：跨階段、跨 Agent、可長達數天 | `workflows` | 由 `LoopExecution` 鏈接體現（無獨立 execution table，靠 `correlation_id` 串） |
| **`Loop`** | 一個有終止條件的自動化迴圈**定義**（步驟圖、觸發、重試策略） | 中：一個階段 = 一個 Loop（如 `drive-ingest`） | `loops` | `LoopExecution` (LX) — 一次執行 = 一列 |
| **`LoopStep`** | LX 中的一步，對應一次 Agent / Skill / Connector / Human / Branch 呼叫 | 最小：一次原子操作 | `loop_steps` | 執行時逐 step 落一列（含 input/output/status/trace） |

```
Workflow: product-lifecycle
   │  （編排 13 個 Loop，用 correlation_id = product_id 串起）
   ├── Loop: drive-ingest      ── LX#1 ── [LoopStep: list-new] [LoopStep: dedup] [LoopStep: create-photo]
   ├── Loop: perceive          ── LX#2 ── [LoopStep: ocr ‖ vision] [LoopStep: persist]
   ├── Loop: assemble          ── LX#3 ── [LoopStep: merge] [LoopStep: upsert-product]
   ├── Loop: gap-check         ── LX#4 ── [LoopStep: eval-completeness] [LoopStep: branch] …
   ├── Loop: price             ── LX#5 ── …
   │   …
   └── Loop: remember          ── LX#13
```

**關鍵區分（合約強制）：**

- `Workflow` 是**編排層**：它決定「哪個 Loop 完成後觸發哪個 Loop」，本身不執行 Agent。實作上它是一組 **event 訂閱規則**（Loop A 的 `succeeded` event → 觸發 Loop B），而非一個巨型狀態機。這讓每個 Loop 可獨立重跑、獨立觀測、獨立擴充。
- `Loop` 是**執行層**：有自己的 `LoopExecution` 狀態機（§0.11）。
- `LoopStep` 是**原子層**：一個 step 失敗只影響該 step 的 retry / on_failure，不會讓整個 Loop 定義被改寫。

> **為什麼 Workflow 不做成單一大狀態機？** 二手商品生命週期橫跨數小時到數天（等補件、等人審、等客人詢問），把它塞進一個 long-running state machine 會讓重試、觀測、局部重跑都變得脆弱。改用「Loop 之間以 event 串接」＝ 每個階段都是可獨立重放的 unit，符合 §0.4 第 12 層 Observability 的要求。

---

## 8.2 Loop DSL — Schema 與 TS Type（權威）

一個 `Loop` 的定義用 **TS/JSON DSL** 表達。`LoopRunner` 讀這份定義逐 step 執行。以下是 DSL 的完整 TS type（`packages/loop-dsl/src/types.ts`）：

```ts
// packages/loop-dsl/src/types.ts
// Loop DSL — LoopRunner 的執行合約。與 docs/00 §0.5、§0.11 對齊。

/** Loop 觸發方式（對應 §0.4 第 5 層 Automation）。 */
export type LoopTrigger =
  | { kind: 'cron'; schedule: string }                    // pg_cron 表達式，如 '*/10 * * * *'
  | { kind: 'webhook'; source: 'facebook' | 'drive' | 'line'; event: string }
  | { kind: 'event'; on: string }                         // 內部 event，如 'loop.perceive.succeeded'
  | { kind: 'manual' };                                   // UI 手動觸發

/** Step 種類。決定 LoopRunner 用哪個 executor。 */
export type StepType = 'agent' | 'skill' | 'connector' | 'human' | 'branch';

/** input mapping：從 LX context / 前面 step 輸出取值。
 *  用 JSONPath-lite：'$.trigger.fileId'、'$.steps.ocr.output.text'、'$.product.id'。 */
export type InputMapping = Record<string, string /* path expr */ | { const: unknown }>;

/** 失敗後動作。 */
export type OnFailure =
  | { action: 'retry' }                    // 交給 step.retry 策略
  | { action: 'goto'; step: string }       // 回退到某 step（回退邊）
  | { action: 'human-review'; reason: string }
  | { action: 'dead-letter' }              // 進死信，Loop 標 failed
  | { action: 'skip' }                     // 略過此 step，繼續下一步
  | { action: 'fail-loop' };               // 直接終結整個 LX = failed

export interface RetryPolicy {
  max: number;                             // 最多重試次數（不含首次）
  backoff: 'none' | 'linear' | 'exponential';
  baseMs: number;                          // 首次退避基準
  retryOn?: string[];                      // 只對這些 error code 重試；未列＝不重試
}

/** 分支條件（type='branch' 專用）。cases 由上而下 match，first-match-win。 */
export interface BranchSpec {
  on: string;                              // 要判斷的值路徑，如 '$.steps.eval.output.verdict'
  cases: Array<{ when: string; goto: string }>; // when = 表達式，如 "== 'reject'"、"< 0.7"
  default: string;                         // 都不 match 時去哪個 step（或 '$end'）
}

/** 單一 step 的定義。 */
export interface LoopStepDef {
  id: string;                              // Loop 內唯一，kebab-case
  type: StepType;
  /** ref 指向要呼叫的東西：
   *  agent → §0.6 代號（'vision'|'ocr'|'price'|'marketing'|'reviewer'|'publisher'|'memory'）
   *  skill → §0.10 skill id（'estimate-price'）
   *  connector → §0.8 connector id + method（'drive.listNewFiles'）
   *  human → HumanReview 種類（'gap-fill'|'price-approve'|'listing-approve'）
   *  branch → 省略（用 branch 欄位） */
  ref?: string;
  input?: InputMapping;
  branch?: BranchSpec;                     // type='branch' 時必填
  retry?: RetryPolicy;
  onSuccess?: { goto: string };            // 預設：順序執行下一步；'$end' = 正常結束
  onFailure?: OnFailure;                   // 預設：{ action: 'retry' } → 用完 retry 後 fail-loop
  /** 此 step 是否為需要人審的動作（有外部副作用/不可逆，見 §0.9）。
   *  true 時 LoopRunner 在執行前檢查 PolicyEngine，必要時開 HumanReview 並把 LX 轉 waiting_human。 */
  requiresHumanReview?: boolean;
  /** 冪等鍵模板：同一 key 已成功過就跳過（見 §8.13）。 */
  idempotencyKey?: string;                 // 如 'photo:{$.trigger.fileId}'
  timeoutMs?: number;                      // 單 step 逾時；預設 60_000
}

/** Loop 定義（= `loops` table 一列的 spec 欄位）。 */
export interface LoopDef {
  id: string;                              // kebab-case，如 'drive-ingest'
  version: number;                         // 定義版本；LX 記錄執行時的版本以利回放
  title: string;
  description?: string;
  trigger: LoopTrigger;
  /** 終止條件：steps 走完 / 命中 '$end' / fail-loop / 逾時。 */
  concurrency?: { maxParallel: number; key?: string }; // 同 key 併發上限
  steps: LoopStepDef[];
  /** 全 Loop 逾時（含 waiting_human），超過轉 failed 並推 LINE 告警。 */
  slaMs?: number;
  emits?: string[];                        // 成功時對外發的 event（供 Workflow 編排），如 ['loop.perceive.succeeded']
}
```

**DSL 語意約定：**

- **順序**：`steps` 陣列即預設執行順序；`onSuccess.goto` / `branch` / `onFailure.goto` 可跳轉，形成 DAG（允許回退邊）。
- **input mapping**：值可以是路徑字串（從 LX context 取）或 `{ const: … }`（寫死）。可取用範圍：`$.trigger.*`（觸發載荷）、`$.steps.<id>.output.*`（前面 step 輸出）、`$.workflow.*`（Workflow 級 correlation 資料，如 `product.id`）。
- **type → executor 對映**（LoopRunner 內部）：`agent`→`AgentRunner`（§0.6）、`skill`→`SkillRegistry`（§0.4 第 6 層）、`connector`→`ConnectorRegistry`（§0.8，所有外部副作用唯一出口）、`human`→開 `HumanReview` 並轉 `waiting_human`、`branch`→純內部計算不落副作用。
- **requiresHumanReview**：任何 `true` 的 step 執行前，`LoopRunner` 必問 `PolicyEngine`（§0.9）。Policy 說要人審 → 開 HR、LX 轉 `waiting_human`；說免審 → 直接執行。這是「AI 可提議、有副作用需 Permission/HR」原則的落地點。

---

## 8.3 SHAP 主 Workflow `product-lifecycle` 全流程圖

以 §0.7 的階段畫出，含並行 `‖` 與回退邊（`⤴`）。每個 `[stage]` 對應一個 Loop。

```
                          ┌─────────────────────────────────────────┐
 (cron */10m)             │            Workflow: product-lifecycle    │
      │                   │   correlation_id = product_id (組出後)     │
      ▼                   └─────────────────────────────────────────┘
┌──────────────┐
│ drive-ingest │  Drive 新照片 → ProductPhoto（冪等 dedup）
└──────┬───────┘  emits: loop.drive-ingest.succeeded
       ▼
┌──────────────┐
│  perceive    │   ┌── ocr  (OCR Agent)   ┐
│              │   │        ‖ 並行         │→ persist OCRResult + VisionResult
│              │   └── vision(Vision Agent)┘
└──────┬───────┘  emits: loop.perceive.succeeded
       ▼
┌──────────────┐
│  assemble    │  合併 OCR+Vision → upsert Product 商品卡（listing_status=draft）
└──────┬───────┘  emits: loop.assemble.succeeded
       ▼
┌──────────────┐   完整 ─────────────────────────────┐
│  gap-check   │──▶ 缺料? ─ yes ─▶ 開 Task/HumanReview │ (等補件)
└──────┬───────┘        │              補齊 ⤴──────────┘
       │ 完整            └─ 逾時未補 → Task blocked, LX 掛 waiting_human
       ▼
┌──────────────┐
│    price     │  Price Agent → PriceSuggestion（高價/低信心 → requiresHumanReview）
└──────┬───────┘
       ▼
┌──────────────┐
│   compose    │  Marketing Agent → Listing draft（listing_status: draft→in_review）
└──────┬───────┘
       ▼
┌──────────────┐   pass ───────────────────────────────┐
│   review     │──▶ Reviewer Agent 自動審                │
└──────┬───────┘   reject ─▶ goto assemble/compose ⤴────┘
       │ pass
       ▼
┌──────────────┐   低風險 ─────────────────────────────┐
│ human-review │──▶ 高風險(價/合規)? ─ yes ─▶ waiting_human│ approve⤵ / reject⤴回 compose
└──────┬───────┘        │  edited → 套用修改後續行         │
       │ 免審            └────────────────────────────────┘
       ▼
┌──────────────┐
│   publish    │  Publisher Agent → FB（listing_status: approved→published）
└──────┬───────┘  emits: loop.publish.succeeded
       ▼
┌──────────────┐
│   engage     │  FB webhook 進 Inquiry → 客服（MVP 半自動，草稿+人送）
└──────┬───────┘
       ▼
┌──────────────┐
│    close     │  成交 → Order（listing_status: published→sold）
└──────┬───────┘
       ▼
┌──────────────┐
│  aftersale   │  退換/客訴/回購 → AfterSale
└──────┬───────┘
       ▼
┌──────────────┐
│   remember   │  Memory Agent 萃取事實 → Memory（+ Embedding，回哺 price/marketing）
└──────────────┘
```

**回退邊總覽：**

- `gap-check → (自身等待補件) → 回原流`：補件完成 event 重觸 `gap-check` 重評。
- `review reject → assemble`（商品卡不完整）或 `→ compose`（純文案問題）——由 Reviewer 的 reject reason code 決定。
- `human-review rejected → compose`（要求重寫文案）；`edited → 帶著人改過的內容續行到 publish`。

**編排（event 訂閱，非巨狀態機）**：`product-lifecycle` = 下表 event → 觸發規則。

| 上游 Loop emit | 觸發下游 Loop |
|---|---|
| `loop.drive-ingest.succeeded` | `perceive` |
| `loop.perceive.succeeded` | `assemble` |
| `loop.assemble.succeeded` | `gap-check` |
| `loop.gap-check.passed` | `price` |
| `loop.price.succeeded` | `compose` |
| `loop.compose.succeeded` | `review` |
| `loop.review.passed` | `human-review` |
| `loop.human-review.cleared` | `publish` |
| `webhook facebook comment/msg` | `engage` |
| `loop.engage.deal-reached` | `close` |
| `webhook facebook / manual` | `aftersale` |
| `loop.close.succeeded` / `loop.aftersale.succeeded` | `remember` |

---

## 8.4 Loop 統一模板（每個 Loop 都照這格式）

以下每個 Loop 用同一模板展開：**觸發 / input / steps（含流程圖）/ 輸出 / 失敗處理 / 狀態機轉移 / 依賴（Agent·Skill·Connector）**。

---

### 8.5 Loop `drive-ingest`（抓 Drive 新照片 → 建 ProductPhoto）

- **觸發（§0.4 Automation）**：`cron`，`*/10 * * * *`（每 10 分鐘掃監看資料夾）。亦可 `manual` 手動補掃。
- **input**：`{ folderId: <監看資料夾>, since: <上次掃描 checkpoint> }`。
- **輸出**：N 筆 `ProductPhoto`（每張新照片一筆）；emit `loop.drive-ingest.succeeded`（每筆 photo 一次，載 `photoId`）。
- **依賴**：Connector `drive`（listNewFiles / downloadFile / getMetadata）；Skill `hash-image`（算感知雜湊做 dedup）。無 Agent。

```
[list-new] drive.listNewFiles(folderId, since)
     │  files[]
     ▼
[for-each file] ──▶ [dedup] hash-image → 查 product_photos.perceptual_hash 已存在?
     │                    │ 已存在 → skip（冪等）
     │                    │ 新照片 ↓
     ▼                [download] drive.downloadFile → Supabase Storage
                           ▼
                      [create-photo] upsert ProductPhoto (status=ingested)
                           ▼
                      [emit] loop.drive-ingest.succeeded { photoId }
```

- **失敗處理**：`drive.*` 429/5xx → `retry`（exponential, max 5）；下載壞檔 → `dead-letter`（記 `AuditLog`，不 fail 整個 Loop，其他照片續跑）。
- **冪等**：`idempotencyKey: 'photo:{perceptualHash}'` — 同一張照片（同 hash）永不重複建 `Product`/`ProductPhoto`。這是全流程冪等的第一道閘（§8.13）。
- **狀態機**：LX `queued→running→succeeded`；不涉 HR。

---

### 8.6 Loop `perceive`（OCR ‖ Vision 並行）

- **觸發**：`event`，`on: 'loop.drive-ingest.succeeded'`（載 `photoId`）。
- **input**：`{ photoId }`。
- **輸出**：`OCRResult` + `VisionResult`（各一筆，belong to 該 `ProductPhoto`）；emit `loop.perceive.succeeded`。
- **依賴**：Agent `ocr`、`vision`（§0.6，`MODELS.VISION`）；Connector 無（照片已在 Storage）。

```
[load-photo] 讀 ProductPhoto + Storage signed url
     │
     ├───────────‖ 並行 fan-out ───────────┐
     ▼                                       ▼
[ocr] Agent=ocr                        [vision] Agent=vision
  → OCRResult(text,fields,conf)          → VisionResult(brand,category,defects,conf)
     └───────────┬───────────────────────┘
                 ▼  fan-in（兩者皆完成）
          [persist] upsert OCRResult + VisionResult
                 ▼
          [emit] loop.perceive.succeeded { photoId }
```

- **並行語意**：`ocr` 與 `vision` 為兩個獨立 step，`onSuccess.goto` 同指向 `persist`；LoopRunner 對「同 goto 目標且無互相 input 依賴」的 step 做並行 fan-out，`persist` 等兩者皆 `succeeded` 才啟動（fan-in barrier）。
- **失敗處理**：任一 Agent 逾時/schema fail → `retry`（max 2）；OCR 徹底失敗但 Vision 成功 → `persist` 仍寫入（OCRResult 標 `low_confidence`），交由 `gap-check` 補件，不整個 fail（perception 缺文字可容忍）。Vision 徹底失敗 → `fail-loop`（沒視覺資訊無法組卡）。
- **狀態機**：`queued→running→succeeded`；低信心不在此升級 HR，留給 `gap-check`。

---

### 8.7 Loop `assemble`（合併成 Product 商品卡）

- **觸發**：`event`，`on: 'loop.perceive.succeeded'`。
- **input**：`{ photoId }`（→ 反查同一 `Product` 的所有 photo 的 OCR/Vision）。
- **輸出**：upsert `Product`（`listing_status=draft`），關聯 `Brand`/`Category`；設定 `correlation_id = product.id`（此後 Workflow 用它串）；emit `loop.assemble.succeeded { productId }`。
- **依賴**：Skill `merge-perception`（規則合併 OCR+Vision，衝突時 Vision 品牌 > OCR，OCR 型號/序號 > Vision）、Skill `resolve-brand`（把辨識字串對到 `Brand` entity）。無 Agent（純規則）。

```
[gather] 收齊該商品所有 photo 的 OCRResult+VisionResult
     ▼
[merge] merge-perception → 候選商品卡欄位（brand/category/attrs/defects）
     ▼
[resolve] resolve-brand + resolve-category（對映到 Brand/Category entity）
     ▼
[upsert-product] upsert Product(listing_status=draft), 綁 correlation_id
     ▼
[emit] loop.assemble.succeeded { productId }
```

- **失敗處理**：`resolve-brand` 找不到品牌 → 不 fail，寫 `brand=null` 並標欄位缺，交 `gap-check`。
- **冪等**：`idempotencyKey: 'product-assemble:{productId}'`；重跑只更新不重建。
- **狀態機**：`queued→running→succeeded`。

---

### 8.8 Loop `gap-check`（缺料 → Task / HumanReview 補件；決策分支）

- **觸發**：`event`，`on: 'loop.assemble.succeeded'`；補件完成後由 `task.done` event 重觸。
- **input**：`{ productId }`。
- **輸出**：完整 → emit `loop.gap-check.passed`；不完整 → 開 `Task`(`open`) 與（必要時）`HumanReview`(`gap-fill`)，LX 轉 `waiting_human`。
- **依賴**：Skill `eval-completeness`（依 Category 的必填欄位清單打分）。Human 關卡 `gap-fill`。

```
[eval] eval-completeness(product) → { missing:[], score }
     ▼
[branch] on = $.steps.eval.output.missing.length
   ├─ == 0            → goto emit-pass
   ├─ 缺「可自動補」   → goto auto-fill (e.g. 依型號查記憶回填)
   └─ 缺「須人補」     → goto open-task
                              │
        [open-task] 建 Task(open, assignee=owner) + HumanReview(gap-fill)
                              ▼  LX → waiting_human
                        （老闆在 UI 補件 → task.done event）
                              ▼  重觸本 Loop 從 [eval] 再評
[auto-fill] 回填 → 回 [eval] 重評
[emit-pass] emit loop.gap-check.passed { productId }
```

- **失敗處理 / 逾時**：`Task` 超過 SLA（預設 48h）未補 → `Task` 轉 `blocked`、推 LINE 提醒老闆、LX 維持 `waiting_human`（不失敗，商品可無限期擱置直到補齊或人工取消）。人審逾時通則見 §8.14。
- **狀態機**：`running→waiting_human→（補齊後）running→succeeded`；`HumanReview: pending→(approved|edited)`。

---

### 8.9 Loop `price`（Price Agent → PriceSuggestion）

- **觸發**：`event`，`on: 'loop.gap-check.passed'`。
- **input**：`{ productId }`（+ Memory recall：同品牌/品類歷史成交、市場記憶）。
- **輸出**：`PriceSuggestion`（`suggestedAmount`,`range`,`reasoning`,`confidence`），寫入 `Product.price`（value object）；高價或低信心時開 HR。emit `loop.price.succeeded`。
- **依賴**：Agent `price`（`MODELS.REASONING`）；Skill `recall-market-memory`（pgvector 撈相似商品成交記憶）、`estimate-price`；Connector 無。

```
[recall] recall-market-memory(product) → 相似成交/市場記憶
     ▼
[estimate] Agent=price → PriceSuggestion { amount, range, reasoning, confidence }
     ▼
[persist] 寫 PriceSuggestion + Product.price
     ▼
[gate] requiresHumanReview? 由 Policy：amount > 門檻 OR confidence < 0.7
   ├─ 需審 → open HumanReview(price-approve) → waiting_human
   └─ 免審 → emit loop.price.succeeded
```

- **失敗處理**：Agent schema fail → `retry`(max 2)；查無任何市場記憶 → 不 fail，`confidence` 自動降級，強制走 HR。
- **狀態機**：`running →(高價/低信心) waiting_human →(approved/edited) running→succeeded`。
- **Permission（§0.9）**：`price` 自動套用 > NT$ 門檻的定價 → 一律 Policy 擋下走 HR。

---

### 8.10 Loop `compose`（Marketing Agent → Listing draft）

- **觸發**：`event`，`on: 'loop.price.succeeded'`。
- **input**：`{ productId }`（含商品卡 + 定價）。
- **輸出**：`Listing`(draft) — FB 貼文文案、標題、hashtag、賣點；`listing_status: draft→in_review`。emit `loop.compose.succeeded`。
- **依賴**：Agent `marketing`（`MODELS.REASONING`）；Skill `compose-fb-post`；Connector 無（僅產草稿，未發）。

```
[compose] Agent=marketing → Listing draft { title, body, hashtags, sellingPoints }
     ▼
[persist] upsert Listing(status=in_review) belong to Product+facebook connector
     ▼
[emit] loop.compose.succeeded { listingId }
```

- **失敗處理**：Agent fail → `retry`(max 2)；仍失敗 → `human-review`（`listing-approve`，交人手寫）。
- **狀態機**：`running→succeeded`；`listing_status: draft→in_review`。

---

### 8.11 Loop `review`（Reviewer Agent → pass/reject；reject 回退）

- **觸發**：`event`，`on: 'loop.compose.succeeded'`。
- **input**：`{ listingId, productId }`（商品卡草稿 + 文案 + 定價）。
- **輸出**：`pass` → emit `loop.review.passed`；`reject` → 依 reason 回退到 `assemble` 或 `compose`。
- **依賴**：Agent `reviewer`（自動審；本身不需 HR）。

```
[check] Agent=reviewer → { verdict: 'pass'|'reject', reasonCode, notes }
     ▼
[branch] on = $.steps.check.output.verdict
   ├─ 'pass'                         → emit loop.review.passed
   └─ 'reject' ─ branch on reasonCode:
        ├─ 'incomplete-card'  → goto(Loop assemble) 重組卡（回退邊）
        ├─ 'bad-copy'         → goto(Loop compose) 重寫文案（回退邊）
        └─ 'price-unreasonable' → goto(Loop price) 重估價（回退邊）
```

- **回退實作**：Reviewer 的 reject 不是同 Loop 內跳步，而是 emit `loop.review.rejected.<reasonCode>` event，由 Workflow 編排重觸對應上游 Loop（帶 `retryOfReview: reviewExecutionId` 防無限迴圈——同一 listing 累計 reject ≥ 3 次 → 強制轉 `human-review`）。
- **失敗處理**：Agent fail → `retry`(max 2) → 仍失敗則保守 `human-review`。
- **狀態機**：`running→succeeded`（pass）或 `running→succeeded` 後由編排重啟上游 LX（reject）。

---

### 8.12 Loop `human-review`（高風險才進；waiting_human）

- **觸發**：`event`，`on: 'loop.review.passed'`。
- **input**：`{ listingId, productId, priceSuggestionId }`。
- **輸出**：清關 → emit `loop.human-review.cleared`（`listing_status→approved`）；rejected → 回 `compose`；edited → 套用人改內容後續行。
- **依賴**：Human 關卡 `listing-approve` / `price-approve`；Policy 判斷是否高風險。

```
[risk-gate] Policy(product, price, listing) → high-risk?
   ├─ 低風險 → emit loop.human-review.cleared（listing_status→approved）
   └─ 高風險 → [open-hr] HumanReview(listing-approve) → waiting_human
                    │
        老闆 UI 決策：approve / reject / edit
          ├─ approved → cleared（→approved）
          ├─ rejected → emit loop.review.rejected.bad-copy（回 compose）
          └─ edited   → 寫回 Listing/Price + cleared（→approved）
```

- **高風險判準（§0.9）**：定價 > 門檻、可能違規品類、Reviewer 標 borderline、或累計被 reject ≥ 3。低風險則此 Loop 幾乎是 pass-through。
- **人審逾時**：`HumanReview` SLA 預設 24h，逾時 → `human_review_status: pending→expired`，推 LINE 升級；LX 維持 `waiting_human`（不自動放行——有外部副作用的動作絕不因逾時而自動執行，符合 §0.9）。詳見 §8.14。
- **狀態機**：`running→waiting_human→(approved/edited→running→succeeded | rejected→上游重跑)`；`HumanReview: pending→approved|rejected|edited|expired`。

---

### 8.12.b Loop `publish`（Publisher → FB）

- **觸發**：`event`，`on: 'loop.human-review.cleared'`。
- **input**：`{ listingId }`。
- **輸出**：FB 貼文；`Listing.published`、`listing_status: approved→published`；emit `loop.publish.succeeded`。
- **依賴**：Agent `publisher`；Connector `facebook`（發文，唯一外部寫入出口）。`requiresHumanReview` 一般為 false，但**受 Permission 管**（未經 HR 直發需 Policy 放行）。

```
[pre-check] Policy：此 listing 可直發? （clean 過 human-review 即可）
     ▼
[publish] connector=facebook.createPost(listing)  ← requiresHumanReview 由 Policy 決定
     ▼
[record] 寫 Listing.externalPostId, published_at, status=published
     ▼
[emit] loop.publish.succeeded { listingId, externalPostId }
```

- **冪等**：`idempotencyKey: 'fb-post:{listingId}'` — 同一 listing 絕不重複發文（重試時先查 `externalPostId` 是否已存在）。
- **失敗處理**：FB 429/5xx → `retry`(exponential, max 5)；FB 明確拒絕（違規/token 失效）→ `human-review`(publish-blocked) + LINE 告警，不 dead-letter（需人介入）。
- **狀態機**：`running→succeeded`；`listing_status→published`。

---

### 8.12.c Loop `engage`（接 Inquiry；MVP 半自動）

- **觸發**：`webhook`，`source: facebook`，`event: 'comment'|'message'`。
- **input**：FB webhook payload → 對到 `Listing` → 建/更新 `Inquiry`。
- **輸出**：`Inquiry`；MVP 產「建議回覆草稿」，**人送出**（半自動）；達成交意向 → emit `loop.engage.deal-reached`。
- **依賴**：Agent `marketing`（借用寫回覆草稿，MVP 期）；Connector `facebook`（讀留言、回覆）。回覆客戶＝有外部副作用，`requiresHumanReview`/半自動送出。

```
[ingest-inquiry] map webhook → Inquiry(open)
     ▼
[draft-reply] Agent 產建議回覆（MVP：不自動送）
     ▼
[human-send] 老闆 UI 檢視/編輯 → facebook.reply（人按送出）
     ▼
[branch] 有成交意向? → emit loop.engage.deal-reached { inquiryId }
```

- **失敗處理**：草稿生成失敗 → 略過草稿，仍建 Inquiry 供人手回。
- **狀態機**：Inquiry 生命週期獨立於 LX；回覆送出走 Permission。

---

### 8.12.d Loop `close`（成交 → Order）

- **觸發**：`event`，`on: 'loop.engage.deal-reached'`；或 `manual`（老闆手動標成交）。
- **input**：`{ inquiryId, productId }`。
- **輸出**：`Order`；`listing_status: published→sold`；emit `loop.close.succeeded`。
- **依賴**：Skill `create-order`；Connector 無（金流 MVP 走人工）。

```
[create-order] Order(from Inquiry+Product) → status=confirmed
     ▼
[mark-sold] Listing.status=sold
     ▼
[emit] loop.close.succeeded { orderId }
```

- **冪等**：`idempotencyKey: 'order:{inquiryId}'`。
- **狀態機**：`running→succeeded`；`listing_status→sold`。

---

### 8.12.e Loop `aftersale`（售後 → AfterSale）

- **觸發**：`webhook`（FB 客訴留言）或 `manual`（退換/回購登記）。
- **input**：`{ orderId, type: 'return'|'complaint'|'repurchase' }`。
- **輸出**：`AfterSale`；emit `loop.aftersale.succeeded`。
- **依賴**：Skill `record-aftersale`；Connector `line`（通知老闆）。

```
[record] AfterSale(orderId, type, detail)
     ▼
[notify] line.push(老闆：售後事件)
     ▼
[emit] loop.aftersale.succeeded { afterSaleId }
```

- **狀態機**：`running→succeeded`。

---

### 8.12.f Loop `remember`（Memory Agent → Memory）

- **觸發**：`event`，`on: 'loop.close.succeeded'` 或 `'loop.aftersale.succeeded'`。
- **input**：成交/售後事件 + 相關 Product/Price/Inquiry。
- **輸出**：`Memory` 記錄（fact/preference/feedback/reference）+ `Embedding`（pgvector）；回哺 `price`（市場記憶）、`marketing`（賣點/客訴模式）。
- **依賴**：Agent `memory`；Skill `extract-memory` + `embed`；Connector 無。

```
[extract] Agent=memory → Memory[] { type, content, links[[slug]] }
     ▼
[embed] embed(content) → Embedding（pgvector）
     ▼
[persist] upsert Memory + MemoryLink + Embedding
```

- **冪等**：`idempotencyKey: 'memory:{sourceEventId}'`；同事件不重複萃取。
- **狀態機**：`running→succeeded`。

---

## 8.13 錯誤、重試與冪等（跨全 Loop 的通則）

**1. 冪等（idempotency）— 同一張照片不重複建商品**

三道閘，缺一不可：

- **閘一（ingest）**：`drive-ingest` 用感知雜湊 `idempotencyKey: 'photo:{perceptualHash}'`。同一張照片（即使檔名不同、重傳）hash 相同 → 直接 skip，不建第二個 `ProductPhoto`/`Product`。
- **閘二（step 級）**：任何帶 `idempotencyKey` 的 step，執行前查 `loop_steps` 是否已有同 key 且 `succeeded` 的紀錄 → 有則回放舊 output、跳過執行。這讓 LX 整體可安全重放（replay-safe）。
- **閘三（外部副作用）**：`publish` 發 FB 前查 `Listing.externalPostId`；`close` 建 Order 前查 `order:{inquiryId}`。外部寫入一律「先查後寫」，避免重試造成重複發文/重複下單。

> 實作：`loop_steps` 對 `(loop_execution_id, idempotency_key)` 建 unique index；`ConnectorRegistry` 對所有寫入方法要求傳 `idempotencyKey`（見附錄 F）。

**2. 重試（retry）**

- 由 `LoopStepDef.retry`（`RetryPolicy`）控制：`max`、`backoff`（none/linear/exponential）、`baseMs`、`retryOn`（只對可重試 error code，如 `RATE_LIMIT`/`TIMEOUT`/`5XX`）。
- **不可重試錯誤**（schema 永久不符、Policy 拒絕、FB 違規）不進 retry，直接走 `onFailure`。
- 重試次數、每次錯誤都落 `loop_steps`（attempt N）與 `AuditLog`，供 Observability（§0.4 第 12 層）。

**3. 死信（dead-letter）**

- `onFailure: { action: 'dead-letter' }` → 該 step/LX 標 `failed`，寫入 `dead_letter`（含完整 input、error、最後 attempt trace）+ `AuditLog`。
- 死信可在 UI 人工「重放」（replay）——因為冪等三閘，重放安全。
- 用途：壞檔、外部系統長期不可用、非預期 exception。**不進死信的例外**：需人決策的（違規、token 失效）走 `human-review` 而非死信。

**4. Loop / Workflow SLA 逾時**

- `LoopDef.slaMs` 超過（含卡在 `waiting_human` 的總時長門檻）→ LX 轉 `failed`（或維持 `waiting_human` 但推升級告警，視 Loop 而定）+ LINE 告警老闆。

---

## 8.14 人審逾時（Human Review timeout）處理

`human_review_status: pending → approved | rejected | edited | expired`（§0.11）。逾時策略依「動作可逆性」分兩類：

| HR 種類 | SLA | 逾時（expired）行為 |
|---|---|---|
| `gap-fill`（補件） | 48h | Task→`blocked`，LX 維持 `waiting_human`，LINE 每 24h 提醒；**不自動放行**（可無限擱置） |
| `price-approve`（定價） | 24h | HR→`expired`，LX 維持 `waiting_human`，LINE 升級；**不自動套用定價** |
| `listing-approve`（上架） | 24h | HR→`expired`，LX 維持 `waiting_human`，LINE 升級；**不自動發 FB** |

> **鐵律（§0.9）**：有外部副作用或不可逆的動作，HR 逾時一律**不自動執行**，只升級告警。只有「純內部、可逆、可無害擱置」的（如 gap-fill）允許無限等待。逾時偵測由 `pg_cron` 每小時掃 `human_reviews where status='pending' and deadline < now()`。

---

## 8.15 完整 DSL 範例 — `drive-ingest`（照此實作 LoopRunner）

以下是可被 `LoopRunner` 直接執行的完整 Loop 定義（TS，符合 §8.2 type）。這是全書「Loop 定義長什麼樣」的權威範例。

```ts
// packages/loops/src/drive-ingest.loop.ts
import type { LoopDef } from '@jbg/loop-dsl';

export const driveIngestLoop: LoopDef = {
  id: 'drive-ingest',
  version: 1,
  title: '抓 Google Drive 新照片 → 建立 ProductPhoto',
  description: '每 10 分鐘掃監看資料夾，用感知雜湊去重，新照片下載入 Storage 並建 ProductPhoto。',
  trigger: { kind: 'cron', schedule: '*/10 * * * *' },
  concurrency: { maxParallel: 1, key: 'folder:{$.trigger.folderId}' }, // 同資料夾不併發，避免重複掃
  slaMs: 10 * 60_000,
  emits: ['loop.drive-ingest.succeeded'],
  steps: [
    {
      id: 'list-new',
      type: 'connector',
      ref: 'drive.listNewFiles',
      input: {
        folderId: '$.trigger.folderId',
        since: '$.trigger.since',           // 上次 checkpoint
      },
      retry: { max: 5, backoff: 'exponential', baseMs: 2_000, retryOn: ['RATE_LIMIT', 'TIMEOUT', '5XX'] },
      onFailure: { action: 'retry' },
      onSuccess: { goto: 'dedup' },
      timeoutMs: 30_000,
    },
    {
      // 對 list-new.output.files 逐一處理；LoopRunner 對 connector 回傳陣列支援 fan-out。
      id: 'dedup',
      type: 'skill',
      ref: 'hash-image',
      input: { files: '$.steps.list-new.output.files' },
      // hash-image 回 { newFiles: [...], skipped: [...] }：已存在 perceptual_hash 者被濾掉（冪等閘一）
      onSuccess: { goto: 'download' },
      onFailure: { action: 'skip' },        // 個別檔算 hash 失敗不擋其他檔
    },
    {
      id: 'download',
      type: 'connector',
      ref: 'drive.downloadFile',
      input: { files: '$.steps.dedup.output.newFiles' },
      idempotencyKey: 'photo:{$.item.perceptualHash}', // per-item 冪等
      retry: { max: 3, backoff: 'exponential', baseMs: 1_000, retryOn: ['RATE_LIMIT', 'TIMEOUT', '5XX'] },
      onFailure: { action: 'dead-letter' }, // 壞檔進死信，不 fail 整個 Loop
      onSuccess: { goto: 'create-photo' },
      timeoutMs: 60_000,
    },
    {
      id: 'create-photo',
      type: 'skill',
      ref: 'upsert-product-photo',
      input: {
        storagePath: '$.item.storagePath',
        driveFileId: '$.item.fileId',
        perceptualHash: '$.item.perceptualHash',
        metadata: '$.item.metadata',
      },
      idempotencyKey: 'photo:{$.item.perceptualHash}', // 冪等閘二：同 hash 已建則回放
      onSuccess: { goto: 'emit' },
      onFailure: { action: 'retry' },
      retry: { max: 2, backoff: 'linear', baseMs: 500 },
    },
    {
      id: 'emit',
      type: 'skill',
      ref: 'emit-event',
      input: {
        event: { const: 'loop.drive-ingest.succeeded' },
        payload: { photoId: '$.steps.create-photo.output.photoId' },
      },
      onSuccess: { goto: '$end' },
      onFailure: { action: 'dead-letter' },
    },
  ],
};
```

**LoopRunner 執行語意（實作指引）：**

1. 讀 `LoopDef`，建 `LoopExecution`（`queued`），寫入 `version` 供回放。
2. 由 `steps[0]` 開始，依 `onSuccess.goto` / `branch` / `onFailure.goto` 走圖；`'$end'` 正常結束（`succeeded`）。
3. 每個 step：解析 `input`（JSONPath-lite over LX context）→ 查 `idempotencyKey` 是否已成功（是則回放）→ 依 `type` 分派 executor → 落 `loop_steps`（含 attempt、input snapshot、output、trace、cost）。
4. `type='connector'` 回陣列時，對後續帶 `$.item.*` 的 step 做 fan-out（逐項執行，個別失敗依該 step `onFailure`）。
5. `requiresHumanReview` 或 `type='human'`：查 `PolicyEngine` → 開 `HumanReview`、LX 轉 `waiting_human`、暫停；HR 決策 event 到達後恢復。
6. `type='agent'`：委派 `AgentRunner`（§0.6），落 `AgentRun`+`ContextSnapshot`。
7. 終態（`succeeded`/`failed`/`cancelled`）寫回 LX，`emits` 的 event 發到 event bus 供 Workflow 編排下游 Loop。

> 其他 Loop（`perceive`/`price`/…）套同一 schema，只換 `steps`。空白模板見 **附錄 G**；本節是「填好」的實例。

---

## 8.16 與附錄 G 的分工

- **本章（08）** = SHAP `product-lifecycle` 的**實際流程**：13 個 Loop 的真實 steps、觸發、失敗處理、狀態機、依賴。
- **附錄 G（Loop Template）** = **空白模板**：一份可複製的 `LoopDef` 骨架 + 命名/驗收 checklist，給撰寫**新 Loop**（或未來新 vertical）時填。
- 兩者的接口就是 §8.2 的 `LoopDef` TS type — 附錄 G 提供空殼，本章示範填法，Claude Code 實作時兩邊都讀。

---

## 本章交付物 (Deliverables)

1. **Loop DSL TS type**（§8.2）：`packages/loop-dsl/src/types.ts` — `LoopDef`/`LoopStepDef`/`LoopTrigger`/`OnFailure`/`RetryPolicy`/`BranchSpec`/`InputMapping`，含 `requiresHumanReview`、`idempotencyKey`、`retry`、`concurrency`、`emits`。
2. **`product-lifecycle` 全流程圖**（§8.3）：含並行 `‖`、回退邊 `⤴`、event 編排表。
3. **13 個 Loop 定義**（§8.5–8.12f）：`drive-ingest`/`perceive`/`assemble`/`gap-check`/`price`/`compose`/`review`/`human-review`/`publish`/`engage`/`close`/`aftersale`/`remember`，每個含觸發·input·steps 流程圖·輸出·失敗處理·狀態機轉移·依賴（Agent/Skill/Connector）。
4. **錯誤/重試/冪等/死信/人審逾時通則**（§8.13–8.14）：三道冪等閘、retry policy、dead-letter、HR 逾時「不可逆不自動放行」鐵律。
5. **完整可執行 DSL 範例**（§8.15）：`drive-ingest.loop.ts` + LoopRunner 執行語意 7 步，供直接實作。

## 驗收條件 (Acceptance Criteria)

- [ ] 所有階段名、Entity、Agent 代號、狀態機 enum 與 `docs/00` §0.5–0.11 **逐字一致**（`drive-ingest`…`remember`；`queued→running→waiting_human→…`；`listing_status`；7 個 Agent 代號）。
- [ ] `LoopDef` TS type 可通過 `tsc --strict`（無 `any`），且每個 step 涵蓋 `type=agent|skill|connector|human|branch`、input mapping、`onSuccess/onFailure`、`retry`、`requiresHumanReview`。
- [ ] `product-lifecycle` 流程圖含至少：`perceive` 的並行 `‖`、`gap-check` 的決策分支、`review` 的回退邊。
- [ ] 13 個 Loop 各自標明觸發方式屬 §0.4 Automation 四類（cron/webhook/event/manual）之一。
- [ ] 冪等有明確 key：`drive-ingest` 用 `photo:{perceptualHash}`、`publish` 用 `fb-post:{listingId}`、`close` 用 `order:{inquiryId}` — 保證同照片不重複建商品、同 listing 不重複發文。
- [ ] 人審逾時對「有外部副作用」動作（price/listing/publish）明確為**不自動放行**；僅 `gap-fill` 允許無限擱置。
- [ ] §8.15 的 `drive-ingest.loop.ts` 為合法 `LoopDef`，`LoopRunner` 可照 7 步執行語意實作。
- [ ] 明確聲明與**附錄 G**分工：本章＝實際流程，附錄 G＝空白模板，接口為 `LoopDef`。
