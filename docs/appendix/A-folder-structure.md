# 附錄 A · Folder Structure

> 本附錄把 §0.10 的檔名規範展開成**整個 monorepo 的完整資料夾規範**，並對應 §0.4 的 Loop Engineering 12 層與 §0.5 的 Bounded Context。
> 若本附錄與 `docs/00-canonical-model.md` 衝突，**以 00 為準**。
> 語言規範依 §0.12：敘述用正體中文，所有路徑 / 檔名 / 識別碼一律英文。

---

## A.1 設計原則 (Why this layout)

JBG OS 是「先寫 OS 層（可重用），再把 SHAP 套上去」(§0.1)。資料夾結構必須讓人**一眼看出某段程式碼屬於 12 層中的哪一層、屬於哪個 Bounded Context**。因此我們用兩條正交的軸線切分：

1. **依「Loop Engineering 層」分 package**（§0.4）：`harness` / `prompts` / `skills` / `connectors` / `eval` / `domain` / `db` 各自成 package，彼此依賴方向單一（domain 最底層，其餘往上疊）。
2. **依「Bounded Context」分 module**（§0.5）：在 `domain`、`db`、app 的 feature 內，再以 context（catalog / pricing / perception / loop / agent / memory / channel / governance）為次級資料夾。

> 一句話：**package = 層 (layer)；package 內的資料夾 = context。** 這樣「Prompt→Context→Harness→Loop→…→Observability」的依賴順序在檔案系統上是可見的、可 lint 的。

### A.1.1 依賴方向（不可逆）

```
app  ─┐
      ├─→ eval ──→ harness ──→ prompts
      ├─→ skills ──→ connectors ──→ domain ──→ db
      └─→ (app 可依賴以上全部；db 不依賴任何 package)
```

- `db` 最底層：只放 schema/型別/migration，不 import 任何其他 package。
- `domain` 只依賴 `db` 的型別，不碰 IO。
- `connectors` 是唯一允許對外 `fetch` 的層（呼應 §0.8：Agent/Loop 不得直接 fetch）。
- `app` 是唯一組裝層，可依賴全部 package，但**不可**被任何 package 反向依賴。

---

## A.2 完整資料夾樹 (The Full Tree)

