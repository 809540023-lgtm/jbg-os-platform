# 09 · Frontend (UI Flow)

> 本章依 `docs/00-canonical-model.md` §0.3（技術棧）、§0.5（Entities）、§0.6（Agents）、§0.7（product-lifecycle 主流程）、§0.10（命名）、§0.11（狀態機）撰寫。
> 分工：`docs/04` 畫**全局系統架構**；本章只寫**前端 UI 的資訊架構、畫面、元件、狀態管理與互動**。API 端點細節見 `docs/10`。
> 版本：v1.0 · 對齊 canonical v1.0

---

## 9.0 本章範圍與原則 (Scope & Principles)

前端是 JBG OS 的**駕駛艙 (Cockpit)**。老闆（human `Actor`）不是「操作一個 CRM」，而是**監看一群 AI Agent 跑 Loop、在關鍵節點介入審核**。因此前端的第一原則不是 CRUD，而是：

1. **Loop-first, not table-first**：首頁是「今天 Loop 跑成怎樣」，不是「一張商品 table」。
2. **Human Review 是一等公民**：任何等待人審的 `HumanReview`（HR）都必須在**兩次點擊內**可達並可裁決。
3. **可觀測 (Observability) 內建**：每個 `LoopExecution`(LX) 都能下鑽到 `LoopStep` → `AgentRun` → `ContextSnapshot` 的 trace，不用開後台。
4. **Server-first 取資料**：預設用 Next.js Server Component 讀 Supabase；只有「互動 / 即時 / 樂觀更新」才落到 client（TanStack Query / Zustand / Supabase realtime）。
5. **OS vs SHAP**：路由與元件庫是 OS 層可重用；`/products`、`/photos`、FB 相關畫面標記為 `SHAP-specific`。

> **OS 層 (可重用)**：Dashboard、Loop、Review、Memory、Agent trace、Settings/Connectors。
> **SHAP-specific**：Products、Photos、Price（估價/歷史）、Timeline（商品生命週期）——這些綁定二手商品 vertical，但共用同一套 shell 與元件庫。

---

## 9.1 資訊架構與路由樹 (Information Architecture / Route Tree)

App Router，全站在一個 authenticated shell（`(app)` route group）之下，登入相關在 `(auth)`。所有 `/api/**` 命名對齊 §0.10（`/api/<context>/<resource>`），細節見 `docs/10`。

```
app/
├─ layout.tsx                       # 全站 root layout（fonts、theme、Toaster、QueryProvider）
├─ globals.css                      # Tailwind base
├─ (auth)/                          # 未登入可見
│  ├─ login/page.tsx                # Supabase Auth（magic link / password）
│  └─ layout.tsx                    # 極簡置中 layout
│
├─ (app)/                           # 需登入（middleware 檢查 session）
│  ├─ layout.tsx                    # AppShell：Sidebar + Topbar + <RealtimeProvider>
│  │
│  ├─ page.tsx                      # ← / Dashboard（今日 Loop 概況）
│  │
│  ├─ loops/
│  │  ├─ page.tsx                   # Loop 定義清單（Loop entity）
│  │  ├─ [loopId]/
│  │  │  ├─ page.tsx                # 單一 Loop 定義 + 其 LX 清單
│  │  │  └─ executions/
│  │  │     └─ [lxId]/page.tsx      # ← 單一 LoopExecution 的 step timeline / trace
│  │
│  ├─ products/                     # SHAP-specific
│  │  ├─ page.tsx                   # 商品卡列表（grid of ProductCard）
│  │  └─ [productId]/
│  │     ├─ page.tsx                # 單一商品卡編輯（照片/OCR/Vision/價格/文案）
│  │     └─ timeline/page.tsx       # ← 該商品完整生命週期時間軸
│  │
│  ├─ photos/                       # SHAP-specific
│  │  └─ page.tsx                   # Drive 進來的 ProductPhoto 與對應 Product
│  │
│  ├─ review/                       # Human Review 佇列（OS 層）
│  │  ├─ page.tsx                   # HR queue（pending 清單）
│  │  └─ [reviewId]/page.tsx        # 單一 HR 裁決（approve/reject/edit）
│  │
│  ├─ memory/                       # OS 層
│  │  ├─ page.tsx                   # 記憶瀏覽 / 搜尋（含 vector recall）
│  │  └─ [memoryId]/page.tsx        # 單一 Memory + MemoryLink 圖
│  │
│  ├─ pricing/                      # SHAP-specific
│  │  └─ [productId]/page.tsx       # 估價 + PriceHistory 圖
│  │
│  ├─ agents/                       # OS 層（監看 7 個 Agent）
│  │  ├─ page.tsx                   # Agent 清單 + 近況（成功率/cost）
│  │  └─ [agentCode]/page.tsx       # 單一 Agent 的 AgentRun 清單
│  │
│  └─ settings/
│     ├─ connectors/page.tsx        # drive / facebook / line 連線設定
│     ├─ policies/page.tsx          # Policy 一覽（PolicyEngine 規則）
│     └─ members/page.tsx           # Actor（human）管理
│
└─ api/                             # Route Handlers → 見 docs/10
```

