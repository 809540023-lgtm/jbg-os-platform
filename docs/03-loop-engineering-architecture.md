# 03 · Loop Engineering Architecture

> 本章把 `docs/00-canonical-model.md` §0.4 的 **Loop Engineering 12 層** 逐層深入。
> 命名、Entity、Agent 代號、狀態機一律以 §0.5–0.11 為準。
> 寫作順序：**先 OS 層（可重用）→ 再以 `SHAP-specific` 舉例套上去。**
>
> 版本：v1.0 · 對應合約：`docs/00` §0.4 / §0.7

---

## 3.0 這一章要回答的問題

JBG OS 不是「一堆 controller + service + cron job」。它的執行核心是一個叫 **Loop** 的一等公民（first-class citizen）。本章要說清楚：

1. Loop Engineering 的 12 層各自是什麼、在 JBG OS 由**哪個 package / service / entity 承載**、輸入輸出是什麼。
2. 這 12 層如何**組成一次執行**（總覽圖）。
3. 一次 `LoopExecution`（LX）從被 Automation 觸發，到 Observability 收尾的**完整生命週期時序圖**。
4. `Harness` 這一層的職責細節（重試、schema 驗證、token/cost 記帳、逾時、冪等）。
5. 為什麼 **Loop 是一等公民**，而不是傳統 service/controller。

> 分工界線：本章畫「Loop runtime 的抽象與各層職責」；**具體 API/worker 實作**在 `docs/10`，**Workflow 狀態機**在 `docs/08`，**Agent I/O 契約**在 `docs/07`。本章不重寫那些細節，只定義它們如何被 Loop 串起來。

---

## 3.1 12 層總覽：如何組成一次執行

12 層不是平行清單，而是**由外而內的依賴堆疊**。下圖顯示一次 `LoopExecution` 執行時，這 12 層如何嵌套：

```
┌───────────────────────────────────────────────────────────────────────────┐
│ (5) AUTOMATION  cron / webhook / event / manual  ── 觸發 ──▶                 │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │ (4) LOOP  LoopRunner 建立 LoopExecution(LX) 狀態機，依序跑 LoopStep    │    │
│  │                                                                      │    │
│  │   for each step:                                                     │    │
│  │   ┌───────────────────────────────────────────────────────────┐     │    │
│  │   │ (8) SUB-AGENT  AgentRunner 執行某個 Agent（vision/price…）   │     │    │
│  │   │                                                             │     │    │
│  │   │   ┌─────────────────────────────────────────────────┐      │     │    │
│  │   │   │ (2) CONTEXT  ContextBuilder 組 ContextSnapshot   │      │     │    │
│  │   │   │      ← (9) MEMORY recall  ← entity 快照 ← RAG     │      │     │    │
│  │   │   ├─────────────────────────────────────────────────┤      │     │    │
│  │   │   │ (1) PROMPT   packages/prompts 版本化模板          │      │     │    │
│  │   │   ├─────────────────────────────────────────────────┤      │     │    │
│  │   │   │ (3) HARNESS  packages/harness 包住模型呼叫        │      │     │    │
│  │   │   │      重試 · schema 驗證 · token/cost 記帳 · 逾時   │      │     │    │
│  │   │   │      └▶ Anthropic Claude (MODELS.*)              │      │     │    │
│  │   │   ├─────────────────────────────────────────────────┤      │     │    │
│  │   │   │ (6) SKILL     Agent 呼叫封裝好的能力單元           │      │     │    │
│  │   │   │ (7) CONNECTOR Skill/Loop 經 Connector 讀寫外部     │      │     │    │
│  │   │   └─────────────────────────────────────────────────┘      │     │    │
│  │   └───────────────────────────────────────────────────────────┘     │    │
│  │                                                                      │    │
│  │   (11) PERMISSION  每個有副作用的動作前，RLS + PolicyEngine 檢查        │    │
│  │   (10) EVAL        step/LX 產出後打分（自動 + 人工 EvalRun）           │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│ (12) OBSERVABILITY  貫穿全程：LoopExecution / LoopStep / AgentRun /          │
│                     AuditLog / trace / token / cost                         │
└───────────────────────────────────────────────────────────────────────────┘
```

讀法：

- **最外層是 Automation（5）**：它「按下開關」，本身不做業務。
- **Loop（4）是骨架**：把一連串 step 排好、管狀態、管終止條件。
- **每個 step 內部**通常是一次 Sub-agent（8）執行，Sub-agent 內又疊了 Context（2）＋ Prompt（1）＋ Harness（3），並可能呼叫 Skill（6）與 Connector（7）。
- **Memory（9）** 餵進 Context，也在結尾被寫回。
- **Permission（11）** 與 **Eval（10）** 是橫切關卡：在動作前後插入。
- **Observability（12）** 是貫穿一切的記錄面，不是某一步。