```
jbg-os/
├── app/                          # Next.js App Router（唯一的部署單元，見附錄 B）
│   ├── (marketing)/              # 公開行銷頁 route group（landing、pricing）
│   ├── (app)/                    # 登入後的產品 UI route group
│   │   ├── catalog/              # 商品目錄畫面（Product/ProductPhoto）
│   │   ├── loops/                # Loop / LoopExecution 監控台
│   │   ├── reviews/              # Human Review 佇列（HR 關卡）
│   │   └── memory/               # Memory 瀏覽/編輯
│   ├── api/                      # Route Handlers = Backend API（§0.3、附錄 C）
│   │   ├── catalog/              # /api/catalog/* （products…）
│   │   ├── pricing/              # /api/pricing/*
│   │   ├── loops/                # /api/loops/*（含 {id}/executions 動作型）
│   │   ├── agents/               # /api/agents/*
│   │   ├── governance/           # /api/governance/*（reviews、audit、policies）
│   │   └── webhooks/             # 外部回呼入口（FB/LINE）→ 轉交 Edge Function
│   ├── layout.tsx                # 全站 root layout
│   └── env.ts                    # zod 驗證過的環境變數（附錄 B §B.6）
│
├── packages/                     # 可重用的 OS 層，依 §0.4 分層
│   ├── db/                       # 【最底層】Supabase schema 的 TS 鏡像
│   │   ├── src/
│   │   │   ├── types.ts          # supabase gen types 產出的 Database 型別
│   │   │   ├── enums.ts          # 集中匯出所有 pg enum（§0.11 狀態機）
│   │   │   └── client.ts         # createClient factory（server/service role）
│   │   └── package.json
│   │
│   ├── domain/                   # 【第 5 層對應】DDD Entity、value object、狀態機
│   │   ├── src/
│   │   │   ├── catalog/          # Product, ProductPhoto, Brand, Category
│   │   │   ├── pricing/          # Price, PriceHistory, PriceSuggestion
│   │   │   ├── perception/       # OCRResult, VisionResult, Embedding
│   │   │   ├── loop/             # Loop, LoopExecution, LoopStep, Workflow, Task
│   │   │   ├── agent/            # Agent, AgentRun, Skill, Prompt, ContextSnapshot
│   │   │   ├── memory/           # Memory, MemoryLink
│   │   │   ├── channel/          # Connector, Listing, Inquiry, Order, AfterSale
│   │   │   ├── governance/       # HumanReview, Policy, AuditLog, EvalRun, Actor
│   │   │   └── shared/           # Result、Id、Money value object、狀態機 helper
│   │   └── package.json
│   │
│   ├── prompts/                  # 【層1 Prompt】版本化 prompt 模板
│   │   ├── src/
│   │   │   ├── vision/           # 每個 Canonical Agent 一個資料夾（§0.6）
│   │   │   ├── ocr/
│   │   │   ├── price/
│   │   │   ├── marketing/
│   │   │   ├── reviewer/
│   │   │   ├── publisher/
│   │   │   ├── memory/
│   │   │   ├── _partials/        # 共用片段（角色、輸出契約樣板）
│   │   │   └── registry.ts       # promptId → 版本 對照表
│   │   └── package.json
│   │
│   ├── harness/                  # 【層3 Harness】包住模型呼叫的執行外殼
│   │   ├── src/
│   │   │   ├── run.ts            # runModel(): 重試/schema 驗證/token 記帳/逾時
│   │   │   ├── models.ts         # MODELS.REASONING/VISION/FAST 常數（§0.3）
│   │   │   ├── context-builder.ts# ContextBuilder service（層2 Context）
│   │   │   ├── schema.ts         # zod I/O 契約驗證
│   │   │   └── cost.ts           # token/成本記帳
│   │   └── package.json
│   │
│   ├── skills/                   # 【層6 Skill】可被 Agent/Loop 呼叫的能力單元
│   │   ├── src/
│   │   │   ├── extract-brand/    # 一個 skill 一個資料夾，id 用 kebab-case 動詞開頭
│   │   │   ├── estimate-price/
│   │   │   ├── compose-fb-post/
│   │   │   ├── _template/        # 新 skill 的骨架（見附錄 E）
│   │   │   └── registry.ts       # skillId → handler 對照
│   │   └── package.json
│   │
│   ├── connectors/               # 【層7 Connector】唯一允許對外 IO 的層（§0.8）
│   │   ├── src/
│   │   │   ├── drive/            # Google Drive（唯讀為主）
│   │   │   ├── facebook/         # Facebook Graph（讀互動 / 寫貼文）
│   │   │   ├── line/             # LINE 推播
│   │   │   ├── _base/            # 共用：憑證、重試、rate limit、冪等（附錄 F）
│   │   │   └── registry.ts       # connectorId → client 對照
│   │   └── package.json
│   │
│   └── eval/                     # 【層10 Eval】Loop/Agent 輸出品質評分
│       ├── src/
│       │   ├── graders/          # 各種自動評分器
│       │   ├── datasets/         # 黃金測試集
│       │   └── run.ts            # EvalRun 執行器
│       └── package.json
│
├── supabase/                     # 資料庫與 serverless（§0.3 DB/Auth/Storage/Functions）
│   ├── migrations/               # 依序的 SQL migration（命名見附錄 D §D.11）
│   ├── functions/                # Edge Functions：webhook、長任務、pgmq consumer
│   │   ├── drive-ingest/         # 對應 [drive-ingest] 階段
│   │   ├── fb-webhook/           # Facebook 回呼
│   │   └── line-notify/          # LINE 推播 worker
│   ├── seed/                     # 種子資料（brands、categories、policies…）
│   └── config.toml               # Supabase 本地設定
│
├── docs/                         # 本書（Architecture Bible）
│   ├── 00-canonical-model.md     # 全書合約（SSOT）
│   ├── 01..12-*.md               # 各章
│   └── appendix/                 # 本附錄群 A–K
│
├── scripts/                      # 開發/維運腳本（TS 或 bash）
│   ├── gen-db-types.ts           # 從 Supabase 產 packages/db 型別
│   ├── new-agent.ts              # scaffold 新 Agent（見 A.4）
│   ├── new-loop.ts               # scaffold 新 Loop
│   └── new-skill.ts              # scaffold 新 Skill
│
├── tests/                        # 跨 package 的整合 / e2e 測試
│   ├── integration/              # 跨層整合（loop runner + skills + db）
│   ├── e2e/                      # Playwright 走 product-lifecycle 主流程
│   └── fixtures/                 # 共用測試資料
│
├── package.json                  # workspace root（pnpm workspaces）
├── pnpm-workspace.yaml
├── turbo.json                    # turborepo pipeline（build/test/lint）
├── tsconfig.base.json            # strict：全專案禁 any（§0.3）
└── .env.example                  # 環境變數樣板（實際值不進 git）
```