### 導覽階層 (Nav Hierarchy)

```
Sidebar (primary)                Topbar (global)
┌───────────────────┐            ┌──────────────────────────────────────────────┐
│ ● Dashboard       │            │  JBG OS   [⌘K 搜尋]      🔔(3 HR)   ▢ Loop 跑中 │
│ ◇ Loops           │            └──────────────────────────────────────────────┘
│ ◇ Products  (SHAP)│              ↑ 全域搜尋(cmdk) / HR 未讀鈴鐺 / realtime 狀態燈
│ ◇ Photos    (SHAP)│
│ ◇ Review  ● 3     │  ← badge = pending HR 數（realtime）
│ ◇ Memory          │
│ ◇ Pricing   (SHAP)│
│ ◇ Agents          │
│ ─────────────     │
│ ⚙ Settings        │
└───────────────────┘
```

---

## 9.2 主要畫面設計 (Screen-by-Screen)

每個畫面給：**用途 / 線框 / 關鍵元件 / 資料來源(API·Entity) / 互動與狀態**。

### 9.2.1 Dashboard `/`

**用途**：老闆一天的第一個畫面。回答四個問題——今天 Loop 跑得如何？有什麼待辦(`Task`)？有什麼待我審(`HumanReview`)？成交(`Order`)多少？

**線框 (ASCII wireframe)**

```
┌─ Dashboard ───────────────────────────────── 2026-07-07 (今日) ──┐
│                                                                   │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐         │
│  │ Loop 執行  │ │ 待人審 HR  │ │ 待辦 Task │ │ 今日成交  │         │
│  │   42       │ │    3 ●    │ │    7      │ │  NT$18,400│         │
│  │ ↑ running 5│ │  逾時 1 ⚠ │ │ blocked 2 │ │  6 orders │         │
│  └───────────┘ └───────────┘ └───────────┘ └───────────┘         │
│                                                                   │
│  ┌─ 今日 Loop 概況 (product-lifecycle) ───────────────────────┐   │
│  │ stage       queued running wait_human done  fail          │   │
│  │ perceive      2      3        -        30    1            │   │
│  │ price         -      1        2        24    -            │   │
│  │ compose       1      -        1        22    -            │   │
│  │ review        -      -        -        20    2            │   │
│  │ publish       -      1        -        18    -            │   │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌─ 待我審核 (Human Review queue) ──────────┐ ┌─ 近期成交 ─────┐  │
│  │ ⚠ #HR-102 Price 高價確認  Chanel 包 · 8m │ │ Nike AF1  ✓   │  │
│  │   #HR-103 Publish 首次上架 · 3m          │ │ LV 短夾   ✓   │  │
│  │   #HR-101 Gap 補件 序號缺 · 22m          │ │ …            │  │
│  │            [全部 →]                       │ └───────────────┘  │
│  └──────────────────────────────────────────┘                    │
└───────────────────────────────────────────────────────────────────┘
```

**關鍵元件**：`<StatCard>`(shadcn Card)×4、`<LoopStageMatrix>`(表格熱區)、`<HumanReviewQueueWidget>`、`<RecentOrdersWidget>`。

**資料來源**
- StatCards / stage matrix：`GET /api/loops/executions?window=today&group=stage,status`（`LoopExecution`,`LoopStep`）。
- HR widget：`GET /api/reviews?status=pending&limit=5`（`HumanReview`）。
- 成交：`GET /api/channel/orders?window=today`（`Order`）。

**互動與狀態**
- 取資料：Server Component 首屏渲染（今日快照）→ 掛 `RealtimeProvider` 訂閱 `loop_executions`、`human_reviews` 變更做增量更新（見 §9.5）。
- 點 HR 列 → `/review/[reviewId]`；點成交 → `/products/[productId]/timeline`。
- Loading = skeleton stat cards；Empty（今日尚無執行）= 「今天還沒有 Loop 觸發，去 Loops 手動觸發一條 →」。

---

### 9.2.2 Loops `/loops` 與 `/loops/[loopId]`

**用途**：Loop 定義（`Loop` entity）的清單與單一 Loop 的執行歷史。這是「有哪些自動化迴圈、各跑得如何」的總覽。

**線框**

