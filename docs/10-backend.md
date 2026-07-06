# 10 · Backend (API / Services / Workers)

> 本章依 `docs/00-canonical-model.md` §0.3（技術棧）、§0.4（Loop Engineering 12 層載體）、§0.5（Entities）、§0.6（Agents）、§0.7（product-lifecycle）、§0.8（Connectors）、§0.9（Permission）、§0.10（命名）、§0.11（狀態機）撰寫。
> 分工：`docs/04` 畫**全局系統架構**；本章寫**後端實作介面、endpoint 細節、Service 契約、Worker/非同步邊界**。
> 版本：v1.0 · 對齊 canonical v1.0

---

## 10.0 後端分層 (Layering)

嚴格分四層，依賴**只能由上往下**。上層不得跳過下層直接碰 Supabase；所有對外副作用（Drive/FB/LINE）只能經 Connector（§0.8）。

```
            ┌───────────────────────────────────────────────────────┐
  外部觸發 → │  ① Route Handlers   app/api/**  (+ Supabase Edge Fn)  │  同步 HTTP / webhook
            │     - 驗證 auth(session) + zod 解析 + 統一封裝回應      │
            │     - 不含業務邏輯；委派給 Application Service          │
            └───────────────────────┬───────────────────────────────┘
                                     ▼
            ┌───────────────────────────────────────────────────────┐
  ② Application │  LoopRunner · AgentRunner · ContextBuilder         │  use-case 編排
     Services   │  MemoryStore · PolicyEngine · Harness · EvalRunner │
            └───────────────────────┬───────────────────────────────┘
                                     ▼
            ┌───────────────────────────────────────────────────────┐
  ③ Domain    │  Entities/VOs (§0.5) · 狀態機轉移(§0.11) · 規則      │  純邏輯，無 IO
            └───────────────────────┬───────────────────────────────┘
                                     ▼
            ┌───────────────────────────────────────────────────────┐
  ④ Repositories │  ProductRepo · LoopExecutionRepo · MemoryRepo …   │  Supabase client
                 │  唯一碰 DB 的層；RLS 是第一道防線(§0.9)            │
            └───────────────────────┬───────────────────────────────┘
                                     ▼
            ┌────────── Supabase (Postgres · Auth · Storage · pgvector · pgmq · pg_cron) ──────────┐
            │                                                                                       │
  Connectors (packages/connectors) ── drive · facebook · line ──► 外部系統 (唯一副作用出口 §0.8)     │
            └───────────────────────────────────────────────────────────────────────────────────────┘
```

**依賴圖 (誰呼叫誰)**

```
Route Handler ──► Application Service ──► Domain
                       │                    ▲
                       ├──► Repository ─────┘ (讀寫 Entity)
                       ├──► Connector (副作用: Drive/FB/LINE)
                       └──► Harness (包住 Claude 呼叫)

LoopRunner ──► AgentRunner ──► Harness ──► Anthropic Claude
     │              │
     │              └──► ContextBuilder ──► MemoryStore(pgvector) + Repos
     ├──► PolicyEngine (動作級授權 §0.9)
     └──► (waiting_human) ──► 建 HumanReview
```

**資料夾對映**（詳見 `docs/appendix/A`, `docs/appendix/B`）：

```
apps/web/app/api/**              ← ① Route Handlers
packages/services/*              ← ② Application Services
packages/domain/*                ← ③ Entities / 狀態機 / 規則
packages/repositories/*          ← ④ Repositories (Supabase)
packages/harness                 ← Harness (§0.4 #3)
packages/connectors/*            ← drive/facebook/line (§0.8)
packages/prompts/*  packages/skills/*  packages/eval  ← §0.4 載體
supabase/functions/**            ← Edge Functions (webhook / 長任務 worker)
supabase/migrations/**           ← DDL；含 pg_cron / pgmq 設定
```

---

## 10.1 API 一覽表 (Endpoints)

命名一律 §0.10：`/api/<context>/<resource>`（複數、kebab-case）；非 CRUD 動作用子路徑（`POST …/{id}/executions`）。回應統一封裝 `{ data, error, meta }`。Auth 欄：`session`=需登入 human；`session+policy`=另過 PolicyEngine；`svc`=service-to-service（Edge Fn / worker，用 service role）；`webhook`=外部簽章驗證。

### Catalog Context