---

## A.3 為什麼這樣分層 (Layer ↔ Context 對照)

### A.3.1 packages ↔ §0.4 的 12 層

| §0.4 層 | 載體（00 定義） | 本 repo 位置 |
|---|---|---|
| 1 Prompt | `packages/prompts/*` | `packages/prompts/` |
| 2 Context | `ContextBuilder` service | `packages/harness/src/context-builder.ts` |
| 3 Harness | `packages/harness` | `packages/harness/` |
| 4 Loop | `Loop` entity + `LoopRunner` | `packages/domain/src/loop/` + runner 在 `app`/Edge Function |
| 5 Automation | `pg_cron` + `Trigger` | `supabase/` (`pg_cron`, `functions/`) |
| 6 Skill | `packages/skills/*` | `packages/skills/` |
| 7 Connector | `packages/connectors/*` | `packages/connectors/` |
| 8 Sub-agent | `AgentRunner` | `packages/harness` 組裝 + `domain/agent` |
| 9 Memory | `Memory` entity + `MemoryStore` | `packages/domain/src/memory/` |
| 10 Eval | `packages/eval` + `EvalRun` | `packages/eval/` |
| 11 Permission | RLS + `PolicyEngine` | `supabase/migrations`(RLS) + `domain/governance` |
| 12 Observability | `LoopExecution` + `AuditLog` + trace | `domain/loop` + `domain/governance` + harness cost/trace |

### A.3.2 資料夾 ↔ §0.5 的 8 個 Bounded Context

`domain/`、`db`（migration 分檔）、與 `app/api/` 的次級資料夾**一律用同一組 context 名**：`catalog / pricing / perception / loop / agent / memory / channel / governance`。這讓「Entity → domain 檔 → DB table → API route」四者路徑同名、可對照。

> 範例對照（`Product`）：
> `packages/domain/src/catalog/product.ts` → table `products`（migration `..._create_catalog_products.sql`）→ `app/api/catalog/products/route.ts`。

---

## A.4 檔案放置規則 (Where does a new X go?)

以下四張表定義：新增一個 **Agent / Loop / Skill / Connector / API endpoint** 分別要動哪些檔案。皆遵 §0.10 命名。

### A.4.1 新增一個 Agent（§0.6）

以新增 `price` Agent 為例（代號 kebab/lower）：

| 要做的事 | 檔案 |
|---|---|
| Prompt 模板 | `packages/prompts/src/price/estimate.md` + 在 `registry.ts` 註冊版本 |
| I/O 契約（zod schema） | `packages/domain/src/agent/agents/price.contract.ts` |
| Agent 定義（角色、可用 skill/connector） | `packages/domain/src/agent/agents/price.agent.ts` |
| DB：`agents` 一列 + `agent_runs` 沿用 | `supabase/seed/agents.sql`（插入 `price` 定義） |
| 執行組裝（呼叫 harness） | 由 `AgentRunner`（harness）讀 registry，通常免新檔 |
| 測試 | `tests/integration/price-agent.test.ts` |
| 文件 | 契約寫進 `docs/07`；本附錄不重複 |

> 用 `scripts/new-agent.ts price` 一次 scaffold 上述骨架。

### A.4.2 新增一個 Loop（§0.7）

以 `drive-ingest` 為例（Loop id = kebab-case）：

| 要做的事 | 檔案 |
|---|---|
| Loop 定義（步驟圖、觸發、終止條件） | `packages/domain/src/loop/loops/drive-ingest.loop.ts` |
| 觸發（cron/webhook） | `supabase/functions/drive-ingest/`（Edge Function）或 `pg_cron` migration |
| 若含新 stage 呼叫的 skill | 見 A.4.3 |
| DB：`loops` 一列 | `supabase/seed/loops.sql` |
| 監控 UI（可選） | `app/(app)/loops/[id]/` |
| 測試 | `tests/integration/drive-ingest.loop.test.ts` |

