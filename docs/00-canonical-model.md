# 00 · Canonical Model — JBG OS 全書合約 (Single Source of Truth)

> **這份文件是整本 Architecture Bible 的「合約」。**
> 其他所有章節（01–12）與附錄（A–K）**必須**引用本文件定義的名詞、Entity 名稱、命名規則與代號。
> 若任何章節與本文件衝突，**以本文件為準**；發現衝突請修正該章節，而不是修改本文件（除非本文件本身有錯）。
>
> 版本：v1.0 · 最後更新：2026-07-07

---

## 0.1 這是什麼 (What JBG OS Is)

**JBG OS = AI Business Operating System。**

它不是一個「二手商品管理系統」。它是一套**可重複套用的 AI 商品生命週期作業系統**，用 Loop Engineering 的思想把「一個人腦中的生意流程」外化成**可被 AI Agent 執行、可被人類審核、可被記憶累積、可被觀測**的系統。

- **JBG OS** = 平台本體（架構、Loop runtime、Agent runtime、Memory、Permission、Observability）。
- **Second-Hand AI Platform (SHAP)** = 跑在 JBG OS 上的**第一個實作案例 (first vertical)**。用來把二手/代購商品從「一張 Google Drive 照片」變成「FB 上成交、售後、並沉澱成記憶」。

> 全書寫作原則：**先寫 OS 層（可重用），再把 SHAP 當範例套上去。** 任何只對二手業務成立、無法重用的東西，要明確標記為 `SHAP-specific`。

---

## 0.2 產品代號與縮寫 (Canonical Abbreviations)

| 縮寫 | 全名 | 說明 |
|---|---|---|
| **JBG OS** | JBG Operating System | 平台本體 |
| **SHAP** | Second-Hand AI Platform | 第一個 vertical 實作 |
| **Loop** | Loop Engineering Loop | 一個完整的自動化迴圈定義 |
| **LX** | Loop Execution | Loop 的一次執行實例 |
| **Agent** | AI Agent | 有明確 I/O 契約的 AI 執行單元 |
| **HR** | Human Review | 人類審核關卡 |
| **DDD** | Domain-Driven Design | 領域驅動設計 |
| **SSOT** | Single Source of Truth | 單一事實來源（本文件） |

---

## 0.3 技術棧 (Canonical Tech Stack) — 不可偏離

| 層 | 技術 | 版本策略 |
|---|---|---|
| Frontend | **Next.js (App Router) + React + TypeScript** | Next 15+, React 19 |
| UI | **Tailwind CSS + shadcn/ui** | latest |
| State/Data | **TanStack Query + Zustand**（client）、**Server Components**（server） | latest |
| Backend API | **Next.js Route Handlers**（`app/api/**`）+ 少量 **Supabase Edge Functions**（webhook/長任務） | — |
| DB | **Supabase Postgres** | 15+ |
| Auth | **Supabase Auth** (RLS-first) | — |
| Storage | **Supabase Storage** | — |
| Vector | **Supabase pgvector** | embedding memory |
| Queue / Worker | **Supabase Edge Functions + `pg_cron` + `pgmq`**（訊息佇列）；重任務可外掛 **Trigger.dev** | 見 §10 |
| AI | **Anthropic Claude**（主推理 / Agent / Vision）、**Claude Vision**（圖片理解）、OCR 見 §0.7 | 見 `docs/appendix/H` |
| Embedding | **Voyage / OpenAI text-embedding**（可換），存 pgvector | — |
| Connector | Google Drive、Facebook Graph、LINE Notify（見 §0.8） | — |
| Hosting | **Vercel**（web）+ **Supabase**（data/functions） | — |
| Lang | **TypeScript strict**，全專案禁 `any`（除非 `// eslint-disable` 且註明原因） | — |

> **AI 供應商預設 = Anthropic Claude。** 模型 id 與定價一律查 `claude-api` skill，不要憑記憶寫死；本書 code 範例統一用常數 `MODELS.REASONING` / `MODELS.VISION` / `MODELS.FAST` 指向設定檔，不硬寫版本字串。

