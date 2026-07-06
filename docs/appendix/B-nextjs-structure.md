# 附錄 B · Next.js Structure

> 本附錄規範 `app/`（Next.js App Router）的內部結構，對應 §0.3 技術棧（Next 15+ / React 19 / Tailwind + shadcn/ui / TanStack Query + Zustand / Route Handlers）。
> 與 `docs/00-canonical-model.md` 衝突時，**以 00 為準**。資料夾樹的上位規範見**附錄 A**；API 命名見**附錄 C**。

---

## B.1 App Router 慣例 (Conventions)

### B.1.1 Route Groups

用 route group `(name)`（不進 URL 路徑）切分兩種使用情境：

```
app/
├── (marketing)/                 # 公開頁：不需登入。獨立 layout（行銷風格）
│   ├── layout.tsx               # marketing 專用 header/footer
│   ├── page.tsx                 # landing
│   └── pricing/page.tsx
│
├── (app)/                       # 產品頁：需登入。共用 app shell（側欄/頂欄）
│   ├── layout.tsx               # 檢查 session；未登入 redirect
│   ├── catalog/
│   ├── loops/
│   ├── reviews/
│   └── memory/
│
├── api/                         # Route Handlers（見附錄 C），不放 UI
├── layout.tsx                   # root layout：<html>、字型、全域 provider
├── loading.tsx                  # root loading
├── not-found.tsx                # 404
└── error.tsx                    # root error boundary（'use client'）
```

規則：
- **每個 route group 一個 layout**；`(marketing)` 與 `(app)` 不共用視覺外殼。
- `app/api/**` 只放 Route Handler（`route.ts`），**不得**放 `page.tsx`。
- URL 路徑用 kebab-case，對應 §0.5 context（`/catalog`、`/loops`、`/reviews`）。

### B.1.2 特殊檔案 (loading / error / not-found / metadata)

| 檔案 | 用途 | 是否 client |
|---|---|---|
| `layout.tsx` | 巢狀共用外殼；持久不重繪 | 預設 server |
| `page.tsx` | 路由頁面本體 | 預設 server |
| `loading.tsx` | Suspense fallback（資料載入中） | server |
| `error.tsx` | 錯誤邊界；**必須** `'use client'` 且接 `reset` | client |
| `not-found.tsx` | 404 / `notFound()` 觸發 | server |
| `route.ts` | API handler（附錄 C） | server-only |

每個列表/詳情頁**至少**要有對應的 `loading.tsx` 與 `error.tsx`，避免整頁白屏。

### B.1.3 Metadata

- 靜態頁用 `export const metadata: Metadata = {...}`。
- 動態頁（如 `catalog/[id]`）用 `export async function generateMetadata({ params })`，標題帶入 `Product` 名稱。
- root layout 設 `metadata.title.template`（如 `%s · JBG OS`）。

---

## B.2 Server vs Client Component 準則

> 預設 Server Component。只有下列**明確需要**時才加 `'use client'`。

| 需要 client 的訊號 | 例子 |
|---|---|
| 用到瀏覽器狀態/事件 | `useState`, `onClick`, `onChange`, 表單互動 |
| 用到瀏覽器 API | `localStorage`, `window`, `IntersectionObserver` |
| 用到 client library | TanStack Query hooks、Zustand store、shadcn 互動元件 |
| 需要 effect | `useEffect`, 訂閱 realtime |

準則：
- **把 `'use client'` 推到葉子**：頁面（`page.tsx`）維持 server，只在互動小元件加 client。
- Server Component 可直接 `await` 查 Supabase（見 B.3），把資料當 props 傳給 client 元件。
- 不要在 client 元件 import server-only 模組（`packages/db` 的 service-role client、`packages/connectors`）。
- 敏感金鑰只在 server 端；client 只用 `NEXT_PUBLIC_*`（B.6）。

### 對照：good / bad

| ✅ good | ❌ bad |
|---|---|
| `page.tsx`（server）查資料 → 傳給 `<ProductTable/>`（client）畫互動 | 整個 `page.tsx` 加 `'use client'` 再用 `useEffect` fetch |
| client 元件透過 `/api/...` 或 server action 改資料 | client 元件 import service-role Supabase client |
| 葉子 `<PriceEditButton/>` 是 client | 把整個 catalog 頁樹標成 client |