### A.4.3 新增一個 Skill（§0.4 層6）

Skill id 用 kebab-case、動詞開頭（`extract-brand`）：

| 要做的事 | 檔案 |
|---|---|
| Skill handler + 輸入輸出 schema | `packages/skills/src/extract-brand/index.ts` |
| 註冊 | `packages/skills/src/registry.ts` 加一行 |
| 單元測試 | `packages/skills/src/extract-brand/index.test.ts` |
| （若需 prompt）prompt | 放 `packages/prompts/`，skill 只引用 promptId |

> 骨架複製自 `packages/skills/src/_template/`；細節見附錄 E。

### A.4.4 新增一個 Connector（§0.8）

所有對外副作用**必須**經此層：

| 要做的事 | 檔案 |
|---|---|
| Client 實作（讀/寫方法） | `packages/connectors/src/<name>/index.ts` |
| 憑證/重試/rate limit/冪等 | 沿用 `packages/connectors/src/_base/`（附錄 F） |
| 註冊 | `packages/connectors/src/registry.ts` |
| DB：`connectors` 設定列 | `supabase/seed/connectors.sql` |
| Webhook 入口（若有回呼） | `app/api/webhooks/<name>/route.ts` → 轉 Edge Function |

### A.4.5 新增一個 API endpoint（附錄 C）

路徑 `/api/<context>/<resource>`（複數、kebab-case）：

| 要做的事 | 檔案 |
|---|---|
| CRUD 資源 | `app/api/<context>/<resource>/route.ts`（`GET`/`POST`） |
| 單一資源 | `app/api/<context>/<resource>/[id]/route.ts` |
| 動作型子路徑 | `app/api/<context>/<resource>/[id]/<action>/route.ts`（如 `loops/[id]/executions`） |
| 回應封裝 | 一律 `{ data, error, meta }`（附錄 C §C.3） |
| 授權 | RLS + `PolicyEngine`（§0.9），在 handler 開頭檢查 |

---

## A.5 命名對照：good / bad

| 情境 | ✅ good | ❌ bad | 理由 |
|---|---|---|---|
| package 名 | `packages/connectors` | `packages/integrations` | 全書用 §0.4 的「Connector」一詞 |
| domain 檔名 | `product-photo.ts` | `ProductPhoto.ts` | 非 React 元件用 kebab-case（§0.10） |
| React 元件檔 | `ProductCard.tsx` | `product-card.tsx` | 元件用 PascalCase（§0.10） |
| context 資料夾 | `perception/` | `ai-extraction/` | 用 §0.5 的 context 名 |
| Skill 資料夾 | `estimate-price/` | `priceEstimator/` | kebab + 動詞開頭（§0.10） |
| Loop 檔 | `product-lifecycle.loop.ts` | `productLifecycle.ts` | Loop id kebab-case（§0.10） |
| migration | `20260707T0900_create_catalog_products.sql` | `products.sql` | 附錄 D §D.11 |
| 對外 fetch | 放 `packages/connectors/` | 在 skill 內直接 `fetch` | §0.8：副作用必經 Connector |

---

## A.6 檢查清單 (Checklist)

- [ ] 新程式碼放進**對的 package = 對的層**（§0.4），且未違反 A.1.1 的依賴方向（不出現 `db` import 其他 package）。
- [ ] package 內以 **§0.5 的 context 名**開次級資料夾（catalog/pricing/…/governance），未自創 context 名。
- [ ] 檔名遵 §0.10：一般 `.ts` 用 kebab-case，React 元件 `.tsx` 用 PascalCase。
- [ ] 任何對外 `fetch` 都在 `packages/connectors/`，Agent/Loop/Skill 未直接呼叫外部 API（§0.8）。
- [ ] 新 Agent/Loop/Skill/Connector/endpoint 已按 A.4 各表補齊**所有**對應檔案（含 seed、測試、註冊）。
- [ ] Entity ↔ domain 檔 ↔ table ↔ API route **四者同 context 名**、可對照（A.3.2）。
- [ ] 未在單一章節私自發明 Entity / context（§0.5 新增規則）。
- [ ] `MODELS.*` 常數只在 `packages/harness/src/models.ts` 定義，未硬寫模型字串（§0.3）。