---

## 0.4 核心概念詞彙表 (Glossary) — Loop Engineering 12 層

全書談 Loop Engineering 時，一律使用這 12 個層級名稱（順序即依賴順序）：

| # | 層 | 一句話定義 | 在 JBG OS 中的載體 |
|---|---|---|---|
| 1 | **Prompt** | 給模型的指令模板（含角色、任務、輸出契約） | `packages/prompts/*` |
| 2 | **Context** | 這次執行要餵給模型的所有事實（RAG、memory、entity 快照） | `ContextBuilder` service |
| 3 | **Harness** | 包住模型呼叫的執行外殼（重試、schema 驗證、token 記帳、逾時） | `packages/harness` |
| 4 | **Loop** | 由多步驟串成、有終止條件的自動化迴圈定義 | `Loop` entity + `LoopRunner` |
| 5 | **Automation** | 觸發 Loop 的機制（cron / webhook / 事件 / 手動） | `pg_cron` + `Trigger` |
| 6 | **Skill** | 可被 Agent/Loop 呼叫的、封裝好的能力單元（純函式或 sub-loop） | `packages/skills/*` |
| 7 | **Connector** | 對外部系統（Drive/FB/LINE）讀寫的介面層 | `packages/connectors/*` |
| 8 | **Sub-agent** | 被主流程委派、有獨立 context 的 Agent | `AgentRunner`（見 §0.6） |
| 9 | **Memory** | 跨執行累積的事實與偏好（含 vector recall） | `Memory` entity + `MemoryStore` |
| 10 | **Eval** | 對 Loop/Agent 輸出品質的自動與人工評分 | `packages/eval` + `EvalRun` |
| 11 | **Permission** | 誰/哪個 Agent 能對哪個資源做哪個動作 | RLS + `PolicyEngine`（見 §0.9） |
| 12 | **Observability** | 每一步的 trace、log、metric、cost、狀態 | `LoopExecution` + `AuditLog` + trace |

> 記法：**Prompt → Context → Harness → Loop → Automation → Skill → Connector → Sub-agent → Memory → Eval → Permission → Observability。**

---

## 0.5 Canonical Entities（DDD 名稱）— 不可改名

以下是全書唯一合法的 Entity 名稱。**PascalCase = domain/程式碼中的 Entity；snake_case = 對應 DB table（見 §0.10）。**

### Bounded Context 分組

- **Catalog Context（商品目錄）**：`Product`、`ProductPhoto`、`Brand`、`Category`
- **Pricing Context（定價）**：`Price`、`PriceHistory`、`PriceSuggestion`
- **Perception Context（感知/AI 抽取）**：`OCRResult`、`VisionResult`、`Embedding`
- **Loop Context（自動化核心）**：`Loop`、`LoopExecution`、`LoopStep`、`Workflow`、`Task`
- **Agent Context（AI 執行單元）**：`Agent`、`AgentRun`、`Skill`、`Prompt`、`ContextSnapshot`
- **Memory Context（記憶）**：`Memory`、`MemoryLink`
- **Channel Context（外部通路）**：`Connector`、`Listing`、`Inquiry`、`Order`、`AfterSale`
- **Governance Context（治理）**：`HumanReview`、`Policy`、`AuditLog`、`EvalRun`、`Actor`
- **Platform / Eventing（跨切面基礎設施）**：`DomainEvent`、`EventOutbox`（事件驅動 Loop 的骨幹；詳見 `docs/05` §5.14）

### Entity 一覽（權威定義）