---

## 3.2 逐層深入（12 層）

每層固定寫五件事：**定義 / JBG OS 載體 / 輸入輸出 / SHAP 具體例子 / 與相鄰層如何銜接**。

---

### 層 1 · Prompt

**定義**：給模型的指令模板，含角色、任務、輸出契約（output schema）。Prompt 是**版本化資產**，不是散落在程式碼裡的字串。

**JBG OS 載體**：`packages/prompts/*`；每個 prompt 對應一個 `Prompt` entity（§0.5 Agent Context），有 `id`、`version`、`agent_code`、`template`、`output_schema_ref`。

**輸入 / 輸出**：
- 輸入：一組具名變數（由 Context 層填入）。
- 輸出：一段可送入 Harness 的 rendered messages（system + user），並攜帶「期望的輸出 schema」。

**SHAP 具體例子**：`price` Agent 的 prompt `estimate-price@v3`——角色是「二手精品估價師」，任務是「依商品卡 + 市場記憶給出建議售價、價格區間、理由、信心」，輸出契約綁定 `PriceSuggestion` schema（`suggested_amount`, `min_amount`, `max_amount`, `confidence`, `rationale`）。

**與相鄰層銜接**：
- **上承 Context（2）**：Prompt 只定義「洞（變數槽）」，由 Context 層把事實填進去。
- **下接 Harness（3）**：rendered prompt + output schema 一起交給 Harness 呼叫模型。

```ts
// packages/prompts/price/estimate-price.ts
export const estimatePricePrompt = definePrompt({
  id: 'estimate-price',
  version: 3,
  agentCode: 'price',              // §0.6 canonical agent code
  model: 'REASONING',             // → MODELS.REASONING（§0.3；不硬寫版本字串）
  outputSchema: PriceSuggestionSchema,
  render: (vars: { product: ProductCard; marketMemory: Memory[] }) => ({
    system: '你是二手精品估價師…',
    user: renderProductAndMarket(vars),
  }),
});
```

> 本層對應章節：`docs/07`（Agent I/O 契約）、附錄 H（Agent Template）。

---

### 層 2 · Context

**定義**：這一次執行要餵給模型的**所有事實**——RAG 檢索、Memory recall、entity 快照。Context 決定模型「知道什麼」。

**JBG OS 載體**：`ContextBuilder` service（§0.4）。它的產物被凍結成 `ContextSnapshot` entity（§0.5），綁在 `AgentRun` 上，可回放（replay）。

**輸入 / 輸出**：
- 輸入：`target entity`（如某個 `Product`）、`agentCode`、可選的 query。
- 輸出：一個 `ContextSnapshot`（結構化事實 + 檢索到的 Memory + 使用到的 embedding）。

**SHAP 具體例子**：估價前，`ContextBuilder` 為某 `Product` 組出：商品卡（品牌/品類/瑕疵，來自 VisionResult+OCRResult）、同品牌近 90 天成交記憶（`Memory` where type=`fact`）、老闆偏好（`Memory` type=`preference`，例如「Chanel 不低於 8 折」）。

**與相鄰層銜接**：
- **上承 Memory（9）**：透過 `MemoryStore.recall()`（vector + filter）拉相關記憶。
- **下接 Prompt（1）**：把事實填入 prompt 變數槽。
- **被 Observability（12）記錄**：`ContextSnapshot` 永久保存，出問題可精準回放。

```ts
interface ContextSnapshot {
  id: string;
  agentRunId: string;
  agentCode: AgentCode;
  facts: Record<string, unknown>;   // entity 快照
  recalledMemories: MemoryRef[];    // 來自 MemoryStore.recall
  retrieval: { query: string; embeddingModel: string; topK: number };
  builtAt: string;                  // ISO timestamp
}
```

> 本層對應章節：`docs/07` §Context、`docs/09`（Memory Context 的記憶格式）。

---

### 層 3 · Harness

**定義**：包住「模型呼叫」的執行外殼。它把不可靠的 LLM 呼叫，變成**可重試、schema 保證、有記帳、有逾時、冪等**的一次可信呼叫。Harness 是 12 層裡最工程化的一層，§3.3 專門展開。

**JBG OS 載體**：`packages/harness`。它是 Agent（8）與模型之間唯一的通道——**任何模型呼叫都必須走 Harness**，禁止 Agent 直接呼叫 SDK。

