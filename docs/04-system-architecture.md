# 04 · System Architecture

> 本章畫 JBG OS 的**整體技術架構**：分層、資料流、部署拓撲、同步/非同步邊界、環境與 secrets、可靠性。
> 技術棧一律以 `docs/00` §0.3 為準，**不可偏離**。命名依 §0.10，狀態機依 §0.11。
> 分工界線：**本章畫架構（層與邊界）；`docs/10` 寫 backend 實作細節（handler/worker/service 內部）。** 兩者不重疊——本章給「地圖」，`docs/10` 給「施工圖」。
>
> 版本：v1.0 · 對應合約：`docs/00` §0.3 / §0.7 / §0.8 / §0.9

---

## 4.0 這一章要回答的問題

1. 系統由哪些層組成、各層職責與**所選技術**（依 §0.3）。
2. 一張照片從 Google Drive 進來，如何一路走到 **FB 上架**（跨元件 sequence）。
3. 部署拓撲：Vercel + Supabase + Edge Functions + cron/queue 怎麼擺。
4. **同步 vs 非同步邊界**：哪些走 request/response，哪些走 queue/worker。
5. 環境（dev/staging/prod）、secrets、Connector 憑證放哪。
6. 可靠性：重試、死信、冪等鍵、observability trace 如何貫穿。
7. 與 `docs/03` 的映射：12 層落在架構圖哪裡。

---

## 4.1 高層架構圖

JBG OS 是「**薄前端 + Next.js API + Supabase 資料/函式平面 + 對外 Connector**」的架構。核心運算不在前端，而在 Loop runtime（Route Handlers + Edge Functions + Workers）。

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT (Browser)                                   │
│  Next.js App Router · React 19 · Tailwind + shadcn/ui                           │
│  Server Components (讀) │ TanStack Query + Zustand (client 互動狀態)             │
└───────────────┬────────────────────────────────────────────────────────────────┘
                │ HTTPS (request/response)
                ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                     API LAYER  (Vercel — Next.js Route Handlers)                │