| Entity | Context | 一句話定義 | 關鍵關聯 |
|---|---|---|---|
| `Product` | Catalog | 一件待售/已售商品（aggregate root） | has many `ProductPhoto`, `PriceHistory`; belongs to `Brand`,`Category` |
| `ProductPhoto` | Catalog | 一張商品照片（源自 Drive） | belongs to `Product`; has one `OCRResult`,`VisionResult` |
| `Brand` | Catalog | 品牌（Chanel / Nike…） | has many `Product` |
| `Category` | Catalog | 品類（包/鞋/家電…） | has many `Product` |
| `Price` | Pricing | 商品當前定價（value object on Product） | — |
| `PriceHistory` | Pricing | 定價變更的一筆歷史 | belongs to `Product` |
| `PriceSuggestion` | Pricing | Price Agent 產生的建議（含理由、信心） | belongs to `Product`, `AgentRun` |
| `OCRResult` | Perception | 一張照片的文字抽取結果 | belongs to `ProductPhoto` |
| `VisionResult` | Perception | 一張照片的視覺理解結果（品牌/瑕疵/屬性） | belongs to `ProductPhoto` |
| `Embedding` | Perception | 某實體的向量（文字或圖） | polymorphic → `Product`/`Memory` |
| `Loop` | Loop | 一個 Loop 的**定義**（步驟圖、觸發、終止條件） | has many `LoopExecution` |
| `LoopExecution` (LX) | Loop | 一次 Loop 執行實例（狀態機） | has many `LoopStep`; belongs to `Loop` |
| `LoopStep` | Loop | LX 中的一步（對應一次 Agent/Skill/Connector 呼叫） | belongs to `LoopExecution` |
| `Workflow` | Loop | 多個 Loop 組成的更大業務流程（SHAP 主流程） | orchestrates `Loop` |
| `Task` | Loop | 需要被處理的工作單（可指派給 Agent 或人） | may spawn `LoopExecution` / `HumanReview` |
| `Agent` | Agent | 一個 AI 執行單元的**定義**（角色、I/O schema、可用 skill/connector） | has many `AgentRun` |
| `AgentRun` | Agent | Agent 的一次執行（input/output/cost/trace） | belongs to `Agent`,`LoopStep` |
| `Skill` | Agent | 可被呼叫的能力單元定義 | used by `Agent`/`Loop` |
| `Prompt` | Agent | 版本化的 prompt 模板 | used by `Agent` |
| `ContextSnapshot` | Agent | 某次執行實際餵入模型的 context（可回放） | belongs to `AgentRun` |
| `Memory` | Memory | 一條跨執行的記憶（fact/preference/feedback/reference） | has `Embedding`; has many `MemoryLink` |
| `MemoryLink` | Memory | 記憶之間的關聯（`[[slug]]`） | between two `Memory` |
| `Connector` | Channel | 對外系統的連線設定與憑證 | Drive/FB/LINE |
| `Listing` | Channel | 商品在某通路（FB）上的刊登 | belongs to `Product`,`Connector` |
| `Inquiry` | Channel | 一則客戶詢問 | belongs to `Listing`; may become `Order` |
| `Order` | Channel | 一筆成交 | belongs to `Product`,`Inquiry` |
| `AfterSale` | Channel | 售後事件（退換/客訴/回購） | belongs to `Order` |
| `HumanReview` (HR) | Governance | 一個等待人類決策的關卡 | belongs to polymorphic target |
| `Policy` | Governance | 一條權限規則 | evaluated by `PolicyEngine` |
| `AuditLog` | Governance | 一條不可變的動作紀錄 | polymorphic |
| `EvalRun` | Governance | 對某輸出的一次評分 | belongs to `AgentRun`/`LoopExecution` |
| `Actor` | Governance | 動作的發起者（human user 或 agent 或 system） | — |
| `DomainEvent` | Platform | 一則已發生的領域事件（`PhotoIngested`…），驅動 Loop 觸發 | polymorphic → source aggregate |
| `EventOutbox` | Platform | transactional outbox：確保領域事件與狀態變更原子落地後才派送 | wraps `DomainEvent` |

> **新增 Entity 的規則**：任何章節若需要新 Entity，必須先加進本表並說明 Context，再於該章使用。禁止在單一章節私自發明 Entity。