**輸入 / 輸出**：
- 輸入：rendered messages、output schema、`model`（`MODELS.*` 常數）、`idempotencyKey`、`budget`（token/cost 上限）。
- 輸出：`HarnessResult`——validated output（符合 schema）、usage（token）、cost、attempts、latency。

**SHAP 具體例子**：`vision` Agent 呼叫 `MODELS.VISION` 看一張 `ProductPhoto`。模型偶爾回傳非法 JSON——Harness 依 schema 驗證失敗後，用「附上錯誤訊息的修正提示」重試最多 2 次；仍失敗則把該 `LoopStep` 標 `failed` 並升級為 `Task`。

**與相鄰層銜接**：
- **上承 Prompt（1）+ Context（2）**。
- **對 Observability（12）**：每次呼叫寫一筆 `AgentRun`（token/cost/attempts/trace）。
- **對 Automation（5）**：`idempotencyKey` 讓「同一觸發重放」不會重複產生副作用。

> 本層對應章節：本章 §3.3、`docs/10`（實作）、附錄 H。

---

### 層 4 · Loop

**定義**：由多個步驟串成、**有明確終止條件**的自動化迴圈定義。Loop 是 JBG OS 的一等公民（§3.4 說明為什麼）。

**JBG OS 載體**：`Loop` entity（定義：步驟圖、觸發、終止條件）＋ `LoopRunner`（執行引擎）。一次執行是 `LoopExecution`（LX，狀態機 §0.11），每步是 `LoopStep`。

**輸入 / 輸出**：
- 輸入：觸發 payload（來自 Automation）＋ Loop 定義。
- 輸出：一個 `LoopExecution`（含多個 `LoopStep`），終態為 `succeeded | failed | cancelled`。

**SHAP 具體例子**：`product-lifecycle` 是 **Workflow**（§0.7），內含多個 Loop。其中 `drive-ingest`、`perceive`、`price` 各自是 Loop。`perceive` Loop 的兩步（OCR ‖ Vision）並行，終止條件是「兩者皆回或逾時」。

**與相鄰層銜接**：
- **被 Automation（5）觸發**。
- **每個 step 委派給 Sub-agent（8）或 Skill（6）**。
- **狀態受 Permission（11）約束**：需要人審時進 `waiting_human`（§0.11）。

```ts
interface LoopExecution {
  id: string;
  loopId: string;                    // kebab-case，如 'product-lifecycle' / 'price'
  status: LoopExecutionStatus;       // §0.11 enum
  trigger: { source: 'cron' | 'webhook' | 'event' | 'manual'; payload: unknown };
  idempotencyKey: string;            // 同一觸發只跑一次
  steps: LoopStep[];
  startedAt: string;
  endedAt?: string;
}
```

> 本層對應章節：`docs/08`（Workflow / Loops 狀態機）、附錄 G（Loop Template）。

---

### 層 5 · Automation

**定義**：觸發 Loop 的機制——cron / webhook / 事件 / 手動。Automation 決定「什麼時候、因為什麼」跑一個 Loop。

**JBG OS 載體**：`pg_cron`（排程）+ `Trigger`（事件觸發抽象；重任務可外掛 Trigger.dev，見 §0.3）。webhook 由 Supabase Edge Function 接住後產生 `Trigger`。

**輸入 / 輸出**：
- 輸入：外部事件（Drive 有新檔）、時間（每 5 分鐘）、人為按鈕、DB 事件。
- 輸出：一個帶 `idempotencyKey` 的觸發，交給 LoopRunner 建立 LX。

**SHAP 具體例子**：`pg_cron` 每 5 分鐘觸發 `drive-ingest` Loop 去掃 Google Drive 監看資料夾；掃到新 `ProductPhoto` 後，發出 `photo.ingested` 事件，觸發下游 `perceive` Loop。

**與相鄰層銜接**：
- **下接 Loop（4）**：唯一職責就是「合法地、冪等地」啟動一個 LX。
- **與 Connector（7）協作**：webhook 的來源通常是某個 Connector（FB/Drive）。

> 本層對應章節：`docs/10` §Workers/Cron、`docs/08`。

---

### 層 6 · Skill

**定義**：可被 Agent / Loop 呼叫的、**封裝好的能力單元**——純函式或 sub-loop。Skill 讓能力可測試、可重用、可組合。

**JBG OS 載體**：`packages/skills/*`；對應 `Skill` entity（§0.5）。Skill id 用 kebab-case 動詞開頭（§0.10，如 `extract-brand`, `estimate-price`, `compose-fb-post`）。

**輸入 / 輸出**：
- 輸入：型別化的 input（Zod schema）。
- 輸出：型別化的 output；**純函式 Skill 無副作用**，有副作用者必經 Connector（7）+ Permission（11）。