| Method | Path | 用途 | Auth |
|---|---|---|---|
| GET | `/api/catalog/products` | 商品卡列表（篩選 status/brand/hasGap） | session |
| POST | `/api/catalog/products` | 建立 Product | session |
| GET | `/api/catalog/products/{id}` | 單一商品卡（+photos/OCR/Vision/Price/Listing） | session |
| PATCH | `/api/catalog/products/{id}` | 編輯商品欄位（已 published 需 policy） | session+policy |
| GET | `/api/catalog/products/{id}/timeline` | 該商品生命週期聚合時間軸 | session |
| GET | `/api/catalog/photos` | ProductPhoto 列表（linked/perceived 篩選） | session |
| POST | `/api/catalog/photos/{id}/link` | 手動把孤兒照片指派到 Product | session |
| GET | `/api/catalog/brands` · `/api/catalog/categories` | Brand / Category 清單 | session |

### Pricing Context

| Method | Path | 用途 | Auth |
|---|---|---|---|
| GET | `/api/pricing/products/{id}` | Price + PriceHistory + 最新 PriceSuggestion | session |
| POST | `/api/pricing/suggestions` | 觸發 price Agent 產生 PriceSuggestion | session+policy |
| POST | `/api/pricing/products/{id}/price` | 套用定價（超門檻→轉 HR） | session+policy |

### Loop Context

| Method | Path | 用途 | Auth |
|---|---|---|---|
| GET | `/api/loops` | Loop 定義清單 + 聚合 metric | session |
| GET | `/api/loops/{loopId}` | 單一 Loop 定義 | session |
| POST | `/api/loops/{loopId}/executions` | **觸發一次執行**（trigger=manual/…） | session+policy |
| GET | `/api/loops/{loopId}/executions` | 該 Loop 的 LX 清單 | session |
| GET | `/api/loops/executions` | 跨 Loop 的 LX 查詢（Dashboard 用，group by stage/status） | session |
| GET | `/api/loops/{loopId}/executions/{lxId}` | 單一 LX + LoopStep[]（trace） | session |
| POST | `/api/loops/{loopId}/executions/{lxId}/cancel` | 取消 LX（→ cancelled） | session+policy |
| POST | `/api/loops/{loopId}/executions/{lxId}/retry` | 重試（可指定 step） | session+policy |

### Agent Context

| Method | Path | 用途 | Auth |
|---|---|---|---|
| GET | `/api/agents` | 7 個 Agent 清單 + 近況（成功率/cost） | session |
| GET | `/api/agents/{agentCode}` | 單一 Agent 定義 + 其 AgentRun 清單 | session |
| POST | `/api/agents/runs` | 直接跑一個 Agent（agent code + input） | session+policy |
| GET | `/api/agents/runs/{runId}` | AgentRun + ContextSnapshot（trace 下鑽） | session |

### Governance Context（Review / Policy / Eval）

| Method | Path | 用途 | Auth |
|---|---|---|---|
| GET | `/api/reviews` | HumanReview 佇列（status 篩選） | session |
| GET | `/api/reviews/{id}` | 單一 HR + target 快照 + 觸發的 Policy/Step | session |
| POST | `/api/reviews/{id}/decision` | 裁決 approve/reject/edited | session+policy |
| GET | `/api/policies` | Policy 清單 | session |
| POST | `/api/evals/runs` | 觸發一次 EvalRun | session |
| GET | `/api/evals/runs/{id}` | EvalRun 結果 | session |
| GET | `/api/audit-logs` | AuditLog 查詢（不可變） | session |

### Memory Context

| Method | Path | 用途 | Auth |
|---|---|---|---|
| GET | `/api/memories` | 語意搜尋 + 篩選（q + type，pgvector recall） | session |
| POST | `/api/memories` | 新增一條 Memory（含 embedding） | session |
| GET | `/api/memories/{id}` | 單一 Memory + MemoryLink[] | session |
| PATCH | `/api/memories/{id}` | 停用/編輯 Memory | session |

### Channel Context

| Method | Path | 用途 | Auth |
|---|---|---|---|
| GET | `/api/channel/listings` · `/{id}` | Listing 清單/單筆 | session |
| POST | `/api/channel/listings/{id}/publish` | 發佈到 FB（publisher，受 policy/HR） | session+policy |
| GET | `/api/channel/inquiries` | Inquiry 清單 | session |
| GET | `/api/channel/orders` | Order（Dashboard 成交統計） | session |
| GET | `/api/channel/after-sales` | AfterSale 事件 | session |