---

## B.3 資料抓取分層決策表 (Data Fetching)

三種取數方式，依情境選一：

| 情境 | 用哪個 | 位置 | 為什麼 |
|---|---|---|---|
| 初次渲染就要的資料、SEO 需要、唯讀 | **Server Component 直接查 Supabase** | `page.tsx` / `layout.tsx` `await` | 零 client JS、最快 TTFB、RLS 保護 |
| 被外部/其他 client 呼叫、需穩定契約、動作型 | **Route Handler**（`app/api`） | `app/api/<context>/<resource>/route.ts` | 對外 API 契約（附錄 C）、webhook |
| 登入後互動、需快取/重取/樂觀更新、輪詢 | **client + TanStack Query** | client 元件內 `useQuery`/`useMutation` | 互動狀態、背景 refetch、快取失效 |

決策順序：
1. 這份資料**首屏就要**且**唯讀**？ → Server Component 直查。
2. 需要**被別人（webhook / 其他頁 / 外部）**呼叫？ → Route Handler。
3. 只是**登入後某元件的互動資料**（會重取、樂觀更新）？ → TanStack Query 打 Route Handler。

> Server Component 直查時用 `packages/db` 的 **anon + RLS** client（帶使用者 session）；service-role client 只在 Route Handler / Edge Function 用，且先過 `PolicyEngine`（§0.9）。

---

## B.4 表單、Mutation、Revalidation 慣例

- **變更資料**優先用 **Server Actions**（`'use server'`）或打 Route Handler；client 端一律走 TanStack Query `useMutation` 包裝，取得 loading/error/樂觀更新。
- 寫入成功後做 **revalidation**：
  - Server Action 內 `revalidatePath('/catalog')` 或 `revalidateTag('products')`。
  - client 端 `queryClient.invalidateQueries({ queryKey: ['products'] })`。
- 表單驗證：**同一份 zod schema** 前後端共用（放 `packages/domain` 對應 context），前端即時驗證、後端再驗一次（trust boundary）。
- 所有 mutation 回傳統一 `{ data, error, meta }`（附錄 C），client 依 `error.code` 顯示訊息。
- 具副作用/不可逆的動作（發佈、改價超門檻）在 handler 內**先檢查 Permission / 觸發 HumanReview**（§0.9），不可只靠前端擋。

---

## B.5 目錄樹範例（features 導向）

`app/(app)/` 內每個畫面以 **feature 資料夾**組織；共用元件抽到 `components/`，feature 私有元件放該 feature 的 `_components/`（底線前綴 = 非路由）。

```
app/(app)/
├── layout.tsx                    # app shell（側欄、session guard）
├── catalog/
│   ├── page.tsx                  # server：查 products 列表
│   ├── loading.tsx
│   ├── error.tsx
│   ├── _components/              # 此 feature 私有元件（不建路由）
│   │   ├── ProductTable.tsx      # client：互動表格
│   │   ├── ProductFilters.tsx    # client：TanStack Query 過濾
│   │   └── PhotoGrid.tsx
│   ├── _hooks/
│   │   └── use-products.ts       # useQuery(['products', filters])
│   └── [id]/
│       ├── page.tsx              # server：查單一 Product + relations
│       └── _components/
│           └── PriceEditor.tsx   # client：useMutation 改價 + revalidate
├── loops/
│   ├── page.tsx                  # Loop 列表
│   └── [id]/page.tsx             # LoopExecution 時間軸/trace（§0.11 狀態）
├── reviews/
│   └── page.tsx                  # HumanReview 佇列（approve/reject/edit）
└── memory/
    └── page.tsx

components/                       # 跨 feature 共用（放 app 外層或 packages/ui）
└── ui/                           # shadcn/ui 產出的原子元件
```