**SHAP 具體例子**：`compose-fb-post`（給 `marketing` Agent 用）吃 `ProductCard` + `PriceSuggestion`，吐 FB 貼文草稿（標題/內文/hashtag）。它自己不發文——發文是 `publisher` 經 `facebook` Connector 做的。

**與相鄰層銜接**：
- **被 Sub-agent（8）呼叫**（Agent 的 `availableSkills`）。
- **可呼叫 Connector（7）**：但外部副作用一律走 Connector。

> 本層對應章節：附錄 E（Skill Design Guide）。

---

### 層 7 · Connector

**定義**：對外部系統（Drive / FB / LINE）讀寫的介面層。**所有對外副作用必須經 Connector**（§0.8），Agent/Loop/Skill 不得直接 `fetch`。

**JBG OS 載體**：`packages/connectors/*`；對應 `Connector` entity（連線設定與憑證）。三個 canonical connector（§0.8）：`drive`、`facebook`、`line`。

**輸入 / 輸出**：
- 輸入：標準化的操作請求（`drive.listNewFiles`、`facebook.publishPost`、`line.notify`）。
- 輸出：標準化結果 + 標準化錯誤（rate limit / auth / transient），供 Harness/Loop 決定重試。

**SHAP 具體例子**：`publisher` Agent 通過後，呼叫 `facebook.publishPost(listing)`；`facebook` Connector 負責 OAuth token、rate limit、重試、把 FB post id 寫回 `Listing`（→ `published`，§0.11 listing_status）。

**與相鄰層銜接**：
- **被 Skill（6）/ Sub-agent（8）呼叫**。
- **受 Permission（11）強約束**：有副作用的寫入前必過 PolicyEngine。
- **憑證來源**：見 `docs/04` §環境與 secrets。

> 本層對應章節：`docs/04`（Connector 在架構圖的位置）、附錄 F（Connector Design Guide）。

---

### 層 8 · Sub-agent

**定義**：被主流程委派、**有獨立 context** 的 Agent。Sub-agent 讓一個大流程拆成「單一職責、各自帶自己 context」的 AI 執行單元。

**JBG OS 載體**：`AgentRunner`（§0.4/§0.6）。它讀 `Agent` 定義（角色、I/O schema、可用 skill/connector），每次執行寫一筆 `AgentRun`（§0.5，belongs to `Agent`, `LoopStep`）。七個 canonical Agent 見 §0.6。

**輸入 / 輸出**：
- 輸入：`LoopStep` 給的 input + 該 Agent 的 `ContextSnapshot`。
- 輸出：符合 Agent output schema 的結果（`VisionResult` / `PriceSuggestion` / …）＋ 一筆 `AgentRun`（trace/cost）。

**SHAP 具體例子**：`perceive` Loop 委派兩個 sub-agent——`ocr` 與 `vision`——各自帶獨立 context 並行跑。主流程（Loop）不關心它們內部怎麼推理，只收 `OCRResult` / `VisionResult`。

**與相鄰層銜接**：
- **被 Loop（4）的 step 委派**。
- **內部疊 Context（2）+ Prompt（1）+ Harness（3）**，可用 Skill（6）/ Connector（7）。
- **產出被 Eval（10）打分**。

> 本層對應章節：`docs/07`（七個 Agent 完整 I/O 契約）、附錄 H。

---

### 層 9 · Memory

**定義**：跨執行累積的事實與偏好（含 vector recall）。Memory 讓 OS「越用越懂這門生意」。

**JBG OS 載體**：`Memory` entity + `MemoryStore`（§0.4）。`Memory` 有 `Embedding`（§0.5 Perception，存 pgvector），並可用 `MemoryLink`（`[[slug]]`）互連。Memory 分類（type）：`fact` / `preference` / `feedback` / `reference`（§0.5）。

**輸入 / 輸出**：
- 讀（recall）：給 `ContextBuilder`——`MemoryStore.recall(query, filter, topK)` 回相關記憶。
- 寫（remember）：由 `memory` Agent 從成交/詢問/售後萃取，寫入新 `Memory` records。

**SHAP 具體例子**：成交後 `memory` Agent 萃取「Chanel Classic Flap 中古，8.5 成新，實際成交 NT$78,000，買家在意五金氧化」→ 寫成 `Memory(type=fact)`，下次 `price` 估同款時被 recall 進 Context。

**與相鄰層銜接**：
- **被 Context（2）讀**、**被 `memory` Sub-agent（8）寫**。
- **`remember` 是 `product-lifecycle` 的最後一階段**（§0.7），形成閉環——這正是 Loop Engineering「迴圈」的意義。