### Connectors Context（含 webhook / sync）

| Method | Path | 用途 | Auth |
|---|---|---|---|
| GET | `/api/connectors` | Connector 連線設定清單 | session |
| POST | `/api/connectors/drive/sync` | 手動觸發 drive-ingest | session+policy |
| POST | `/api/connectors/drive/webhook` | Google Drive push 通知入口 | webhook |
| POST | `/api/connectors/facebook/webhook` | FB 留言/訊息 webhook | webhook |
| POST | `/api/internal/loops/step-callback` | worker 回報 step 結果（Edge Fn → API） | svc |

---

## 10.2 Application Services（職責與 TS 介面）

對映 §0.4 的 12 層載體。所有 method 皆非同步、可注入 Repo（測試可 mock），且吃/回 Domain type。

### LoopRunner（§0.4 #4）— 編排 Loop 執行

職責：把 `Loop` 定義展開成 `LoopExecution` 狀態機（§0.11），逐 `LoopStep` 委派給 AgentRunner/Skill/Connector；遇 policy/HR 時把 LX 轉 `waiting_human` 並建 `HumanReview`；重任務丟 queue（§10.4）。

```ts
interface LoopRunner {
  // 建立並排入一次執行（回 queued 的 LX）
  start(input: {
    loopId: string;                        // §0.10 kebab-case, e.g. 'product-lifecycle'
    trigger: LoopTrigger;                  // 'cron' | 'webhook' | 'event' | 'manual'
    payload: Json;                         // 觸發脈絡（driveFileId / productId …）
    actor: Actor;                          // human | agent | system
  }): Promise<LoopExecution>;

  advance(lxId: string): Promise<LoopExecution>;          // 推進下一步（狀態機）
  resume(lxId: string, review: HumanReviewDecision): Promise<LoopExecution>; // HR 後續跑
  cancel(lxId: string, actor: Actor): Promise<LoopExecution>;
  retry(lxId: string, opts?: { stepId?: string }): Promise<LoopExecution>;
}
```

### AgentRunner（§0.4 #8）— 執行單一 Agent

職責：依 Agent code（§0.6 七個之一）取 `Agent` 定義 + `Prompt` → 呼 ContextBuilder 組 context → 過 Harness 呼叫 Claude → 驗證輸出 schema → 落 `AgentRun` + `ContextSnapshot`（可回放）。

```ts
type AgentCode = 'vision'|'ocr'|'price'|'marketing'|'reviewer'|'publisher'|'memory';

interface AgentRunner {
  run<I, O>(input: {
    agent: AgentCode;
    stepId?: string;         // 屬於哪個 LoopStep
    input: I;                // 依該 Agent I/O 契約（見 docs/07）
    actor: Actor;
    traceId: string;         // 貫穿 request→loop→agent→connector（§10.7）
  }): Promise<AgentRun & { output: O }>;
}
```

### ContextBuilder（§0.4 #2）— 組 context

職責：為某次 AgentRun 蒐集所有事實——Entity 快照（Product/Photo…）、`MemoryStore` recall（pgvector）、必要 RAG——輸出可回放的 `ContextSnapshot`。**不呼叫模型**。

```ts
interface ContextBuilder {
  build(input: {
    agent: AgentCode;
    subject: { entity: string; id: string };  // e.g. { entity:'Product', id }
    recall?: { query: string; k: number };    // 走 MemoryStore
  }): Promise<ContextSnapshot>;
  // 供 timeline 聚合（catalog/products/{id}/timeline）
  buildProductTimeline(productId: string): Promise<TimelineEntry[]>;
}
```

### MemoryStore（§0.4 #9）— 記憶讀寫

```ts
interface MemoryStore {
  recall(input: { query: string; type?: MemoryType; k: number }): Promise<Memory[]>; // pgvector
  write(input: { type: MemoryType; content: string; links?: string[]; source: Actor }): Promise<Memory>;
  link(a: string, b: string): Promise<MemoryLink>;   // [[slug]]
}
```

### PolicyEngine（§0.4 #11 / §0.9）— 動作級授權

職責：第二道防線。判斷「這個 Actor 能不能對這個資源做這個動作」，回准駁 + 是否需升級為 HumanReview。