---

## 0.6 Canonical Agents（7 個 + 人類關卡）

全書 Agent 一律使用這些名稱與代號。每個 Agent 的**完整 I/O 契約**寫在 `docs/07`；此處是權威清單。

| Agent | 代號 | 職責 | 主要輸入 | 主要輸出 | 預設需要 HR？ |
|---|---|---|---|---|---|
| **Vision Agent** | `vision` | 看照片：辨識品牌、品類、顏色、瑕疵、附件、可信度 | `ProductPhoto` | `VisionResult` | 否（低信心才升級） |
| **OCR Agent** | `ocr` | 抽文字：吊牌/型號/序號/尺寸/成分 | `ProductPhoto` | `OCRResult` | 否 |
| **Price Agent** | `price` | 估價：給建議售價、區間、理由、信心 | `Product`+市場記憶 | `PriceSuggestion` | 高價/低信心 → 是 |
| **Marketing Agent** | `marketing` | 寫文案：FB 貼文、標題、hashtag、賣點 | `Product` | `Listing` draft | 是（首次上架） |
| **Reviewer Agent** | `reviewer` | 品管：檢查商品卡完整性、文案合規、價格合理性，決定放行或退回 | 商品卡草稿 | pass / reject + 理由 | — （它本身是自動審） |
| **Publisher Agent** | `publisher` | 發佈：把通過的 Listing 送上 FB、記錄結果 | approved `Listing` | FB post + `Listing.published` | 否（但受 Permission 管） |
| **Memory Agent** | `memory` | 記憶：從成交/詢問/售後萃取可重用事實並寫入 Memory | events | `Memory` records | 否 |

**Human Review** 不是 Agent，是**關卡**：由 `Reviewer Agent` 或 Policy 觸發，交給人類在 UI 上 approve/reject/edit。詳見 `docs/07` §Human Review 與附錄 K。

> Agent 分工原則：**Perception（vision/ocr）只描述事實 → Reasoning（price/marketing）產生主張 → Reviewer 把關 → Publisher 執行 → Memory 沉澱。** 每個 Agent 單一職責，不越界。

---

## 0.7 SHAP 主流程 (The Canonical Loop) — 全書統一版本

SHAP 的核心 Workflow 叫 **`product-lifecycle`**，由這些階段組成（全書畫流程時用同一套階段名與狀態）：

```
[drive-ingest] 抓 Google Drive 新照片
      ↓
[perceive]     OCR Agent ‖ Vision Agent（並行）
      ↓
[assemble]     組出 Product 商品卡（合併 OCR+Vision）
      ↓
[gap-check]    缺資料？ → 產生 Task / HumanReview 補件
      ↓
[price]        Price Agent 估價 → PriceSuggestion
      ↓
[compose]      Marketing Agent 寫文案 → Listing draft
      ↓
[review]       Reviewer Agent 自動審 → pass / reject
      ↓  (reject → 回 assemble/compose)
[human-review] 高風險才進人審（價格/合規）
      ↓
[publish]      Publisher Agent 發 FB → Listing.published
      ↓
[engage]       接住 Inquiry（客服；MVP 半自動）
      ↓
[close]        成交 → Order
      ↓
[aftersale]    售後事件 → AfterSale
      ↓
[remember]     Memory Agent 萃取事實 → Memory
```

- 每個 `[stage]` 是一個 `Loop` 或 `LoopStep`；整條線是 `Workflow: product-lifecycle`。
- 狀態機的權威定義在 `docs/08`（Workflow）與 `docs/05` §State Machine。
- `‖` = 並行；括號註記回退邊。

---

## 0.8 Canonical Connectors

| Connector | 對象 | 讀 | 寫 | 章節 |
|---|---|---|---|---|
| `drive` | Google Drive | 監看資料夾、下載照片、讀 metadata | （唯讀為主） | `docs/04`,`appendix/F` |
| `facebook` | Facebook Graph API | 讀貼文互動/留言 | 發佈貼文、回留言 | `docs/07 publisher`,`appendix/F` |
| `line` | LINE Notify / Messaging | — | 推播通知給老闆（HR、成交、異常） | `docs/10` |