> 本層對應章節：`docs/05`（Memory Context DDD）、`docs/09`（記憶格式與 UI）。

---

### 層 10 · Eval

**定義**：對 Loop / Agent 輸出品質的**自動與人工評分**。Eval 讓品質可量測、可回歸（regression）。

**JBG OS 載體**：`packages/eval` + `EvalRun` entity（§0.5，belongs to `AgentRun`/`LoopExecution`）。

**輸入 / 輸出**：
- 輸入：某次 `AgentRun` / `LoopExecution` 的 output（+ 可選 ground truth）。
- 輸出：`EvalRun`（score、pass/fail、rubric、evaluator=auto|human）。

**SHAP 具體例子**：`marketing` 產出的文案，用 auto-eval 檢查「是否含違規宣稱（保證真品/療效）、字數、是否覆蓋賣點」；抽樣進人工 eval。低分回退到 `compose`（§0.7 reject 邊）。

**與相鄰層銜接**：
- **讀 Sub-agent（8）/ Loop（4）的產出**。
- **與 Governance 的 `HumanReview` 協作**：Reviewer Agent 自動審（§0.6）＋ Eval 分數共同決定放行或退回。

> 本層對應章節：`docs/07` §Reviewer、附錄 K（Human Review Checklist）。

---

### 層 11 · Permission

**定義**：誰 / 哪個 Agent 能對哪個資源做哪個動作。原則（§0.9）：**AI 可以「提議」任何事，但有外部副作用或不可逆的動作，預設需 Permission 檢查或 Human Review。**

**JBG OS 載體**：兩道防線（§0.9）——**RLS**（第一道，table 級，預設 deny）＋ **`PolicyEngine`**（第二道，動作級）。對應 `Policy`、`Actor`（§0.5 Governance）。

**輸入 / 輸出**：
- 輸入：`{ actor, action, resource, context }`（如 `agent:publisher` 想 `publish` 某 `Listing`）。
- 輸出：`allow` / `deny` / `require_human_review`。

**SHAP 具體例子**：`price` 想自動套用一個 > 門檻金額的定價 → PolicyEngine 回 `require_human_review`，LX 進 `waiting_human`（§0.11），LINE 推播老闆。`publisher` 未經 HR 想發 FB → deny。

**與相鄰層銜接**：
- **卡在每個有副作用的動作前**（Connector 寫入、改價、回客、刪除）。
- **`require_human_review` 驅動 Loop（4）狀態進 `waiting_human`**，並開 `HumanReview`。

> 本層對應章節：`docs/07` §Permission、`docs/06`（Policy schema）、附錄 K。

---

### 層 12 · Observability

**定義**：每一步的 trace、log、metric、cost、狀態。Observability 是**貫穿全程**的記錄面，讓每次執行可回放、可歸因、可算帳。

**JBG OS 載體**：`LoopExecution` + `LoopStep` + `AgentRun` + `AuditLog`（不可變動作紀錄，§0.5）＋ 分散式 trace（一個 `traceId` 貫穿整條 LX）。

**輸入 / 輸出**：
- 輸入：每層在執行時發出的事件（step 開始/結束、model 呼叫、connector 寫入、permission 判定）。
- 輸出：可查詢的執行歷史、成本報表、失敗歸因、`ContextSnapshot` 回放。

**SHAP 具體例子**：某商品上架失敗——沿 `traceId` 可看到：`perceive` OK → `price` OK → `compose` OK → `publish` step 的 `facebook.publishPost` 回 rate limit → Harness 重試 2 次仍失敗 → step `failed` → 開 `Task`。每一步的 token/cost 都在 `AgentRun`。

**與相鄰層銜接**：
- **接收全部 11 層的事件**。
- **`AuditLog` 與 Permission（11）互補**：Permission 決定「能不能」，AuditLog 記「做了什麼、誰做的」。

> 本層對應章節：`docs/10` §Observability、`docs/06`（audit_logs / traces schema）。

---

### 12 層 → 章節對照表