```ts
interface PolicyEngine {
  can(input: {
    actor: Actor;
    action: string;         // 'publish' | 'apply-price' | 'edit-published' | 'reply-inquiry'
    resource: { entity: string; id: string };
    context?: Json;         // e.g. { priceAmount, priceCurrency, confidence }
  }): Promise<{ allow: boolean; requiresHumanReview: boolean; policyId?: string; reason?: string }>;
}
```

### Harness（§0.4 #3）— 包住模型呼叫

職責：所有 Claude 呼叫的唯一外殼——重試、schema 驗證、逾時、token/cost 記帳、trace。模型 id 走 `MODELS.REASONING|VISION|FAST` 常數（§0.3；查 `claude-api` skill，**不硬寫版本字串**）。

```ts
interface Harness {
  call<O>(input: {
    model: keyof typeof MODELS;   // 'REASONING' | 'VISION' | 'FAST'
    prompt: RenderedPrompt;
    schema: ZodSchema<O>;         // 輸出契約驗證
    traceId: string;
    timeoutMs?: number;
    idempotencyKey?: string;      // §10.6
  }): Promise<{ output: O; usage: TokenUsage; costAmount: number; costCurrency: 'USD' }>;
}
```

### EvalRunner（§0.4 #10）— 品質評分

```ts
interface EvalRunner {
  run(input: { target: { kind:'AgentRun'|'LoopExecution'; id:string }; suite: string }): Promise<EvalRun>;
  batch(input: { suite: string; window: 'today'|'week' }): Promise<EvalRun[]>; // cron 批次
}
```

---

## 10.3 同步 API vs 非同步 Worker 邊界

**規則**：使用者互動要即時回應的走**同步 route handler**；耗時（AI 感知、發佈、embedding、跨系統 IO）或需重試/背景的走**非同步 worker（pgmq queue + Edge Function）**。route handler 只負責「入列 + 立即回 202/LX id」，真正工作由 worker 拉 queue 執行，完成後回寫並經 realtime 通知前端（§9.5）。

```
┌──────────────── 同步 (Route Handler, <~1s) ────────────────┐
│  讀取: GET products / loops / reviews / memories …          │
│  輕寫入: PATCH product 欄位、reviews/{id}/decision          │
│  觸發: POST loops/{id}/executions  →  只建 queued LX + 入列 │
│         └─ 立即回 { data: { lxId }, meta }；不等 AI          │
└───────────────────────────┬────────────────────────────────┘
                            │ enqueue (pgmq)
                            ▼
┌──────────────── 非同步 (Edge Function worker) ─────────────┐
│  重任務 queue:                                              │
│   • perceive   → ocr ‖ vision（Claude Vision，數秒）        │
│   • price/compose → reasoning Agent                        │
│   • publish    → facebook connector（外部 IO、需重試）      │
│   • embed      → 產生 Embedding 寫 pgvector                 │
│   • remember   → memory Agent 萃取                          │
│  完成後: 回寫 LoopStep/AgentRun → realtime UPDATE 前端      │
│  失敗: 重試(退避) → 超次數進死信 dlq_* (§10.6)              │
└─────────────────────────────────────────────────────────────┘
```

---

## 10.4 Workers / 非同步 (Edge Functions + pg_cron + pgmq)

依 §0.3。三種入口：**cron 排程**、**queue 消費**、**webhook**。

### pgmq Queues（重任務）

| Queue | 生產者 | 消費者(Edge Fn) | 內容 | 冪等鍵 |
|---|---|---|---|---|
| `q_perceive` | LoopRunner(perceive step) | `worker-perceive` | ocr‖vision 一張 photo | `photoId` |
| `q_price` | LoopRunner(price) | `worker-agent` | price Agent 估價 | `productId+rev` |
| `q_compose` | LoopRunner(compose) | `worker-agent` | marketing 文案 | `productId+rev` |
| `q_publish` | LoopRunner(publish) | `worker-publish` | facebook 發佈 | `listingId` |
| `q_embed` | MemoryStore/perceive | `worker-embed` | 產生 Embedding | `subjectId` |
| `q_remember` | LoopRunner(remember) | `worker-agent` | memory 萃取 | `orderId` |

消費者流程：`pgmq.read` → 執行（經 Service/Connector）→ 成功 `pgmq.delete`；失敗留在 queue 由 visibility timeout 重新可見 → 超過 `max_retries` 由 worker 搬到 `dlq_<name>`（死信）。

