# 附錄 C · API Naming Convention

> 本附錄把 §0.10「API」段展開成完整、可直接遵循的規範。所有 Route Handler（`app/api/**`，§0.3）與 Edge Function 對外 API 皆須遵此。
> 與 `docs/00-canonical-model.md` 衝突時，**以 00 為準**。Entity 名稱一律引用 §0.5，狀態機 enum 引用 §0.11。

---

## C.1 路徑結構 (Path Structure)

**基本形：** `/api/<context>/<resource>`

- `<context>` = §0.5 的 Bounded Context（`catalog` / `pricing` / `perception` / `loops` / `agents` / `memory` / `channel` / `governance`）。
- `<resource>` = 該 context 下的 Entity，**用複數、kebab-case**。
- 全小寫、kebab-case、不含底線、不含駝峰、結尾不加斜線。

```
/api/catalog/products                 # Catalog context → Product
/api/catalog/products/{id}
/api/catalog/product-photos/{id}      # 多字資源用 kebab-case
/api/pricing/price-suggestions
/api/loops/{id}/executions            # 動作/子資源（見 C.2）
/api/governance/human-reviews/{id}
```

> context 用複數或原名皆可，但**全書統一**：`loops`、`agents`、`catalog`、`pricing`、`perception`、`memory`、`channel`、`governance`。resource **一律複數**。

### 巢狀資源

僅在「子資源不能脫離父資源存在」時巢狀，最多兩層：

```
/api/catalog/products/{id}/photos          # ProductPhoto 屬於 Product
/api/channel/orders/{id}/after-sales       # AfterSale 屬於 Order
```

跨 context 關聯**不要**巢狀，用 query filter 表達（`/api/pricing/price-histories?product_id=...`）。

---

## C.2 動作型 (Non-CRUD Actions) 與版本策略

### 動作型子路徑

非 CRUD 的「觸發/狀態轉移」用**子資源或動詞子路徑**，動詞用 kebab-case：

| 語意 | ✅ 建議 | 說明 |
|---|---|---|
| 觸發一次 Loop 執行 | `POST /api/loops/{id}/executions` | 建立一個 `LoopExecution` 子資源（RESTful 首選） |
| 取消執行 | `POST /api/loops/executions/{id}/cancel` | 狀態轉移動詞（§0.11：→ cancelled） |
| 核准 Human Review | `POST /api/governance/human-reviews/{id}/approve` | 動詞子路徑（approve/reject/edit） |
| 發佈 Listing | `POST /api/channel/listings/{id}/publish` | 受 Permission 管（§0.9） |
| 重跑 Agent | `POST /api/agents/runs/{id}/retry` | — |

原則：**能表達成「建立子資源」就用子資源；純狀態轉移才用動詞子路徑。** 動詞一律 `POST`。

### 版本策略

- **預設不在 URL 帶版本**；相容性用附加欄位（additive）維持。
- 需要破壞性改版時，用**路徑前綴** `/api/v2/...`，且僅對受影響的 resource 開 v2，舊版保留至遷移完成。
- 回應 `meta.apiVersion` 標示當前版本（C.3）。
- 不用 header 版本協商（降低 client 複雜度）。

---

## C.3 統一回應封裝 `{ data, error, meta }`

所有 endpoint（成功與失敗）都回傳同一外殼。**成功時 `error: null`；失敗時 `data: null`。**

```ts
// packages/domain/src/shared/api.ts
export interface ApiMeta {
  requestId: string;        // 追蹤用（對應 §0.12 Observability）
  apiVersion: string;       // e.g. "1.0"
  timestamp: string;        // ISO 8601
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface ApiError {
  code: string;             // 機器可讀，見 C.4（SCREAMING_SNAKE）
  message: string;          // 人類可讀（可 i18n）
  field?: string;           // 驗證錯誤時指出欄位
  details?: unknown;        // 額外脈絡（zod issues 等）
}

export interface ApiResponse<T> {
  data: T | null;
  error: ApiError | null;
  meta: ApiMeta;
}

// 便利 helper
export const ok = <T>(data: T, meta: Partial<ApiMeta> & Pick<ApiMeta, "requestId">): ApiResponse<T> => ({
  data, error: null, meta: { apiVersion: "1.0", timestamp: new Date().toISOString(), ...meta } as ApiMeta,
});
export const fail = (error: ApiError, meta: Pick<ApiMeta, "requestId">): ApiResponse<never> => ({
  data: null, error, meta: { apiVersion: "1.0", timestamp: new Date().toISOString(), ...meta } as ApiMeta,
});
```