> Connector 設計準則（憑證、重試、rate limit、冪等）見 **附錄 F**。所有對外副作用**必須**經 Connector 層，Agent/Loop 不得直接 fetch 外部 API。

---

## 0.9 Permission 模型 (權威)

- **兩種 Actor**：`human`（Supabase Auth user）與 `agent`（system identity）。
- **第一道防線 = Supabase RLS**：所有 table 預設 `deny`，逐表寫 policy。
- **第二道防線 = `PolicyEngine`**：對「動作級」授權（e.g. `publisher` 能不能在未經 HR 下發 FB、`price` 能不能自動套用 > NT$XX,XXX 的定價）做判斷。
- **原則**：**AI 可以「提議」任何事，但「有外部副作用或不可逆」的動作預設需要 Permission 檢查或 Human Review。**（發佈、改價超過門檻、回覆客戶、刪除）。
- 詳見 `docs/07` + 附錄 K；Policy schema 見 `docs/06`。

---

## 0.10 命名規範 (Naming Conventions) — 全書強制

> 完整版見 **附錄 C（API）** 與 **附錄 D（DB）**。此處是必記摘要。

**Database（Postgres / Supabase）**
- Table：`snake_case`、**複數**（`products`, `loop_executions`, `price_histories`）。
- PK：`id uuid default gen_random_uuid()`。
- FK：`<singular>_id`（`product_id`）。
- 時間：`created_at`, `updated_at`（`timestamptz`, default `now()`）。
- Enum：Postgres `enum` type 命名 `<entity>_<field>`（`loop_execution_status`）。
- 布林：`is_`/`has_` 前綴（`is_published`）。
- 金額：`_amount`（整數，單位=最小貨幣單位）+ `_currency`（`char(3)`）。禁用 float 存錢。

**TypeScript / Domain**
- Entity/Type：`PascalCase`（`ProductPhoto`）。
- 變數/函式：`camelCase`。常數：`SCREAMING_SNAKE`。
- 檔名：`kebab-case.ts`；React 元件檔 `PascalCase.tsx`。

**API（REST-ish route handlers）**
- 路徑：`/api/<context>/<resource>`（複數），`kebab-case`（`/api/catalog/products`）。
- 動作型（非 CRUD）用子路徑：`POST /api/loops/{id}/executions`（觸發執行）。
- 回應：`{ data, error, meta }` 統一封裝（見附錄 C）。

**Loop / Agent / Skill 代號**
- Loop id：`kebab-case`（`product-lifecycle`, `drive-ingest`）。
- Agent 代號：見 §0.6（`vision`,`ocr`,`price`,`marketing`,`reviewer`,`publisher`,`memory`）。
- Skill id：`kebab-case` 動詞開頭（`extract-brand`, `estimate-price`, `compose-fb-post`）。

---

## 0.11 LoopExecution 狀態機 (權威 enum)

`loop_execution_status`：
```
queued → running → waiting_human → running → succeeded
                          ↘ failed ↘ cancelled
```
- `queued`：已排入，未執行。
- `running`：執行中。
- `waiting_human`：卡在 Human Review。
- `succeeded` / `failed` / `cancelled`：終態。

`human_review_status`：`pending → approved | rejected | edited | expired`。
`task_status`：`open → in_progress → done | blocked | cancelled`。
`product_status`（**權威**，R1 定案）：`ingested → assembled → gap → priced → composed → reviewing → published → sold → archived`。Product 用此細階段，**不共用** `listing_status`。
`listing_status`（僅 `Listing` 用）：`draft → in_review → approved → published → sold → archived`。