### pg_cron 排程

| Cron | 週期 | 動作 |
|---|---|---|
| `cron_drive_ingest` | 每 5 分 | 觸發 `drive-ingest` loop（輪詢 Drive 新照片；webhook 為主、cron 為保底） |
| `cron_hr_overdue` | 每 10 分 | 掃 `human_reviews` 逾時（pending 過久）→ 標 `expired` + LINE 提醒（§10.6 notification） |
| `cron_eval_batch` | 每日 02:00 | `EvalRunner.batch` 對昨日 AgentRun/LX 批次評分 |
| `cron_price_refresh` | 每日 | 觸發 `price-refresh` loop（在架商品重估） |
| `cron_pgmq_dlq_alert` | 每 30 分 | 掃 `dlq_*` 有積壓 → LINE 異常告警 |

### Webhooks

| Webhook | 來源 | 入口 | 動作 |
|---|---|---|---|
| Drive push | Google Drive | `POST /api/connectors/drive/webhook`（或 Edge Fn） | 驗簽 → 觸發 `drive-ingest`（event trigger） |
| FB 留言/訊息 | Facebook Graph | `POST /api/connectors/facebook/webhook` | 驗簽 → 建 `Inquiry` → 觸發 engage step |

> 所有 webhook **先驗簽 + 冪等去重**（記 `provider_event_id`），再入 queue，不在 webhook handler 內做重工作（§10.3）。

---

## 10.5 Automation：Loop 的四種觸發 (§0.4 #5)

`LoopTrigger = 'cron' | 'webhook' | 'event' | 'manual'`。四者最終都收斂到 `LoopRunner.start(...)`，差別只在入口：

```
cron    ── pg_cron 排程 ─────────────►┐
webhook ── /api/connectors/*/webhook ─┤
event   ── DB 變更/domain event ──────┼──► LoopRunner.start({ loopId, trigger, payload, actor })
             (e.g. photo 新增觸發      │        └─ 建 queued LoopExecution → enqueue → worker 推進
              perceive；HR approved    │
              觸發後續 step)           │
manual  ── UI POST loops/{id}/exec ───┘
```

- **cron**：`cron_*`（§10.4），actor=`system`。
- **webhook**：外部 push（Drive/FB），驗簽後轉 event，actor=`system`。
- **event**：domain 事件（`photo.created` → perceive；`human_review.approved` → resume）。實作用 Postgres trigger 寫入 `q_*` 或 domain event outbox，由 worker 消費。
- **manual**：UI 操作者按「觸發 Loop」，actor=human，過 PolicyEngine。

---

## 10.6 冪等 / 重試 / 死信 / Rate Limit / Observability

**冪等 (Idempotency)**
- 每個副作用動作帶 `idempotencyKey`（如 `publish:listingId`、webhook 帶 `provider_event_id`）。
- Repo 寫入用 `on conflict do nothing/update`；`AuditLog` 記每次副作用，重放可去重。
- Harness 呼叫可帶 `idempotencyKey` 避免重複計費/重複產生 `AgentRun`。

**重試 (Retry)**
- 分類錯誤：`transient`（網路/429/5xx）→ 指數退避重試；`permanent`（schema 驗證失敗/4xx 業務錯）→ 不重試，直接標 `failed` step。
- Harness 內建重試（模型 429/逾時）；Connector 重試見 `docs/appendix/F`。

**死信 (Dead Letter)**
- pgmq 消費超過 `max_retries` → 搬到 `dlq_<queue>`；`cron_pgmq_dlq_alert` 告警；UI 可在該 LX 的 failed step 手動 `retry`。

**Rate Limit**
- 對外 Connector（FB/Drive/LINE）依各家配額做 token-bucket（在 Connector 層，§0.8/附錄 F）。
- API route：對 mutation / 觸發類 endpoint 做每 actor 限流（Edge middleware）。