規則：
- **feature 資料夾對應 §0.5 context**（catalog/loops/reviews/memory…）。
- 只被單一 feature 用的元件放 `_components/`；被多 feature 用才升到共用 `components/`。
- 資料 hook（TanStack Query）放 feature 的 `_hooks/`，query key 用陣列且第一段 = 資源名（`['products', ...]`）以利 invalidate。

---

## B.6 環境變數與 env.ts 驗證 (zod)

### 命名規範

| 前綴 | 可見範圍 | 例子 |
|---|---|---|
| `NEXT_PUBLIC_*` | client + server（會 bundle 進瀏覽器，**不可放密鑰**） | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| 無前綴 | **server-only**（密鑰） | `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `FB_APP_SECRET` |

- 全大寫 `SCREAMING_SNAKE`，以「服務名_用途」構成（`SUPABASE_URL`、`LINE_CHANNEL_TOKEN`）。
- 模型 id **不放** env；走 `MODELS.*` 常數（§0.3、`packages/harness/src/models.ts`）。

### `app/env.ts`（開機即驗，fail fast）

```ts
import { z } from "zod";

const server = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().min(1),
  FB_APP_SECRET: z.string().min(1),
  LINE_CHANNEL_TOKEN: z.string().min(1),
});

const client = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

// server 端才讀 server 區塊；client 只讀 NEXT_PUBLIC_*
const isServer = typeof window === "undefined";
export const env = {
  ...client.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  }),
  ...(isServer
    ? server.parse({
        SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
        FB_APP_SECRET: process.env.FB_APP_SECRET,
        LINE_CHANNEL_TOKEN: process.env.LINE_CHANNEL_TOKEN,
      })
    : ({} as Record<string, never>)),
};
```

規則：
- **只透過 `env`** 取用環境變數，禁止在其他檔案直接 `process.env.*`（可用 ESLint 規則 `no-process-env` 強制）。
- `.env.example` 列出所有 key（不含值）並隨 PR 更新。
- zod 驗證失敗要在 build/boot 期就丟錯，不要拖到 runtime。

---

## B.7 命名對照：good / bad

| 情境 | ✅ good | ❌ bad |
|---|---|---|
| route group | `app/(app)/catalog/page.tsx` | `app/dashboard/catalog/page.tsx`（未用 group 分登入態） |
| API 位置 | `app/api/catalog/products/route.ts` | `app/catalog/products/api.ts` |
| feature 私有元件 | `catalog/_components/ProductTable.tsx` | `components/ProductTable.tsx`（只有一處用卻升為共用） |
| client 邊界 | 葉子 `PriceEditor.tsx` 標 `'use client'` | `catalog/page.tsx` 標 `'use client'` |
| public env | `NEXT_PUBLIC_SUPABASE_URL` | `SUPABASE_URL` 卻在 client 讀 |
| 密鑰 | server-only `ANTHROPIC_API_KEY` | `NEXT_PUBLIC_ANTHROPIC_API_KEY`（洩漏！） |
| query key | `['products', filters]` | `'products-' + JSON.stringify(filters)` |

---

## B.8 檢查清單 (Checklist)

- [ ] 頁面預設 Server Component；`'use client'` 只加在**互動葉子**，未污染整頁。
- [ ] 每個列表/詳情頁都有 `loading.tsx` 與 `error.tsx`（`error.tsx` 為 client 並接 `reset`）。
- [ ] 資料抓取依 **B.3 決策表**選對層（首屏唯讀→Server 直查；對外契約→Route Handler；互動→TanStack Query）。
- [ ] mutation 走 Server Action / Route Handler，成功後有 `revalidatePath`/`invalidateQueries`。
- [ ] 前後端共用**同一份 zod schema**（放 `packages/domain`），後端仍再驗一次。
- [ ] 具副作用/不可逆動作在 handler 內先過 Permission / HumanReview（§0.9），非只靠前端。
- [ ] 環境變數只透過 `app/env.ts` 取用；密鑰無 `NEXT_PUBLIC_` 前綴；`.env.example` 同步。
- [ ] 模型 id 走 `MODELS.*`，未寫進 env 或硬編碼（§0.3）。
- [ ] API 路徑符合附錄 C；feature 資料夾符合 §0.5 context 名。