規則：
- 列表回應 `data` 為陣列，且 `meta.pagination` 必填。
- 單筆回應 `data` 為物件。
- 空結果回 `data: []` 或 `data: null` + `200`，不要用 `404` 表達「查詢無資料」（`404` 專指路由/資源本身不存在）。

---

## C.4 錯誤碼規範 (Error Codes)

`error.code` 用 `SCREAMING_SNAKE`，語意穩定、可被 client `switch`：

| code | 對應 HTTP | 意義 |
|---|---|---|
| `VALIDATION_FAILED` | 400 | 請求體/參數未過 zod 驗證（帶 `field`/`details`） |
| `UNAUTHENTICATED` | 401 | 無有效 session |
| `PERMISSION_DENIED` | 403 | 過 auth 但 `PolicyEngine`/RLS 拒絕（§0.9） |
| `NOT_FOUND` | 404 | 資源不存在 |
| `CONFLICT` | 409 | 狀態衝突（如非法狀態轉移、重複唯一鍵） |
| `IDEMPOTENCY_CONFLICT` | 409 | 相同冪等鍵、不同請求體（C.7） |
| `RATE_LIMITED` | 429 | 觸發限流 |
| `HUMAN_REVIEW_REQUIRED` | 422 | 動作因政策需先經 HumanReview（§0.9） |
| `UPSTREAM_ERROR` | 502 | Connector 呼叫的外部系統失敗（§0.8） |
| `INTERNAL_ERROR` | 500 | 未預期錯誤 |

規則：
- **一種錯誤情境對一個 code**；不要用 `message` 區分程式邏輯。
- `message` 可換語言、可改字；`code` 不可隨意改（等同契約）。
- 驗證錯誤盡量帶 `field` 讓表單能定位（附錄 B §B.4）。

---

## C.5 分頁 / 排序 / 過濾 Query 慣例

| 功能 | query 參數 | 範例 |
|---|---|---|
| 分頁（頁碼式） | `page`（1-based）, `page_size`（預設 20，上限 100） | `?page=2&page_size=50` |
| 排序 | `sort`（欄位，`-` 前綴 = 降冪，逗號多欄） | `?sort=-created_at,name` |
| 過濾 | `<field>=<value>`（欄位名 = DB 欄位 snake_case） | `?brand_id=...&is_published=true` |
| 範圍過濾 | `<field>_gte` / `<field>_lte` | `?price_amount_gte=100000` |
| 關鍵字搜尋 | `q` | `?q=chanel` |
| 狀態過濾 | 對應 §0.11 enum 值 | `?status=waiting_human` |

規則：
- query 欄位名用 **snake_case**，與 DB 欄位一致（附錄 D），避免前端再做映射。
- 分頁一律回 `meta.pagination`（C.3）。
- 未帶 `page` 時預設第 1 頁；未帶 `sort` 時各 resource 定義預設排序（通常 `-created_at`）。
- 過濾值型別由 zod schema 驗證（`is_published` 收 `"true"/"false"` 轉 boolean）。

---

## C.6 HTTP 狀態碼用法

| 方法 / 情境 | 狀態碼 |
|---|---|
| `GET` 成功 | 200 |
| `POST` 建立成功 | 201（`data` = 新資源；可加 `Location` header） |
| `POST` 動作成功但無新資源 | 200 |
| `PATCH`/`PUT` 成功 | 200 |
| `DELETE` 成功 | 200（回被刪資源或 `data: null`）；純刪可 204（無 body） |
| 非同步已受理（進佇列） | 202（`data` = 執行 handle，如 `LoopExecution.id`） |
| 錯誤 | 依 C.4 對照表 |

- 動作型觸發長任務（如 `POST /loops/{id}/executions`）回 **202** + `LoopExecution` id，client 再輪詢或訂閱狀態（§0.11）。

---

## C.7 冪等鍵 (Idempotency)

對「會產生副作用且可能被重送」的 `POST`（發佈、建立訂單、觸發執行、外部通知）支援冪等：

- client 帶 header：`Idempotency-Key: <uuid>`（每個邏輯操作一把，重試時沿用同一把）。
- server 以 `(actor, endpoint, idempotency_key)` 為鍵儲存首次結果（TTL 24h）：
  - 相同鍵 + 相同請求體 → 回**首次的結果**（不重複執行副作用）。
  - 相同鍵 + 不同請求體 → `409 IDEMPOTENCY_CONFLICT`。