```
┌─ Loops ────────────────────────────────────────────────────────┐
│ [+ 手動觸發]                        搜尋: [ product-lifecycle ]  │
│ ┌────────────────────────────────────────────────────────────┐ │
│ │ id                 觸發      近24h  成功率  平均耗時  狀態    │ │
│ │ product-lifecycle  event    42     93%    2m14s    ● active │ │
│ │ drive-ingest       cron/5m  288    99%    8s       ● active │ │
│ │ price-refresh      cron/1d  120    88%    46s      ● active │ │
│ └────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

**資料來源**：`GET /api/loops`（`Loop` + 聚合 metric）。單一 Loop：`GET /api/loops/{loopId}` + `GET /api/loops/{loopId}/executions`。

**互動**：點 Loop → 定義頁（步驟圖 + 該 Loop 的 LX 清單，狀態用 §0.11 `loop_execution_status`）。`[手動觸發]` → `POST /api/loops/{loopId}/executions`（trigger=manual，見 §9.3 UI Flow 起點與 §10 Automation）。

---

### 9.2.3 LoopExecution Trace `/loops/[loopId]/executions/[lxId]`

**用途**：**單一 LX 的 step timeline / trace**——這是 Observability 的核心畫面。每一步 `LoopStep` 對應一次 `AgentRun`/Skill/Connector 呼叫，可下鑽看 `ContextSnapshot`、輸出、cost、trace id。

**線框**

```
┌─ LX #a1b2… · product-lifecycle ────────────  ● running · trace:tr_9f… ┐
│ Product: Chanel Classic Flap (draft)     觸發: event(drive.file.created) │
│ 狀態機: queued→running→[waiting_human]→…      耗時: 1m42s  cost: $0.083  │
│                                                                          │
│  ● perceive     ✓ 0.4s   ocr ‖ vision (並行)        [展開 trace ▾]       │
│    ├ ocr        ✓ AgentRun ar_11 · $0.006 · 吊牌:A01…                    │
│    └ vision     ✓ AgentRun ar_12 · $0.021 · brand=Chanel conf 0.94      │
│  ● assemble     ✓ 0.1s   合併 → Product 商品卡                           │
│  ● gap-check    ✓ 0.0s   缺: 序號 → 產生 Task#77                         │
│  ● price        ✓ 1.1s   PriceSuggestion NT$48,000 conf 0.72            │
│  ◐ human-review ⏳ waiting  HR#102 高價確認 → [前往裁決 →]                │
│  ○ compose      pending                                                  │
│  ○ review       pending                                                  │
│  ○ publish      pending                                                  │
│                                                                          │
│  [取消 LX]                              上一次: LX #z9… (succeeded)       │
└──────────────────────────────────────────────────────────────────────────┘
```

**關鍵元件**：`<StepTimeline>`（垂直 stepper，狀態圖示）、`<StepTraceDrawer>`（點步驟展開：input/output JSON、`ContextSnapshot`、token/cost、trace id 可複製）、`<LXStatusBadge>`。

**資料來源**：`GET /api/loops/{loopId}/executions/{lxId}`（含 `LoopStep[]`）；步驟展開時 `GET /api/agents/runs/{runId}`（`AgentRun` + `ContextSnapshot`）。

**互動與狀態**
- Realtime：訂閱該列 `loop_executions` 與其 `loop_steps`，狀態即時推進（不需 reload）。
- `waiting_human` 步驟顯示 `[前往裁決]` → `/review/[reviewId]`。
- `failed` 步驟紅底 + 錯誤訊息 + `[重試該步]`（`POST /api/loops/{loopId}/executions/{lxId}/retry?step=…`）。
- `[取消 LX]` → `POST …/executions/{lxId}/cancel`（狀態轉 `cancelled`）。

---

### 9.2.4 Products `/products`（列表）· `SHAP-specific`

**用途**：商品卡（`Product`）grid，一眼看每件商品「AI 補到哪、卡在哪、上架沒」。

**線框**

```
┌─ Products ─────────────────────────────────────────────────────┐
│ 篩選: [狀態 ▾ draft] [品牌 ▾] [缺料 ☑]        搜尋:[        ]  │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│ │ [照片]    │ │ [照片]    │ │ [照片]    │ │ [照片]    │           │
│ │ Chanel包  │ │ Nike AF1 │ │ LV 短夾   │ │ ??? 待辨識│           │
│ │ NT$48,000│ │ NT$3,200 │ │ NT$12,000│ │ —        │           │
│ │ ⏳human-rv│ │ ✓published│ │ ✎ draft  │ │ ⚠ gap 缺序號│         │
│ │ conf .72 │ │          │ │          │ │ vision .4│           │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘            │
└──────────────────────────────────────────────────────────────────┘
```

**關鍵元件**：`<ProductCard>`（縮圖、`listing_status` badge、價格、信心指示、gap 警示）、`<ProductFilters>`。

**資料來源**：`GET /api/catalog/products?status=&brand=&hasGap=`（`Product` + `ProductPhoto` 縮圖 + `Listing.status` + `Price`）。

**互動**：卡片點擊 → `/products/[productId]`。列表用 Server Component 分頁 + client 篩選（URL searchParams 驅動，可分享）。Empty = 「還沒有商品，去 Photos 匯入 Drive 照片 →」。

---

### 9.2.5 Product Editor `/products/[productId]`（單一商品卡編輯）· `SHAP-specific`

**用途**：一件商品的**駕駛艙**。左看照片與 AI 感知結果（OCR/Vision），右編商品欄位、價格、文案；並可觸發/查看該商品的 Loop。

**線框**

```
┌─ Chanel Classic Flap ────────────────  listing_status: draft  [觸發 Loop ▾]┐
│┌─照片 & 感知─────────────────┐ ┌─商品欄位───────────────────────────────┐│
││ ┌────┐┌────┐┌────┐          │ │ 品牌  [Chanel      ] (vision .94)       ││
││ │IMG ││IMG ││ +  │          │ │ 品類  [手提包       ] (vision .90)       ││
││ └────┘└────┘└────┘          │ │ 顏色  [黑          ]                     ││
││                              │ │ 序號  [__________] ⚠ gap (ocr 未讀到)   ││
││ OCR (ocr AgentRun)          │ │ 瑕疵  [輕微磨損 x2] (vision)            ││
││  吊牌: A01 · 尺寸: 25cm      │ ├────────────────────────────────────────┤│
││  序號: — (未偵測)            │ │ 定價  Price NT$48,000  [估價 →/pricing] ││
││ Vision (vision AgentRun)    │ │  PriceSuggestion .72 「近3月成交均價…」 ││
││  brand=Chanel conf .94      │ ├────────────────────────────────────────┤│
││  瑕疵: 邊角磨損, 五金氧化    │ │ 文案 (marketing draft Listing)         ││
││  [看原始 trace →]           │ │  「#Chanel 經典口蓋包，25cm…」  [重寫] ││
│└──────────────────────────────┘ └────────────────────────────────────────┘│
│ [儲存草稿]   [送審 Reviewer]   [看生命週期 timeline →]                      │
└──────────────────────────────────────────────────────────────────────────────┘
```

**關鍵元件**：`<PhotoStrip>`、`<PerceptionPanel>`（OCRResult / VisionResult，含信心與 trace 連結）、`<ProductFieldsForm>`（react-hook-form + zod）、`<PriceBlock>`（顯示 `Price` + `PriceSuggestion`）、`<ListingDraftEditor>`（Marketing 文案）。

**資料來源**
- 主資料：`GET /api/catalog/products/{id}`（`Product` + `ProductPhoto[]` + `OCRResult`/`VisionResult` + `Price` + 最新 `PriceSuggestion` + `Listing` draft）。
- 存檔：`PATCH /api/catalog/products/{id}`（樂觀更新，TanStack Query mutation）。
- `[估價]` → `POST /api/pricing/suggestions`（觸發 price Agent）。
- `[重寫文案]` → `POST /api/agents/runs`（agent=marketing）。
- `[送審]` → `POST /api/reviews`（建立 HR）或觸發 `review` step。

**互動與狀態**：欄位級 dirty 標示；gap 欄位（缺序號）以 ⚠ 高亮並可一鍵「開 Task 補件」。權限不足（例如非 owner 想改已 published 商品）→ 欄位 disabled + tooltip（PolicyEngine 判定，見 §9.6）。

---

### 9.2.6 Photos `/photos` · `SHAP-specific`

**用途**：從 Google Drive（`drive` connector）進來的 `ProductPhoto`，看「哪些照片已對應到 Product、哪些還沒被感知/組卡」。

**線框**

```
┌─ Photos (from Drive) ──────────────────────────────────────────┐
│ [同步 Drive ↻]  篩選:[未對應 ☑][感知失敗 ☐]     來源:/賣場相片   │
│ ┌────────┐┌────────┐┌────────┐┌────────┐                       │
│ │[thumb] ││[thumb] ││[thumb] ││[thumb] │                        │
│ │→Chanel包││→Nike   ││ ⏳感知中││ ⚠未對應│                       │
│ │ocr✓ vis✓││ ✓      ││        ││ (孤兒) │                        │
│ └────────┘└────────┘└────────┘└────────┘                       │
└──────────────────────────────────────────────────────────────────┘
```

**資料來源**：`GET /api/catalog/photos?linked=&perceived=`（`ProductPhoto` + 對應 `Product` + OCR/Vision 狀態）。`[同步 Drive]` → `POST /api/connectors/drive/sync`（觸發 `drive-ingest` loop，見 §10）。

**互動**：點孤兒照片 → 手動指派到既有/新建 Product；感知失敗照片 → `[重跑感知]`（觸發 perceive step）。

---

### 9.2.7 Review `/review`（HR 佇列）· `/review/[reviewId]`（裁決）

**用途**：**Human Review 佇列**——所有 `pending` 的 `HumanReview`。這是全站最重要的操作面：老闆在此 approve / reject / edit。

**佇列線框**

```
┌─ Human Review ──────────────────────────  pending 3 · 逾時 1 ⚠ ──┐
│ 類型:[全部 ▾]  排序:[逾時優先 ▾]                                  │
│ ┌──────────────────────────────────────────────────────────────┐ │
│ │ ⚠ HR#102 price   高價確認  Chanel 包 NT$48,000   ⏱ 逾 8m      │ │
│ │   HR#103 publish 首次上架  Nike AF1               ⏱ 3m        │ │
│ │   HR#101 gap     補件·序號 LV 短夾                ⏱ 22m       │ │
│ └──────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