**Observability (§0.4 #12)**
- **trace id 貫穿**：request 入口生成 `traceId` → 傳入 `LoopRunner` → `AgentRunner` → `Harness` → `Connector`，全部落 `LoopStep`/`AgentRun`/`AuditLog`，UI 於 LX trace 頁可複製（§9.2.3）。
- 每步記 cost/token/耗時；`AuditLog` 不可變記所有副作用與決策（誰、對什麼、做了什麼）。

**Notification（LINE 推播，§0.8 `line`）**
- 三類事件經 `line` connector 推播老闆：**HR 待審**（新 `human_reviews.pending`，尤其高價/首發）、**成交**（新 `Order`）、**異常**（`dlq_*` 積壓 / LX `failed` / HR `expired`）。
- 推播由 worker/cron 觸發（非同步），不阻塞主流程；帶深連結回對應 UI 頁（`/review/{id}` 等）。

---

## 10.7 端到端 trace 範例 (Request → Loop → Agent → Connector)

```
POST /api/loops/product-lifecycle/executions        traceId=tr_9f… (生成)
  └─ LoopRunner.start(trigger=manual)                LX#a1b2 queued → enqueue q_perceive
       └─ worker-perceive (pull q_perceive)          LoopStep perceive → running
            ├─ AgentRunner.run(ocr)   ── Harness ──► Claude(FAST)   AgentRun ar_11 $0.006
            └─ AgentRunner.run(vision)── Harness ──► Claude(VISION) AgentRun ar_12 $0.021
       └─ advance → price → PolicyEngine.can(apply-price, {amount:48000})
            └─ requiresHumanReview=true → LX waiting_human + HumanReview HR#102
                 └─ line connector 推播「HR 待審」
       └─ (HR approved) resume → compose → review(reviewer) → publish
            └─ facebook connector 發佈 (idempotencyKey=publish:listing55)  Listing.published
  全程 traceId=tr_9f… 落於 loop_steps / agent_runs / audit_logs
```

---

## 本章交付物 (Deliverables)

1. 後端四層依賴圖（Route Handlers → Application Services → Domain → Repositories）與資料夾對映（§10.0）。
2. MVP API 一覽表，涵蓋 catalog / pricing / loops / agents / reviews(governance) / memories / channel / connectors，含方法、用途、auth 需求，命名對齊 §0.10（§10.1）。
3. 7 個 Application Service（LoopRunner / AgentRunner / ContextBuilder / MemoryStore / PolicyEngine / Harness / EvalRunner）的職責與 TS 介面（§10.2）。
4. 同步 API vs 非同步 worker 邊界圖（§10.3）。
5. Workers 明細：pgmq queues、pg_cron 排程、webhooks（§10.4），與四種 Loop 觸發實作（§10.5）。
6. 冪等 / 重試 / 死信 / rate limit / observability（trace id 貫穿）/ LINE Notification 原則與端到端 trace 範例（§10.6–10.7）。

## 驗收條件 (Acceptance Criteria)

- [ ] 所有 endpoint 路徑符合 §0.10（`/api/<context>/<resource>`、複數、kebab-case、動作用子路徑），且與 `docs/09` 各畫面資料來源一致對得上。
- [ ] 所有 Entity / Agent code / Loop id / 狀態值與 `docs/00` §0.5–0.11 一致；模型 id 走 `MODELS.*` 常數，無硬寫版本字串。
- [ ] 依賴方向嚴格由上而下；Repository 為唯一碰 Supabase 之層；對外副作用全部經 Connector（§0.8）。
- [ ] 每個 Service 有明確單一職責與 TS 介面；Harness 為唯一 Claude 呼叫外殼（含 schema 驗證、cost 記帳、trace）。
- [ ] 重任務（perceive/price/compose/publish/embed/remember）走 pgmq queue + Edge Function；route handler 觸發類只入列並立即回 LX id（§10.3）。
- [ ] 四種 Loop 觸發（cron/webhook/event/manual）皆收斂到 `LoopRunner.start`；webhook 先驗簽 + 冪等去重。
- [ ] 冪等鍵、重試分類（transient vs permanent）、死信 `dlq_*` 告警、rate limit、trace id 貫穿 request→loop→agent→connector 皆已定義；HR/成交/異常經 `line` 推播（§0.8）。
- [ ] 與 `docs/04` 分工明確：本章只寫實作介面/endpoint/worker 細節，不重畫全局架構。

— 見 `docs/04`（系統架構全局）、`docs/05`（狀態機）、`docs/06`（DB schema）、`docs/07`（Agent I/O、Human Review、Permission）、`docs/08`（Workflow）、`docs/09`（前端資料來源對照）、`docs/appendix/C`（API 命名）、`docs/appendix/F`（Connector）。