- 純讀 `GET` 天生冪等，不需此 header。
- Connector 對外寫入（§0.8）也在其層級帶冪等（附錄 F），與此 API 層冪等鍵串接。

---

## C.8 Entity → Endpoints 對照表（範例）

以 §0.5 的代表性 Entity 展開（非窮舉；新 Entity 依同規則推導）：

| Entity (§0.5) | Context | 主要 endpoints |
|---|---|---|
| `Product` | Catalog | `GET/POST /api/catalog/products`、`GET/PATCH/DELETE /api/catalog/products/{id}`、`GET /api/catalog/products/{id}/photos` |
| `ProductPhoto` | Catalog | `GET /api/catalog/product-photos/{id}`、`POST /api/catalog/products/{id}/photos` |
| `PriceSuggestion` | Pricing | `GET /api/pricing/price-suggestions?product_id=...`、`POST /api/pricing/products/{id}/price-suggestions`（觸發 Price Agent） |
| `Loop` | Loop | `GET /api/loops`、`GET /api/loops/{id}`、`POST /api/loops/{id}/executions`（觸發，回 202） |
| `LoopExecution` | Loop | `GET /api/loops/executions/{id}`、`POST /api/loops/executions/{id}/cancel` |
| `AgentRun` | Agent | `GET /api/agents/runs/{id}`、`POST /api/agents/runs/{id}/retry` |
| `Listing` | Channel | `GET/POST /api/channel/listings`、`POST /api/channel/listings/{id}/publish`（Permission） |
| `Order` | Channel | `GET/POST /api/channel/orders`、`GET /api/channel/orders/{id}/after-sales` |
| `HumanReview` | Governance | `GET /api/governance/human-reviews?status=pending`、`POST /api/governance/human-reviews/{id}/approve`(`/reject`,`/edit`) |
| `Memory` | Memory | `GET/POST /api/memory/memories`、`GET /api/memory/memories/{id}` |

---

## C.9 命名對照：good / bad

| 情境 | ✅ good | ❌ bad | 理由 |
|---|---|---|---|
| resource 單複數 | `/api/catalog/products` | `/api/catalog/product` | resource 一律複數 |
| 大小寫 | `/api/catalog/product-photos` | `/api/catalog/productPhotos` | kebab-case，非駝峰 |
| context | `/api/pricing/price-suggestions` | `/api/price-suggestions` | 必須帶 §0.5 context |
| 動作型 | `POST /api/loops/{id}/executions` | `POST /api/run-loop?id=...` | 用子資源，非動詞 query |
| 狀態轉移 | `POST /api/channel/listings/{id}/publish` | `POST /api/publish-listing` | 動詞掛在資源下 |
| 過濾 | `?is_published=true` | `?published=1` | 欄位名對齊 DB（附錄 D） |
| 錯誤 | `403 { code: "PERMISSION_DENIED" }` | `200 { ok:false }` | 用 HTTP 碼 + 穩定 code |
| 空結果 | `200 { data: [] }` | `404` | 404 只表示資源不存在 |

---

## C.10 檢查清單 (Checklist)

- [ ] 路徑為 `/api/<context>/<resource>`，`<context>` 用 §0.5 context 名，`<resource>` 複數 + kebab-case。
- [ ] 巢狀僅用於「子資源不能獨立存在」，最多兩層；跨 context 關聯用 query filter。
- [ ] 非 CRUD 動作用子資源或動詞子路徑（`POST`），能表成建立子資源就優先建子資源。
- [ ] 每個回應都是 `{ data, error, meta }`；成功 `error: null`、失敗 `data: null`。
- [ ] `error.code` 取自 C.4 對照表（SCREAMING_SNAKE），HTTP 狀態碼與之對齊。
- [ ] 列表回應含 `meta.pagination`；query 用 `page/page_size/sort/q` 與 snake_case 欄位。
- [ ] 副作用/長任務 `POST` 回 201/202 並支援 `Idempotency-Key`（C.7）。
- [ ] 具外部副作用/不可逆動作在 handler 先過 Permission / 觸發 HumanReview（§0.9），拒絕時回 403/422。
- [ ] 對外 IO 經 `packages/connectors`（§0.8），失敗回 `502 UPSTREAM_ERROR`。
- [ ] Entity 名與 §0.5 一致，狀態值與 §0.11 enum 一致。