| # | 層 | 主要載體 | 對應章節 / 附錄 |
|---|---|---|---|
| 1 | Prompt | `packages/prompts/*` · `Prompt` | `docs/07`、附錄 H |
| 2 | Context | `ContextBuilder` · `ContextSnapshot` | `docs/07`、`docs/09` |
| 3 | Harness | `packages/harness` | 本章 §3.3、`docs/10`、附錄 H |
| 4 | Loop | `Loop` · `LoopRunner` · `LoopExecution` | `docs/08`、附錄 G |
| 5 | Automation | `pg_cron` · `Trigger` | `docs/10`、`docs/08` |
| 6 | Skill | `packages/skills/*` · `Skill` | 附錄 E |
| 7 | Connector | `packages/connectors/*` · `Connector` | `docs/04`、附錄 F |
| 8 | Sub-agent | `AgentRunner` · `Agent`/`AgentRun` | `docs/07`、附錄 H |
| 9 | Memory | `MemoryStore` · `Memory`/`MemoryLink` | `docs/05`、`docs/09` |
| 10 | Eval | `packages/eval` · `EvalRun` | `docs/07`、附錄 K |
| 11 | Permission | RLS · `PolicyEngine` · `Policy` | `docs/07`、`docs/06`、附錄 K |
| 12 | Observability | `LoopExecution`/`LoopStep`/`AgentRun`/`AuditLog` | `docs/10`、`docs/06` |

---

## 3.3 一次 LoopExecution 的生命週期（時序圖）

以 SHAP 的 `price` Loop 為例（估價），展示從 Automation 觸發到 Observability 收尾，中間如何呼叫 Harness → Agent → Skill → Connector，以及怎麼記 `LoopStep` / `AgentRun`。

```
Automation      LoopRunner        AgentRunner        Harness         Skill/Connector    Store/Obs
 (pg_cron/event)  (LX 狀態機)       (price agent)     (packages/harness)                  (DB/trace)
    │                │                  │                 │                 │                │
    │ trigger(price, │                  │                 │                 │                │
    │  idemKey, X)   │                  │                 │                 │                │
    ├───────────────▶│                  │                 │                 │                │
    │                │ 冪等檢查:idemKey  │                 │                 │                │
    │                ├──────────────────┼─────────────────┼─────────────────┼───────────────▶│ 已存在? 命中則返回既有 LX
    │                │ create LX         │                 │                 │                │
    │                │ status=queued→running                                                 │
    │                ├──────────────────┼─────────────────┼─────────────────┼───────────────▶│ INSERT loop_executions
    │                │                  │                 │                 │                │ traceId 生成
    │                │ step[1]=estimate │                 │                 │                │
    │                │  create LoopStep │                 │                 │                │
    │                ├──────────────────┼─────────────────┼─────────────────┼───────────────▶│ INSERT loop_steps(running)
    │                │ delegate ────────▶│                 │                 │                │
    │                │                  │ ContextBuilder   │                 │                │
    │                │                  │  recall Memory ──┼─────────────────┼───────────────▶│ MemoryStore.recall(pgvector)
    │                │                  │  freeze snapshot │                 │                │
    │                │                  ├──────────────────┼─────────────────┼───────────────▶│ INSERT context_snapshots
    │                │                  │ render Prompt    │                 │                │
    │                │                  │  estimate-price@v3                 │                │
    │                │                  │ call ───────────▶│                 │                │
    │                │                  │                 │ budget/timeout 檢查               │
    │                │                  │                 │ model call ─────┼───────────────▶  Anthropic (MODELS.REASONING)
    │                │                  │                 │ schema 驗證 FAIL │                │
    │                │                  │                 │ retry(1) w/ error│                │
    │                │                  │                 │ model call ─────┼───────────────▶  Anthropic
    │                │                  │                 │ schema OK        │                │
    │                │                  │                 │ 記帳: token/cost │                │
    │                │                  │◀────────────────┤ HarnessResult    │                │
    │                │                  │ (可選) call Skill │                 │                │
    │                │                  │  estimate-price ─┼────────────────▶│ 純函式，無副作用 │
    │                │                  │◀─────────────────┼─────────────────┤                │
    │                │                  │ write AgentRun ──┼─────────────────┼───────────────▶│ INSERT agent_runs(cost/trace)
    │                │◀─────────────────┤ PriceSuggestion  │                 │                │
    │                │ Permission 檢查   │                 │                 │                │
    │                │  PolicyEngine(price, apply, amount)                   │                │
    │                │   → require_human_review (超門檻)                     │                │
    │                │ status=waiting_human                                                   │
    │                ├──────────────────┼─────────────────┼─────────────────┼───────────────▶│ UPDATE lx; INSERT human_reviews(pending)
    │                │ line.notify(老闆) ┼─────────────────┼────────────────▶│ LINE Connector  │
    │                │        …（人審 approve）…            │                 │                │
    │                │ status=running→succeeded                                                │
    │                │ Eval: 自動打分 ───┼─────────────────┼─────────────────┼───────────────▶│ INSERT eval_runs
    │                │ finalize LoopStep(succeeded)                                            │
    │                ├──────────────────┼─────────────────┼─────────────────┼───────────────▶│ UPDATE loop_steps; UPDATE lx(ended_at)
    │                │                  │                 │                 │                │ AuditLog + trace 收尾
```

