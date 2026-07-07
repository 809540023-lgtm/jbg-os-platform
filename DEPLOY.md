# DEPLOY — Render 部署指南

> 已在本機模擬 Render 環境驗證：無任何 env 下 `next build` 綠、`next start` 回傳 200、
> 頁面優雅回退「靜態（未接 DB）」、無 server error。**repo 是 deploy-ready 的。**
>
> 我（Claude）無法登入你的 Render 帳號按部署，以下步驟需你在 Render 後台操作一次。

---

## 階段 A · 先上線（靜態，2 分鐘）

1. 到 https://dashboard.render.com → **New → Blueprint**
2. 連 GitHub，選 **`jbg-os-platform`** repo
3. Render 讀取根目錄的 [`render.yaml`](render.yaml) → 自動建一個 `jbg-os` web service
   （free 方案、Singapore、Node 22、`pnpm install && pnpm build` → `pnpm start`）
4. 按 **Apply** → 等它 build 完 → 拿到網址（如 `https://jbg-os.onrender.com`）

此時打開網址：Dashboard 顯示 canonical 靜態內容（agents / lifecycle / product_status），
標示「○ 靜態（未接 DB）」。**這是正常的** —— Render 連不到你本機的 Supabase。

> free 方案閒置會休眠，第一次開有 ~50 秒冷啟動。

---

## 階段 B · 接雲端 Supabase 讓資料變真（要真資料才需要）

本機的 Supabase（`npx supabase`）只在你電腦上，Render 連不到。要在線上看到即時資料，
需建一個**雲端 Supabase 專案**並把我們的 migration 推上去：

1. https://supabase.com → 建新專案（記下 project ref、DB password）
2. 本機把 migration 推到雲端：
   ```bash
   cd ~/Documents/JBG_OS
   npx supabase link --project-ref <你的-project-ref>
   npx supabase db push          # 套用 supabase/migrations/*（含 grants）
   # seed（雲端不自動跑 seed）：
   npx supabase db push --include-seed   # 或用 psql 手動跑 supabase/seed/*.sql
   ```
3. 到 Supabase 專案 → Settings → API，複製 **Project URL** 與 **service_role key**
4. 回 Render → 你的 service → **Environment** 加：
   | Key | Value |
   |---|---|
   | `SUPABASE_URL` | `https://<ref>.supabase.co` |
   | `SUPABASE_SERVICE_ROLE_KEY` | （service_role key） |
   | `NEXT_PUBLIC_SUPABASE_URL` | 同 Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | （anon key） |
5. Render 自動 redeploy → Dashboard 變「● Supabase 已連線」，`/loops` 出現觸發按鈕。

> ⚠️ `service_role key` 是後端密鑰，只放 Render 後台，**絕不進 repo**。

---

## 階段 C · 接真 Anthropic（要 agent 跑真模型才需要）

`AnthropicModelClient` 已實作（`@jbg/harness`，實 `ModelClient` 介面、支援 image content block、
不送 temperature 以相容 Sonnet 5 / Opus 4.8）。`app/lib/lifecycle-runtime.ts` 會在偵測到
`ANTHROPIC_API_KEY` 時**自動**改用真 Claude，否則用 fake（demo 不需 key）。**只要設 key 即可**：

1. 本機：在 `.env.local` 加 `ANTHROPIC_API_KEY=sk-ant-...`
2. Render：service → Environment 加 `ANTHROPIC_API_KEY`，redeploy
3. 之後 `/loops` 的「觸發」按鈕就跑真 7 個 agent（vision 送 image block、cost 記進 `agent_runs`）

> 模型 id 走 `packages/harness/src/models.ts` 的 `MODELS.*`（預設 Sonnet 5 / Haiku 4.5）；
> 定價表在 `anthropic-client.ts` 的 `MODEL_PRICING`（上線前用 `claude-api` skill 覆核當前定價）。
> Vision 要真的「看到」照片，需要真實 http(s) 圖片 URL（來自 Google Drive connector，Todo 4）；
> 目前 demo 用假路徑，vision 會退回純文字描述。

---

## render.yaml 重點

- Node 22（`NODE_VERSION`）：`sharp` 在 Node 22 有預編譯 binary，避免 build from source
- `pnpm` 由 `packageManager` 欄位（pnpm@11.10.0）+ `corepack enable` 提供
- `healthCheckPath: /`：無 DB 也回 200，健康檢查會過
- 正式 hosting 依 Bible §0.3 的建議其實是 **Vercel**（Next.js 首選）；render.yaml 提供 Render 路徑