**裁決線框 `/review/[reviewId]`**

```
┌─ HR#102 · price 高價確認 ───────────────  target: Product Chanel Flap ┐
│ 觸發原因: PriceSuggestion NT$48,000 > 門檻 NT$30,000 (Policy pol_price_hi)│
│ ┌─ AI 主張 ──────────────────┐ ┌─ 佐證 ─────────────────────────┐      │
│ │ 建議售價 NT$48,000          │ │ 近3月同款成交: 45k~52k (memory) │      │
│ │ 信心 0.72                   │ │ 瑕疵: 邊角磨損 → 建議 -8%       │      │
│ │ 區間 44,000–50,000          │ │ [看 LX trace →]                 │      │
│ └────────────────────────────┘ └─────────────────────────────────┘      │
│ 調整售價: [ 46,000 ]  備註:[ 磨損扣一點 ]                                 │
│                                                                           │
│   [ ✓ Approve ]   [ ✎ Edit & Approve ]   [ ✗ Reject → 退回 compose ]     │
└───────────────────────────────────────────────────────────────────────────┘
```

**關鍵元件**：`<ReviewQueueList>`、`<ReviewDecisionPanel>`（AI 主張 vs 佐證並排、可編輯欄位、三顆決策鈕）、`<PolicyReasonBadge>`（顯示是哪條 `Policy` 觸發）。