要點：

1. **冪等在最前面**：LoopRunner 先用 `idempotencyKey` 查有沒有既有 LX，命中直接返回——同一觸發重放不會產生第二次副作用。
2. **每個 step 一筆 `LoopStep`**，每次 Agent 執行一筆 `AgentRun`，兩者都掛在同一 `traceId`。
3. **模型呼叫全走 Harness**：schema 驗證失敗自動重試、記 token/cost。
4. **副作用前必過 Permission**：本例 `require_human_review` 讓 LX 進 `waiting_human`（§0.11），並經 `line` Connector 推播。
5. **收尾在 Observability**：Eval 打分、狀態轉終態、AuditLog + trace 封存。

---

## 3.4 Harness 職責細節（放大 §層 3）

Harness 是把「不可靠的 LLM 呼叫」變「可信的一次呼叫」的關鍵。它必須負責六件事：

```
                 ┌──────────────────────── Harness.call() ────────────────────────┐
 rendered msgs ─▶│ 1.冪等  2.預算/逾時  3.model call  4.schema 驗證  5.重試  6.記帳 │─▶ HarnessResult
 output schema ─▶│                                                                │   (validated,
 model(MODELS.*) │      失敗→分類(transient/schema/budget/fatal)→決定重試或升級      │    usage, cost,
 idempotencyKey ▶└────────────────────────────────────────────────────────────────┘    attempts, trace)
```

**(1) 冪等（idempotency）**
- 每次 `call()` 帶 `idempotencyKey`（通常 = `loopExecutionId + stepId + attemptScope`）。
- 對「有外部副作用的 Skill/Connector 呼叫」，key 用於去重；相同 key 命中則回快取結果，不重打模型、不重複副作用。

**(2) 預算與逾時（budget / timeout）**
- 每次呼叫帶 `budget`（token 上限、cost 上限）與 `timeoutMs`。
- 超時中止並標記，交由 Loop 決定重試或 `failed`。避免單一 step 卡死整條 LX。

**(3) 模型呼叫抽象**
- 只認 `MODELS.REASONING` / `MODELS.VISION` / `MODELS.FAST` 常數（§0.3），**不硬寫版本字串**；供應商預設 Anthropic Claude。換模型只改設定檔。

**(4) Schema 驗證**
- 用 Zod（output schema）驗證模型回傳。非法→視為可修復錯誤。

**(5) 重試策略**
- 錯誤分類 → 決定行為：

| 錯誤類 | 例子 | Harness 行為 |
|---|---|---|
| `transient` | 429 / 5xx / 網路抖動 | 指數退避重試（預設 max 2），抖動避免 thundering herd |
| `schema` | 非法 JSON / 缺欄位 | 附錯誤訊息的「修正提示」重試（max 2） |
| `budget` | 超 token/cost/timeout | 不重試，回 `budget_exceeded`，升級 Task/HR |
| `fatal` | 4xx auth / 內容政策拒絕 | 不重試，直接 `failed`，寫 AuditLog |

**(6) Token / Cost 記帳**
- 每次呼叫累加 input/output token、換算成本，寫入 `AgentRun`（§0.5）。cost 沿 `traceId` 匯總到 `LoopExecution`，供 Observability（12）出成本報表。

```ts
interface HarnessCallInput {
  messages: RenderedMessages;
  outputSchema: ZodSchema<unknown>;
  model: 'REASONING' | 'VISION' | 'FAST';   // → MODELS.*（§0.3）
  idempotencyKey: string;
  budget: { maxTokens: number; maxCostAmount: number };  // 整數，最小貨幣單位（§0.10）
  timeoutMs: number;
}

interface HarnessResult<T> {
  output: T;                                 // 已通過 schema 驗證
  usage: { inputTokens: number; outputTokens: number };
  costAmount: number;                        // 整數（§0.10）
  attempts: number;
  latencyMs: number;
  traceId: string;
}
```

> Harness 是「Loop 之所以可信」的地基：因為每次模型呼叫都被記帳、驗證、可重試、冪等，Loop 才敢把整條業務流程交給 AI 自動跑。

---

## 3.5 為什麼 Loop 是一等公民（vs 傳統 service/controller）

傳統 web 架構的一等公民是 **request → controller → service → response**：以「一次 HTTP 請求」為單位，同步、無狀態、跑完就忘。這對「AI 商品生命週期」不適用，原因與對照如下：