其他與 loop/agent 相關的 DB enum（權威值以 `docs/06` migration 為準）：
- `loop_step_kind`：`agent | skill | connector | human | system | branch`（含控制流 `branch`，R2 定案）。
- `loop_step_status`：`pending | running | succeeded | failed | skipped`。
- `agent_run_status`：`queued | running | succeeded | failed`。
- `policy_effect`：`allow | deny | require_human`（含 `require_human`，R3 定案）。

> 各狀態機完整轉移圖在 `docs/05` §State Machine 與 `docs/08`。R1–R4 的定案紀錄見 `docs/RECONCILIATION.md`。

---

## 0.12 全書寫作規範 (給每位撰寫者/子代理)

1. **語言**：正體中文敘述 + 英文技術名詞。Schema / code / 檔名 / 識別碼一律英文。
2. **引用本文件**：用到 Entity/Agent/Loop 名稱時，與 §0.5–0.11 完全一致。
3. **OS vs SHAP**：先講可重用的 OS 機制，再標 `SHAP-specific` 舉例。
4. **可執行**：多給「Claude Code 能直接照做」的東西——schema DDL、TS interface、資料夾樹、範例 prompt、驗收條件（Acceptance）。少講空話。
5. **每章結尾**必附：`## 本章交付物 (Deliverables)` + `## 驗收條件 (Acceptance Criteria)`，讓 Claude Code 有明確 done 定義。
6. **交叉引用**用相對路徑（`見 docs/06 §products`）。
7. 金額、日期、模型 id **不要憑記憶硬寫**；模型 id 一律走 `MODELS.*` 常數。
8. 字數是下限不是上限；寧可具體到可實作，不要湊字數的空泛描述。

---

## 0.13 文件地圖 (Map of the Bible)

| 檔案 | 標題 | 對應原始章節 |
|---|---|---|
| `docs/00-canonical-model.md` | 本文件：全書合約 | — |
| `docs/01-vision-product-philosophy.md` | Vision & Product Philosophy | 第一章 |
| `docs/02-business-analysis.md` | Business Analysis | 第二章 |
| `docs/03-loop-engineering-architecture.md` | Loop Engineering Architecture | 第三章 |
| `docs/04-system-architecture.md` | System Architecture | 第四章 |
| `docs/05-domain-design-ddd.md` | Domain Design (DDD) + State Machine | 第五章 |
| `docs/06-database-schema.md` | Database Schema (Supabase) | 第六章 |
| `docs/07-ai-agent-architecture.md` | AI Agent Architecture + Human Review + Permission | 第七章 |
| `docs/08-workflow.md` | Workflow / Loops | 第八章 |
| `docs/09-frontend.md` | Frontend (UI Flow) | 第九章 |
| `docs/10-backend.md` | Backend (API / Services / Workers) | 第十章 |
| `docs/11-roadmap.md` | Roadmap (MVP→Beta→Production→Enterprise) | 第十一章 |
| `docs/12-claude-code-development-guide.md` | Claude Code Development Guide | 第十二章 |
| `docs/appendix/A-folder-structure.md` | Folder Structure | 附錄 |
| `docs/appendix/B-nextjs-structure.md` | Next.js Structure | 附錄 |
| `docs/appendix/C-api-naming-convention.md` | API Naming Convention | 附錄 |
| `docs/appendix/D-database-naming-convention.md` | Database Naming Convention | 附錄 |
| `docs/appendix/E-skill-design-guide.md` | Skill Design Guide | 附錄 |
| `docs/appendix/F-connector-design-guide.md` | Connector Design Guide | 附錄 |
| `docs/appendix/G-loop-template.md` | Loop Template | 附錄 |
| `docs/appendix/H-agent-template.md` | Agent Template | 附錄 |
| `docs/appendix/I-pr-review-template.md` | PR Review Template | 附錄 |
| `docs/appendix/J-git-flow.md` | Git Flow | 附錄 |
| `docs/appendix/K-human-review-checklist.md` | Human Review Checklist | 附錄 |

— 合約結束。以下各章一律遵此而寫。