**資料來源**：佇列 `GET /api/reviews?status=pending`；單筆 `GET /api/reviews/{id}`（`HumanReview` + polymorphic target 快照 + 觸發它的 `LoopStep`/`Policy`）。裁決 `POST /api/reviews/{id}/decision`（`{ decision: approved|rejected|edited, patch?, note? }`，狀態走 §0.11 `human_review_status`）。

**互動與狀態**：決策後樂觀更新（列表移除、sidebar badge -1）；失敗 rollback + toast。`expired`（逾時）以 ⚠ 置頂。Reject 需選退回目標（回 `assemble`/`compose`）——對齊 §0.7 回退邊。

---

### 9.2.8 Memory `/memory`（瀏覽/搜尋）· `/memory/[memoryId]`

**用途**：瀏覽與**語意搜尋** `Memory`（含 pgvector recall），看 AI 累積了哪些事實/偏好/回饋/參考，並追 `MemoryLink` 關聯。

**線框**

```
┌─ Memory ───────────────────────────────────────────────────────┐
│ 🔎 [ Chanel 定價策略                          ] (語意搜尋)        │
│ 類型:[全部 ▾ fact|preference|feedback|reference]                 │
│ ┌──────────────────────────────────────────────────────────────┐ │
│ │ [fact] Chanel 經典款近3月成交均價 NT$47k   sim .89  ↗3 links  │ │
│ │ [pref] 老闆偏好文案語氣: 簡潔+強調保存狀況  sim .81           │ │
│ │ [feedback] LV 系列客訴多在五金 → 上架註明   sim .77           │ │
│ └──────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

**資料來源**：搜尋 `GET /api/memories?q=…&type=`（後端做 embedding + pgvector similarity，見 §10 MemoryStore）。單筆 `GET /api/memories/{id}`（`Memory` + `MemoryLink[]` 圖）。

**互動**：搜尋為 client 互動（TanStack Query，debounce）；點 memory → 詳情頁畫 `MemoryLink` 關聯圖（`[[slug]]`）。可手動新增/停用一條 memory（`POST/PATCH /api/memories`）。

---

### 9.2.9 Pricing `/pricing/[productId]`（估價 + 價格歷史圖）· `SHAP-specific`

**用途**：單一商品的估價工作台 + `PriceHistory` 折線圖。

**線框**

```
┌─ Pricing · Chanel Classic Flap ────────────────────────────────┐
│ 目前定價 Price: NT$48,000   [重新估價 → price Agent]            │
│ ┌─ 價格歷史 (PriceHistory) ────────────────────────────────┐   │
│ │ 52k┤            ●─────●                                    │   │
│ │ 48k┤     ●─────●       ╲___● (now)                         │   │
│ │ 44k┤ ●──╱                                                  │   │
│ │    └────┬────┬────┬────┬────┬───                           │   │
│ │       6/1  6/8 6/15 6/22 6/29                              │   │
│ └────────────────────────────────────────────────────────────┘  │
│ 最新建議 PriceSuggestion: 46,000 (conf .72) 「磨損扣8%」          │
│  理由: 近3月成交 45–52k(memory) · 瑕疵折讓 · [套用] [送 HR]      │
└──────────────────────────────────────────────────────────────────┘
```

**資料來源**：`GET /api/pricing/products/{id}`（`Price` + `PriceHistory[]` + 最新 `PriceSuggestion`）。重新估價 `POST /api/pricing/suggestions`（price Agent）。金額依 §0.10 為整數最小貨幣單位 + currency，前端格式化顯示。

**互動**：`[套用]` 高於門檻時自動轉為 `[送 HR]`（PolicyEngine 判定）。折線圖用 client 圖表元件（資料 server 供給）。

---

### 9.2.10 Timeline `/products/[productId]/timeline`（生命週期時間軸）· `SHAP-specific`

**用途**：一件商品從照片到售後的**完整生命週期**——把 §0.7 `product-lifecycle` 的每個 stage 對這件商品的實際發生時間、產出、經手 Agent/HR 串成一條時間軸。這是「回放這件商品發生過什麼」的畫面。

**線框**

```
┌─ Timeline · Chanel Classic Flap ───────────────────────────────┐
│ 06/30 14:02  drive-ingest   照片 3 張自 Drive 匯入               │
│ 06/30 14:02  perceive       ocr✓ vision✓ (LX#a1b2)              │
│ 06/30 14:03  assemble       商品卡建立                          │
│ 06/30 14:03  gap-check      缺序號 → Task#77 (已補 06/30 15:10) │
│ 06/30 15:12  price          PriceSuggestion 48k (conf .72)       │
│ 06/30 15:12  human-review   HR#102 approve→46k (老闆 06/30 15:40)│
│ 06/30 15:41  compose        文案 draft (marketing)              │
│ 06/30 15:42  review         Reviewer pass                       │
│ 06/30 15:43  publish        FB 上架 ✓ Listing#55                │
│ 07/02 10:20  engage         Inquiry#88「可議價?」               │
│ 07/03 09:05  close          Order#33 成交 NT$45,500             │
│ 07/06 11:00  remember       Memory: 「磨損款議價空間~5%」        │
└──────────────────────────────────────────────────────────────────┘
```

**關鍵元件**：`<LifecycleTimeline>`（垂直時間軸，每筆連結到對應 LX/HR/Order/Memory）。

**資料來源**：`GET /api/catalog/products/{id}/timeline`（聚合：`LoopStep`、`HumanReview`、`Inquiry`、`Order`、`AfterSale`、`Memory` 依時間排序；後端組裝，見 §10 ContextBuilder/timeline 組裝）。

---

## 9.3 UI Flow：一件商品從照片到上架 (End-to-End Operator Path)

以下是操作者（human `Actor`）在 UI 上、對一件商品走完 §0.7 `product-lifecycle` 的完整路徑，含 **Human Review 介入點**。粗體階段為 UI 上的實際頁面/動作。

```
┌─────────────────────────────────────────────────────────────────────────┐
│  [自動·背景]                          [操作者在 UI 的動作]                 │
├─────────────────────────────────────────────────────────────────────────┤
│  drive-ingest cron 抓到新照片                                             │
│      │  (Supabase realtime → Dashboard「Loop 執行 +1」)                   │
│      ▼                                                                    │
│  perceive (ocr ‖ vision) 自動跑                                           │
│      │                                                                    │
│      ▼                                                                    │
│  assemble → Product 商品卡自動生成                                        │
│      │                                                                    │
│      ▼                                                                    │
│  gap-check ── 有缺料? ──yes──►  ★ Task 出現在 Dashboard 待辦             │
│      │no                        操作者到 /products/[id] 補序號 → 存檔     │
│      ▼                                          │                         │
│  price → PriceSuggestion                        ▼                         │
│      │                                    (補完 → Loop 續跑)              │
│      ▼                                                                    │
│  高價/低信心? ──yes──►  ★★ Human Review 介入點①                          │
│      │no                 sidebar 鈴鐺 +1 → /review/HR#102               │
│      │                   操作者 Approve / Edit(改價) / Reject            │
│      ▼                          │                                        │
│  compose (marketing 文案) ◄─────┘ (approve 續跑；reject 回 compose)      │
│      │                                                                    │
│      ▼                                                                    │
│  review (Reviewer Agent 自動審)                                          │
│      │  pass ──────────────────────────────────►                        │
│      │  reject ──►  回 assemble/compose（操作者可到 /products 修）        │
│      ▼                                                                    │
│  首次上架/合規? ──yes──►  ★★ Human Review 介入點②                       │
│      │no                  /review/HR#103 → Approve 才發                  │
│      ▼                          │                                        │
│  publish (publisher → FB) ◄─────┘                                        │
│      │  Listing.published ✓                                              │
│      ▼                                                                    │
│  Dashboard「今日成交/上架」更新 · Timeline 記錄該節點                     │
└─────────────────────────────────────────────────────────────────────────┘

介入點總結（Human Review Touchpoints）:
  ①  price → human-review：高價或低信心的定價確認（Policy: pol_price_hi）
  ②  publish 前：首次上架 / 合規審核（marketing 首發預設需 HR，見 §0.6）
  （另：gap-check 產生的是 Task 補件，非 HR，但同樣需操作者介入）
```

**設計要點**：操作者永遠**不需要主動輪詢**。所有「該我動」的時刻都會透過 (a) sidebar Review badge、(b) Dashboard 待辦區、(c) 可選的 LINE 推播（見 `docs/10` Notification）三管齊下浮現。

---

## 9.4 元件庫與設計系統 (Component Library & Design System)

**基底 = shadcn/ui + Tailwind**。分三層：

```
components/
├─ ui/                    # shadcn 原生（button, card, dialog, table, badge,
│                         #   drawer, tabs, toast, command, skeleton, tooltip…）
├─ shared/                # OS 層跨畫面元件（可重用）
│  ├─ AppShell.tsx        # Sidebar+Topbar layout
│  ├─ StatCard.tsx
│  ├─ StepTimeline.tsx    # LX trace 用（Loop/Timeline 共用底層）
│  ├─ StepTraceDrawer.tsx
│  ├─ LXStatusBadge.tsx   # 對齊 §0.11 loop_execution_status 顏色
│  ├─ ReviewDecisionPanel.tsx
│  ├─ ConfidenceMeter.tsx # 信心值視覺化（vision/price 共用）
│  ├─ EmptyState.tsx / ErrorState.tsx / PermissionDenied.tsx
│  └─ RealtimeProvider.tsx
└─ features/              # 綁定 vertical（多為 SHAP-specific）
   ├─ products/ (ProductCard, PerceptionPanel, ProductFieldsForm …)
   ├─ pricing/  (PriceBlock, PriceHistoryChart)
   ├─ photos/   (PhotoStrip, DriveSyncButton)
   └─ memory/   (MemorySearch, MemoryLinkGraph)
```

**設計 tokens（狀態顏色，全站一致）**——直接對映 canonical 狀態機 (§0.11)：

```
loop_execution_status   顏色/圖示
  queued        灰   ○
  running       藍   ◐ (脈動)
  waiting_human 琥珀 ⏳
  succeeded     綠   ✓
  failed        紅   ✗
  cancelled     灰   ⊘

human_review_status: pending 琥珀 / approved 綠 / rejected 紅 / edited 藍 / expired 深橙⚠
listing_status:      draft→in_review→approved→published→sold→archived（灰→藍→靛→綠→紫→灰）
```

**排版/密度**：資訊密集畫面（trace、review、products grid）用緊湊表格與卡片；金額一律 `Intl.NumberFormat` 依 currency 格式化（`_amount` 為最小貨幣單位整數，見 §0.10）。全站深色/淺色雙主題（shadcn theme）。全域 `⌘K` command palette 做跨 Entity 搜尋。

---

## 9.5 狀態管理策略 (State Management Boundaries)

嚴格界線，避免「什麼都塞 client」：

| 資料性質 | 用什麼 | 例子 |
|---|---|---|
| 首屏、可快取、SEO 無關但重讀取 | **Server Component** 直接 `await` Supabase / fetch route handler | Dashboard 首屏、Products 列表、Timeline、Memory 詳情 |
| 需互動、樂觀更新、re-fetch、cache invalidation | **TanStack Query**（client） | 商品欄位存檔、HR 裁決、估價、文案重寫、Memory 語意搜尋 |
| 純 UI 客戶端狀態（不進 DB） | **Zustand** | Sidebar 收合、目前選中的 photo、trace drawer 開關、篩選面板 |
| 跨執行的即時推進 | **Supabase Realtime**（見下） | LX 狀態、LoopStep 進度、HR queue badge |

**原則**：
- **能在 Server Component 拿的就不要進 client**。client 只拿「會變或要互動」的部分。
- **寫入一律經 route handler**（`/api/**`）→ 再由 TanStack Query mutation 觸發，成功後 `invalidateQueries`。禁止 client 直接寫 Supabase（RLS 之外還要走 PolicyEngine，見 §0.9）。
- **樂觀更新**用在高頻互動（HR 裁決、欄位存檔）：先更新 UI，失敗 rollback + toast。

### 即時更新 (Realtime)

`<RealtimeProvider>`（掛在 `(app)/layout.tsx`）訂閱 Supabase realtime channel：

```ts
// 訂閱 LoopExecution 狀態變更 → 更新 Dashboard / 對應 trace 頁 / sidebar
supabase
  .channel('lx')
  .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'loop_executions' },
      (payload) => queryClient.setQueryData(['lx', payload.new.id], payload.new))
  .on('postgres_changes',
      { event: '*', schema: 'public', table: 'human_reviews' },
      (payload) => queryClient.invalidateQueries({ queryKey: ['reviews'] })) // badge/queue
  .subscribe();
```

- LX trace 頁：額外訂閱該 LX 的 `loop_steps`，讓 step timeline 即時推進。
- Sidebar Review badge 與 Dashboard HR widget：訂閱 `human_reviews` 增量更新，無需輪詢。
- 連線中斷 → topbar realtime 燈轉灰 + 自動重連；重連後 `invalidateQueries` 全量校正。

---

## 9.6 Loading / Empty / Error / 權限不足 狀態原則

全站四態統一，用 `shared/` 的 `EmptyState` / `ErrorState` / `PermissionDenied` + shadcn `Skeleton`。

```
┌ Loading ────────────────┐ ┌ Empty ──────────────────┐
│ ▓▓▓▓ ▓▓▓  (skeleton)     │ │   🗂️  尚無資料           │
│ ▓▓ ▓▓▓▓▓                 │ │   「今天還沒有 Loop      │
│ (Server Component 用      │ │    觸發，去 Loops 手動   │
│  Suspense fallback；      │ │    觸發一條 →」          │
│  client 用 isLoading)     │ │   [主要 CTA]             │
└─────────────────────────┘ └─────────────────────────┘
┌ Error ──────────────────┐ ┌ Permission Denied ──────┐
│   ⚠ 載入失敗             │ │   🔒 權限不足            │
│   {人類可讀訊息 + code}  │ │  「此動作需 owner 權限   │
│   [重試]  [回報]         │ │   或需先經 Human Review」│
│   (error.tsx boundary)   │ │  (PolicyEngine 判定)     │
└─────────────────────────┘ └─────────────────────────┘
```

**原則**：
- **Loading**：Server Component 用 `loading.tsx` / `<Suspense>` skeleton；client mutation 用按鈕 inline spinner + disable，避免整頁 spinner。
- **Empty**：每個 empty 都給**下一步 CTA**（不是死路），且區分「真的沒有」vs「篩選後為空」。
- **Error**：每個 route segment 放 `error.tsx` boundary；顯示人類可讀訊息 + 後端 `error.code`（回應封裝 `{ data, error, meta }`，見 §0.10 / `docs/10`）；提供 `[重試]`。
- **權限不足**：兩種——(a) RLS 讀不到 → 404/空；(b) 動作被 PolicyEngine 擋（如未經 HR 想直接 publish、改價超門檻）→ 顯示 `PermissionDenied` 並說明「需 HR / 需 owner」，把「有副作用或不可逆動作預設需 Permission/HR」（§0.9）落到 UI：這類按鈕**預設 disabled + tooltip 說明原因**，而不是點了才失敗。

---

## 本章交付物 (Deliverables)

1. `app/` 完整路由樹（§9.1）：`(auth)` / `(app)` route groups，涵蓋 Dashboard、Loops、LoopExecution trace、Products、Product Editor、Photos、Review(queue+decision)、Memory、Pricing、Agents、Timeline、Settings。
2. 10 個主要畫面的線框 + 關鍵元件 + 資料來源(API·Entity) + 互動/狀態規格（§9.2）。
3. 「照片 → 上架」完整 UI Flow 流程圖，標明 2 個 Human Review 介入點與 Task 補件點（§9.3）。
4. 三層元件庫結構（`ui/` `shared/` `features/`）與設計 token（狀態顏色對映 §0.11 狀態機）（§9.4）。
5. 狀態管理界線表（Server Component / TanStack Query / Zustand / Realtime）+ realtime 訂閱範例（§9.5）。
6. Loading/Empty/Error/Permission 四態統一原則與 UI（§9.6）。

## 驗收條件 (Acceptance Criteria)

- [ ] 所有路由、Entity、Agent、Loop、狀態名稱與 `docs/00` §0.5–0.11 **完全一致**（無自創名稱、無虛構模型 id）。
- [ ] 每個列出的畫面都能對應到 §0.7 `product-lifecycle` 的至少一個 stage，且 Dashboard/Loop/Review/Timeline 能完整覆蓋主流程可觀測性。
- [ ] 每個畫面的資料來源 API 皆符合 §0.10 命名（`/api/<context>/<resource>`），且與 `docs/10` API 表對得上。
- [ ] 任一 `pending` 的 `HumanReview` 從任意頁面**兩次點擊內**可達並可裁決（sidebar badge → decision panel）。
- [ ] 任一 `LoopExecution` 可下鑽至 `LoopStep` → `AgentRun` → `ContextSnapshot`（trace 完整）。
- [ ] 寫入路徑全部經 route handler + TanStack Query mutation，無 client 直寫 Supabase；realtime 訂閱 `loop_executions` 與 `human_reviews`。
- [ ] `SHAP-specific` 畫面（Products/Photos/Pricing/Timeline）已明確標記，OS 層畫面可獨立重用。
- [ ] 四態（loading/empty/error/permission）在每個 route segment 皆有對應處理；有副作用/不可逆動作在 UI 上預設 disabled + 原因說明（對齊 §0.9）。

— 見 `docs/04`（系統架構全局）、`docs/07`（Agent I/O 與 HR）、`docs/08`（Workflow 狀態機）、`docs/10`（API/Services/Workers 實作）。