```
傳統 controller/service              JBG OS Loop
─────────────────────────────      ─────────────────────────────
單位 = 一次 HTTP request            單位 = 一個 LoopExecution（狀態機）
同步、跑完即忘                      長時、可暫停（waiting_human）、可回放
無內建重試/記帳                     Harness 內建重試 + token/cost 記帳
人是唯一觸發者                      Automation：cron/webhook/event/manual
狀態散在各 service                  狀態集中在 LX/LoopStep（§0.11 enum）
無記憶                              Memory 閉環（remember 回寫）
授權在 middleware                   Permission 貫穿每個副作用動作
log 是副產品                        Observability 是一等結構（trace/cost/audit）
```

把 Loop 當一等公民帶來五個能力，全是傳統 controller 給不了的：

1. **可暫停與人機協作**：LX 能停在 `waiting_human`（§0.11）等老闆決策，醒來續跑——一個 HTTP request 做不到。
2. **可回放與歸因**：`ContextSnapshot` + `AgentRun` + `traceId` 讓任何一次執行可完整重演，精準定位是哪個 Agent、哪個 prompt 版本出錯。
3. **成本可算帳**：每個 LX 有明確 token/cost 歸屬，能算「上架一件商品花多少 AI 成本」。
4. **記憶閉環**：`remember` 讓每次執行沉澱成 `Memory`，餵回下次 Context——這是「迴圈（Loop）」而非「管線（pipeline）」的本質。
5. **治理內建**：Permission + Eval + HumanReview 是流程的一部分，不是外掛。AI 提議、人類/policy 把關、系統執行、記憶沉澱——這正是 JBG OS 的核心主張。

> 一句話：**Loop = 有狀態、有記憶、可審核、可觀測、可算帳的自動化業務單元。** 這就是為什麼 JBG OS 把它放在架構正中央，而不是藏在 service 層裡。

---

## 本章交付物 (Deliverables)

- [ ] `docs/03` 完整覆蓋 §0.4 的 12 層，每層含：定義、JBG OS 載體（對應 package/service/entity）、輸入輸出、一個 `SHAP-specific` 例子、與相鄰層銜接。
- [ ] 一張 **12 層總覽圖**（§3.1），顯示各層如何嵌套組成一次執行。
- [ ] 一張 **LoopExecution 生命週期時序圖**（§3.3），涵蓋 Automation→LoopRunner→AgentRunner→Harness→Skill/Connector→Store，並標明何處記 `LoopStep` / `AgentRun`。
- [ ] **Harness 職責章節**（§3.4）：重試策略表、schema 驗證、token/cost 記帳、逾時、冪等，含 `HarnessCallInput` / `HarnessResult` interface。
- [ ] **Loop 是一等公民** 的論證（§3.5），含與傳統 controller/service 的對照表。
- [ ] **12 層 → 章節對照表**（§3.2 末），把每層映射到本書對應章節/附錄。
- [ ] 所有 Entity / Agent 代號 / Loop id / 狀態 enum 與 `docs/00` §0.5–0.11 完全一致。

## 驗收條件 (Acceptance Criteria)

1. **命名一致性**：文中出現的 Entity 名稱（`LoopExecution`, `LoopStep`, `AgentRun`, `ContextSnapshot`, `PriceSuggestion`, `Memory`…）、Agent 代號（`vision`/`ocr`/`price`/`marketing`/`reviewer`/`publisher`/`memory`）、Loop id（`product-lifecycle`, `drive-ingest`, `perceive`, `price`…）、狀態（`queued`/`running`/`waiting_human`/`succeeded`/`failed`/`cancelled`）皆與 §0.5–0.11 逐字相符，無自創名詞。
2. **模型 id 合規**：全文無硬寫模型版本字串，一律走 `MODELS.REASONING` / `MODELS.VISION` / `MODELS.FAST`（§0.3）。
3. **12 層完整**：12 層順序與 §0.4 完全一致（Prompt→Context→Harness→Loop→Automation→Skill→Connector→Sub-agent→Memory→Eval→Permission→Observability），無遺漏、無增刪。
4. **OS 先於 SHAP**：每層先講可重用的 OS 機制，SHAP 例子明確可辨識（且標示為範例）。
5. **可實作**：Harness 的 interface、`LoopExecution` interface、`ContextSnapshot` interface 為合法 TypeScript，可直接落到 `packages/harness` / domain type。
6. **不越界**：本章不重寫 `docs/07`（Agent I/O 契約細節）、`docs/08`（狀態機轉移細節）、`docs/10`（API/worker 實作）；僅定義它們如何被 Loop 串起，並以交叉引用指向。
7. **時序圖可讀**：§3.3 時序圖清楚標出冪等檢查、schema 重試、Permission 卡關、`waiting_human`、Eval 收尾五個關鍵點。