│  app/api/**  ── REST-ish：/api/<context>/<resource>（§0.10）                    │
│  · 讀寫 entity（Catalog/Pricing/Channel…）  · 觸發 Loop：POST /loops/{id}/executions │
│  · 同步、短任務；長任務只「入列」，不在此處跑                                     │
└───────┬───────────────────────────────────────────────┬────────────────────────┘
        │ SQL / RPC (RLS-first)                          │ enqueue (pgmq)
        ▼                                                ▼
┌───────────────────────────────────────────┐   ┌────────────────────────────────┐
│         SUPABASE DATA PLANE                │   │   ASYNC / WORKER PLANE          │
│  Postgres 15+ (RLS 預設 deny)              │   │  pg_cron (排程觸發)             │
│  · Catalog/Pricing/Perception/Loop/Agent   │   │  pgmq   (訊息佇列 + 死信)        │
│    /Memory/Channel/Governance tables       │   │  Edge Functions (webhook/長任務) │
│  Supabase Auth (human Actor)               │◀─▶│  Trigger(.dev 可外掛，重任務)    │
│  Storage (原圖/縮圖)                        │   │  → LoopRunner / AgentRunner      │
│  pgvector (Embedding / Memory recall)      │   │  → Harness (packages/harness)    │
└───────┬───────────────────────────────────┘   └──────────────┬──────────────────┘
        │                                                       │ 經 Connector（唯一對外通道，§0.8）
        ▼                                                       ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│                    CONNECTOR LAYER  (packages/connectors/*)                      │
│   drive (Google Drive)   │   facebook (Graph API)   │   line (Notify/Messaging)  │
└───────┬───────────────────────────┬───────────────────────────┬────────────────┘
        ▼                           ▼                            ▼
   Google Drive               Facebook Graph                LINE
  (監看/下載照片)              (發文/讀互動)                 (推播老闆)

┌───────────────────────────────────────────────────────────────────────────────┐
│  AI PLANE (被 Harness 呼叫，非獨立服務)                                          │
│   Anthropic Claude → MODELS.REASONING(price/marketing/reviewer/memory)          │
│                    → MODELS.VISION(vision)  → MODELS.FAST(輕任務)                │
│   OCR (見 §0.7) · Embedding: Voyage/OpenAI text-embedding → 存 pgvector          │
└───────────────────────────────────────────────────────────────────────────────┘
```

> 對照題目的「Frontend → API → Supabase → Storage → Google Drive → Vision → OCR → Embedding → Memory → Marketing → Notification」：Frontend/API 在上兩層；Supabase/Storage/pgvector 在 Data Plane；Drive/Vision/OCR/Embedding 是被 Worker Plane 經 Connector 與 AI Plane 觸發；Memory 存在 Postgres+pgvector；Marketing 是 `marketing` Agent（AI Plane）；Notification 是 `line` Connector。

---

## 4.2 各層職責與所選技術（依 §0.3）

| 層 | 職責 | 技術（§0.3，不可偏離） |
|---|---|---|
| **Frontend** | 商品卡審核 UI、Human Review、Loop/執行監看儀表板 | Next.js App Router + React 19 + TS strict；Tailwind + shadcn/ui；Server Components（讀）+ TanStack Query + Zustand（client） |
| **API** | entity CRUD、觸發 Loop、回應 UI；只做同步短任務 | Next.js Route Handlers（`app/api/**`）；回應統一 `{ data, error, meta }`（§0.10） |
| **Data Plane** | 權威狀態、RLS 授權、向量檢索 | Supabase Postgres 15+；Auth（RLS-first）；Storage；pgvector |
| **Async/Worker** | 長任務、Loop 執行、排程、佇列 | Edge Functions；`pg_cron`；`pgmq`；重任務外掛 Trigger.dev |
| **Loop runtime** | 跑 LoopExecution/LoopStep、委派 Agent | `LoopRunner` + `AgentRunner` + `packages/harness`（見 `docs/03`） |
| **Connector** | 唯一對外副作用通道 | `packages/connectors/*`：`drive`/`facebook`/`line`（§0.8） |
| **AI Plane** | 推理 / 視覺 / 向量化 | Anthropic Claude（`MODELS.*`）；OCR（§0.7）；Embedding = Voyage/OpenAI（可換），存 pgvector |

**技術選擇的三條硬規則**（來自 §0.3）：

1. **AI 供應商預設 = Anthropic Claude**；模型 id 一律 `MODELS.REASONING` / `MODELS.VISION` / `MODELS.FAST`，**不硬寫版本字串**。
2. **TypeScript strict，禁 `any`**（除非 `// eslint-disable` 並註明原因）。
3. **所有對外副作用必經 Connector 層**（§0.8）——Agent/Loop/Route Handler 不得直接 `fetch` 外部 API。

---

## 4.3 資料流：一張照片 → FB 上架（跨元件 sequence）  `SHAP-specific`

這是 `product-lifecycle`（§0.7）到 `publish` 階段的跨元件時序。註明每一步走**同步(sync)**還是**非同步(async)**。

```
Drive     pg_cron    drive Conn   Storage   Worker/LoopRunner   AgentRunner+Harness   facebook Conn   Postgres
 │           │           │          │              │                    │                  │             │
 │  (async) 每5分觸發 drive-ingest   │              │                    │                  │             │
 │           ├──────────▶│ listNewFiles            │                    │                  │             │
 │◀──────────┼───────────┤ 掃描監看資料夾           │                    │                  │             │
 │  新檔 meta ┼──────────▶│ download                │                    │                  │             │
 │           │           ├─────────▶│ 存原圖/縮圖  │                    │                  │             │
 │           │           │          ├─────────────▶│ 建 ProductPhoto ───┼──────────────────┼────────────▶│ INSERT product_photos
 │           │           │          │              │ emit photo.ingested│                  │             │
 │           │           │          │              │ (async) 觸發 perceive Loop            │             │
 │           │           │          │              ├──── OCR ‖ Vision 並行 delegate ──────▶│             │
 │           │           │          │              │                    │ ocr → OCRResult  │             │
 │           │           │          │              │                    │ vision→VisionResult            │
 │           │           │          │              │◀───────────────────┤ (Harness 記帳/重試/schema)     │
 │           │           │          │              ├────────────────────┼──────────────────┼────────────▶│ INSERT ocr_results, vision_results
 │           │           │          │              │ (async) assemble → Product 商品卡     │             │
 │           │           │          │              ├────────────────────┼──────────────────┼────────────▶│ UPSERT products
 │           │           │          │              │ gap-check：缺料? → Task/HumanReview   │             │
 │           │           │          │              │ (async) price → PriceSuggestion       │             │
 │           │           │          │              ├── Permission: 超門檻? → require_human_review        │
 │           │           │          │              │ (async) compose → Listing draft(marketing)          │
 │           │           │          │              │ (async) review → Reviewer Agent pass/reject         │
 │           │           │          │              │   reject → 回 assemble/compose        │             │
 │           │           │          │              │ human-review：高風險才進人審(LINE 推播)│             │
 │           │           │          │              │ (async) publish：Permission 檢查 publisher           │
 │           │           │          │              ├────────────────────┼─────────────────▶│ publishPost │
 │           │           │          │              │                    │                  ├── FB Graph ─▶ (post id)
 │           │           │          │              │◀───────────────────┼──────────────────┤             │
 │           │           │          │              ├────────────────────┼──────────────────┼────────────▶│ UPDATE listings → published (§0.11)
 │           │           │          │              │ (async) remember：memory Agent 萃取 → Memory         │
 │           │           │          │              └────────────────────┼──────────────────┼────────────▶│ INSERT memories(+embedding)
```

貫穿全程：同一 `traceId` 串起所有 `LoopStep` / `AgentRun`；每次模型呼叫的 token/cost 記在 `AgentRun`（§0.5）。這條線就是 `docs/03` §3.3 生命週期在真實資料流上的展開。

---

## 4.4 部署拓撲

```
                    ┌────────────────────────── Vercel ──────────────────────────┐
   使用者瀏覽器 ────▶│  Next.js App (Edge/Node runtime)                            │
                    │   · Server Components / RSC                                  │
                    │   · Route Handlers app/api/**  (同步、短)                    │
                    └───────────────┬─────────────────────────────────────────────┘
                                    │ Supabase JS (RLS) / service-role (worker)
                    ┌───────────────▼───────────────── Supabase ──────────────────┐
                    │  Postgres 15+  ── RLS · pgvector · pgmq (queue) · pg_cron    │
                    │  Auth · Storage                                             │
                    │  Edge Functions  ── webhook receiver / 長任務 / LoopRunner    │
                    └───────────────┬─────────────────────────────────────────────┘
                                    │ (可選) 重任務 offload
                    ┌───────────────▼───────────────── Trigger.dev ───────────────┐
                    │  長時 / 高並發 batch job（如大量 perceive 回填）              │
                    └─────────────────────────────────────────────────────────────┘

  外部：Google Drive · Facebook Graph · LINE  ──── 只經 packages/connectors/*
  AI：  Anthropic Claude · OCR · Embedding    ──── 只經 packages/harness
```

放置原則：

- **Vercel** 跑 Next.js（前端 + 同步 API）。**不在 Vercel 跑長任務**（serverless 逾時風險）。
- **Supabase** 是資料與非同步的中心：Postgres（權威狀態）、pgmq（佇列）、pg_cron（排程）、Edge Functions（webhook + LoopRunner + 長任務）。
- **Trigger.dev**（可選）只承接「跑很久 / 很多」的批次；MVP 可先不啟用（§0.3「重任務可外掛」）。

---

## 4.5 同步 vs 非同步邊界

**判準**：使用者要立即看到結果、且能在數百 ms 內完成 → **同步**；牽涉 LLM / 外部 API / 多步 Loop → **非同步**。

```
┌──────────── SYNC (request/response, Vercel Route Handler) ────────────┐
│ · 讀 entity / 列表 / 儀表板                                            │
│ · 建立/編輯商品卡欄位、Human Review 的 approve/reject/edit             │
│ · 「觸發」一個 Loop：POST /api/loops/{id}/executions                   │
│     → 只入列 + 回 LoopExecution(id, status=queued)，不等它跑完         │
└───────────────────────────────────────────────────────────────────────┘
                              │ enqueue (pgmq)
                              ▼
┌──────────── ASYNC (pgmq worker / Edge Function / pg_cron) ────────────┐
│ · 所有 Agent 執行（vision/ocr/price/marketing/reviewer/publisher/memory）│
│ · 所有 Connector 副作用（drive 下載 / facebook 發文 / line 推播）        │
│ · 整條 product-lifecycle 的每個階段（§0.7）                            │
│ · Embedding 產生、Memory 萃取                                          │
└───────────────────────────────────────────────────────────────────────┘
```

規則：

1. **API 從不直接呼叫 LLM 或外部 Connector**——它只入列，回一個可輪詢/可訂閱的 `LoopExecution`。
2. 前端用 **TanStack Query 輪詢** 或 **Supabase Realtime 訂閱** `loop_executions` 狀態變化（`queued→running→…→succeeded`，§0.11）取得進度。
3. **人審是天然的非同步暫停點**：LX 停在 `waiting_human`（§0.11），人在 UI（同步）決策後，worker 續跑。

---

## 4.6 環境、Secrets、Connector 憑證

**三環境**：

| 環境 | 用途 | Supabase project | Vercel | 外部 Connector |
|---|---|---|---|---|
| **dev** | 本機開發 | 本機/dev project | preview（feature 分支） | Drive/FB/LINE 測試帳號 · sandbox |
| **staging** | 上線前驗證 | staging project | preview（main 前） | 測試帳號 |
| **prod** | 正式 | prod project | production | 正式帳號 |

**Secrets 放置**：

```
Vercel 前端/API：
  NEXT_PUBLIC_SUPABASE_URL / ANON_KEY   ← 可公開（受 RLS 保護）
  SUPABASE_SERVICE_ROLE_KEY             ← 僅 server（Route Handler/worker），永不進 client bundle

Supabase Edge Function secrets（supabase secrets set）：
  ANTHROPIC_API_KEY / EMBEDDING_API_KEY / OCR_*  ← AI Plane 憑證
  GOOGLE_DRIVE_* / FACEBOOK_* / LINE_*           ← Connector 憑證

Connector 憑證（OAuth token / refresh token）：
  存 Postgres connectors table（§0.5 Connector entity），欄位加密（pgcrypto / Vault）
  只有 worker（service-role）能讀；RLS 對 anon/human 一律 deny
```

原則：

- **service-role key 只在 server 端**，絕不進前端 bundle。
- **Connector 的長期憑證存 DB（加密）**，不是 env——因為要按 Connector 實例存多組、要能 rotate、要記 refresh。憑證細節見附錄 F。
- **`MODELS.*` 常數** 指向設定檔（§0.3），與 secrets 分離。

---

## 4.7 可靠性：重試、死信、冪等、trace 貫穿

```
觸發(Automation) ──idempotencyKey──▶ pgmq(enqueue) ──▶ worker(LoopRunner)
                                          │                  │
                                          │             執行 step：Harness 重試(§3.4)
                                          │                  │ 成功 → ack
                                          │                  │ 失敗 → 分類
                                          │        ┌─────────┴─────────┐
                                          │   transient/schema      budget/fatal
                                          │   退避重試(max N)         不重試
                                          │        │ 仍失敗            │
                                          └────────▼──────────────────▼──── DEAD LETTER QUEUE
                                                                          │  → 開 Task / 告警 LINE
                                                                          │  → 保留 payload 供人工重放
   traceId ───────────────────────────────────────────────────────────────────────────────▶
   貫穿：LoopExecution / LoopStep / AgentRun / AuditLog（每步同一 traceId，可回放 ContextSnapshot）
```

四個機制：

1. **冪等鍵（idempotencyKey）**：每次觸發帶 key（如 `loopId + sourceEventId`）。LoopRunner 先查有無既有 LX，命中即返回——同一事件重放不重複副作用（見 `docs/03` §3.4）。pgmq message 也帶 key 去重。
2. **重試**：模型呼叫由 Harness 依錯誤類退避重試（§3.4 表）；Connector 呼叫依 rate-limit/transient 重試（附錄 F）。
3. **死信（DLQ）**：重試耗盡 → 進 pgmq 死信佇列 → 開 `Task`（§0.5）+ `line` 告警；payload 保留供人工重放。
4. **Observability trace 貫穿**：一個 `traceId` 串 `LoopExecution`/`LoopStep`/`AgentRun`/`AuditLog`（§0.5）；token/cost 沿 trace 匯總；`ContextSnapshot` 可回放。這是 `docs/03` 第 12 層（Observability）在架構上的落點。

---

## 4.8 與 docs/03 的映射（12 層落在架構圖哪裡）

| `docs/03` 層 | 落在本章架構的位置 |
|---|---|
| 1 Prompt | Worker Plane / `packages/prompts`（被 AgentRunner 載入） |
| 2 Context | Worker Plane / `ContextBuilder`（讀 Postgres + pgvector） |
| 3 Harness | Worker Plane / `packages/harness` → AI Plane |
| 4 Loop | Worker Plane / `LoopRunner`（狀態寫 Postgres `loop_executions`） |
| 5 Automation | `pg_cron` + Edge Function webhook + API 的 `POST /executions` |
| 6 Skill | Worker Plane / `packages/skills`（被 AgentRunner 呼叫） |
| 7 Connector | **Connector Layer**（§4.1 圖），對 Drive/FB/LINE |
| 8 Sub-agent | Worker Plane / `AgentRunner` |
| 9 Memory | Data Plane / Postgres + pgvector（`MemoryStore`） |
| 10 Eval | Worker Plane / `packages/eval`（寫 `eval_runs`） |
| 11 Permission | Data Plane RLS（第一道）+ Worker 的 `PolicyEngine`（第二道，§0.9） |
| 12 Observability | 橫跨 Data+Worker：`loop_executions`/`loop_steps`/`agent_runs`/`audit_logs` + trace |

**與 `docs/10` 的分工**：本章定義「這些層擺在 Vercel / Supabase / Connector / AI Plane 的哪一格、彼此的 sync/async 邊界、憑證與 trace 怎麼走」。`docs/10` 定義「每個 Route Handler / worker / service 的內部實作（函式簽章、pgmq consumer 邏輯、PolicyEngine 規則求值、Connector 內部重試碼）」。**架構在此，實作在 `docs/10`，不重複。**

---

## 本章交付物 (Deliverables)

- [ ] **高層架構圖**（§4.1）用 ``` 畫出 Frontend→API→Supabase→Storage→Drive→Vision→OCR→Embedding→Memory→Marketing→Notification 全鏈路。
- [ ] **各層職責 × 技術對照表**（§4.2），技術完全依 §0.3。
- [ ] **一張照片 → FB 上架** 的跨元件 sequence（§4.3），對齊 §0.7 各階段。
- [ ] **部署拓撲圖**（§4.4）：Vercel + Supabase + Edge Functions + cron/queue（+ 可選 Trigger.dev）。
- [ ] **同步/非同步邊界**（§4.5）：明確列出哪些走 request/response、哪些走 queue/worker。
- [ ] **環境 / secrets / Connector 憑證** 放置說明（§4.6）：dev/staging/prod、service-role 邊界、憑證存 DB 加密。
- [ ] **可靠性機制**（§4.7）：冪等鍵、重試、死信、trace 貫穿，含流程圖。
- [ ] **docs/03 12 層 → 架構位置映射表**（§4.8）與 **與 docs/10 分工界線** 的明確聲明。

## 驗收條件 (Acceptance Criteria)

1. **技術棧合規**：所有技術選擇與 §0.3 逐項相符（Next.js App Router/React 19/TS strict、Tailwind+shadcn、Supabase Postgres/Auth/Storage/pgvector、pg_cron/pgmq/Edge Functions、Vercel、Anthropic Claude、Voyage/OpenAI embedding），無自創替代技術。
2. **模型 id 合規**：無硬寫模型版本字串，一律 `MODELS.REASONING`/`VISION`/`FAST`（§0.3）。
3. **Connector 唯一性**：文中明確聲明所有對外副作用經 `packages/connectors/*`（`drive`/`facebook`/`line`，§0.8），API/Agent/Loop 不直接 fetch。
4. **資料流對齊 §0.7**：§4.3 sequence 覆蓋 drive-ingest→perceive→assemble→gap-check→price→compose→review→(human-review)→publish→remember，階段名與 §0.7 一致。
5. **狀態機一致**：出現的 `loop_execution_status`（`queued`/`running`/`waiting_human`/`succeeded`/`failed`/`cancelled`）與 `listing_status`（…`published`…）與 §0.11 相符。
6. **sync/async 邊界明確**：§4.5 清楚指出 LLM/Connector/多步 Loop 一律非同步；API 只入列並回 `LoopExecution(queued)`。
7. **可靠性四件套齊全**：冪等鍵、重試、死信、trace 貫穿皆有具體落點，且冪等/重試與 `docs/03` §3.4 呼應。
8. **不與 docs/10 重疊**：本章停在「層與邊界」層級，未寫 handler/worker 內部實作碼，並以 §4.8 明確劃出與 `docs/10` 的界線。
9. **命名一致**：table 名（複數 snake_case）、API 路徑（`/api/<context>/<resource>`）、回應封裝 `{ data, error, meta }` 皆依 §0.10。
