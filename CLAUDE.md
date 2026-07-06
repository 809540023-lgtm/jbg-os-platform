# CLAUDE.md — JBG OS 開發守則（給 Claude Code）

> 這是 JBG OS 的 repo 級指令。每次在本專案工作**開頭必讀**。完整開發手冊見 `docs/12-claude-code-development-guide.md`。

## 這是什麼
JBG OS = AI Business Operating System。第一個實作 vertical 是 **SHAP（Second-Hand AI Platform）**：把二手/代購商品從一張 Google Drive 照片，變成 FB 上架、成交、售後、並沉澱成記憶。完整規格是 `docs/` 底下的 **Architecture Bible v1.0**。

## 黃金守則（不可違反）
1. **先讀合約**：動工前先讀 `docs/00-canonical-model.md`（SSOT）。任何命名、Entity、Agent 代號、Loop 階段、狀態機 enum、技術棧都以它為準。與它衝突 → 改你的程式碼，不是改合約。
2. **不得改名**：Entity 名（§0.5）、7 個 Agent 代號（§0.6：vision/ocr/price/marketing/reviewer/publisher/memory）、Loop 主流程階段（§0.7）一律照抄。
3. **外部副作用一律走 Connector**（§0.8）：Agent / Loop / Skill 禁止直接 `fetch` 外部 API。唯一對外出口是 `packages/connectors/`。
4. **不可逆動作要過 Permission / Human Review**（§0.9）：發佈 FB、改價超門檻、回覆客戶、刪除、寫入 Memory —— 預設需 PolicyEngine 檢查或人審。
5. **不硬寫模型 id / 金額**：模型一律用 `packages/harness/src/models.ts` 的 `MODELS.REASONING / VISION / FAST` 常數；金額用整數 `_amount` + `char(3)` `_currency`（禁 float 存錢）。
6. **命名規範**：DB = snake_case 複數、FK `<singular>_id`（附錄 D）；API = `/api/<context>/<resource>`（附錄 C）；檔名 kebab-case、React 元件 PascalCase。
7. **一個 Todo = 一分支 = 一 PR**（附錄 J）：每個 PR 要能對應某章的 Acceptance Criteria。
8. **不確定就停下標 TODO**，不要亂猜；需要決策時在 PR 描述提出。

## 依賴方向（不可逆，見附錄 A §A.1.1）
```
app → eval → harness → prompts
app → skills → connectors → domain → db
```
`db` 最底層不 import 任何 package；`connectors` 是唯一可對外 `fetch` 的層。

## 開發節奏
- 路線圖：`docs/11-roadmap.md`（MVP → Beta → Production → Enterprise）。
- 每日作業手冊 + MVP 的 17 個有序 Todo：`docs/12-claude-code-development-guide.md`。
- 每個 Todo 循環：**Todo → Acceptance → Eval → Review → Loop**。
- PR 前自審：附錄 I（PR Review）；人審：附錄 K（Human Review Checklist）。

## 技術棧（權威版 `docs/00` §0.3）
Next.js (App Router) + TypeScript strict + Tailwind/shadcn · Supabase (Postgres + Auth + Storage + pgvector + Edge Functions + pg_cron + pgmq) · Anthropic Claude · Vercel · Connectors: Google Drive / Facebook / LINE。

## 常用指令（bootstrap 後才有）
```bash
pnpm install
pnpm dev            # 起 Next.js
pnpm db:types       # 從 Supabase 產 packages/db 型別
pnpm test           # 全測試
pnpm lint typecheck # CI 必過項
supabase start      # 本地 Supabase
supabase db reset   # 套用 migrations + seed
```

## 文件地圖
`docs/00`=合約 · `01`Vision · `02`Business · `03`Loop Eng · `04`System · `05`DDD · `06`Schema · `07`Agents · `08`Workflow · `09`Frontend · `10`Backend · `11`Roadmap · `12`開發指南 · `docs/appendix/A–K`=結構/命名/模板/流程。
