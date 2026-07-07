# JBG OS — Architecture Bible v1.0

> **JBG OS = AI Business Operating System.**
> 一套可重複套用的 AI 商品生命週期作業系統。用 Loop Engineering 把「一個人腦中的生意流程」外化成可被 AI Agent 執行、可被人類審核、可被記憶累積、可被觀測的系統。
>
> **第一個實作案例：Second-Hand AI Platform (SHAP)** — 把二手/代購商品從一張 Google Drive 照片，變成 FB 上成交、售後、並沉澱成記憶。

---

## 這份文件是什麼

這是 JBG OS 的**第一份正式規格文件（Architecture Bible）**。目的：讓 Claude Code 可以**直接照著開發**，而不需要一直回頭確認需求。

- 這不是一份會過時的 wiki，是**開發合約**。
- 從 `docs/00-canonical-model.md` 開始讀——那是全書的 Single Source of Truth。
- 每一章結尾都有 **Deliverables + Acceptance Criteria**，就是每個開發階段的 done 定義。

## 怎麼讀

| 你是誰 | 先讀 |
|---|---|
| 想懂「為什麼做」 | `docs/01`（Vision）、`docs/02`（Business Analysis） |
| 想懂「架構長怎樣」 | `docs/00`（合約）→ `docs/03`（Loop Eng）→ `docs/04`（System） |
| **Claude Code 要開工** | `docs/00` → `docs/12`（Development Guide）→ 附錄 A/B → `docs/06`（Schema） |
| 想懂 AI 怎麼跑 | `docs/07`（Agents）→ `docs/08`（Workflow） |
| 想懂前後端 | `docs/09`（Frontend）、`docs/10`（Backend） |

## 目錄

### 正文
1. [Vision & Product Philosophy](docs/01-vision-product-philosophy.md)
2. [Business Analysis](docs/02-business-analysis.md)
3. [Loop Engineering Architecture](docs/03-loop-engineering-architecture.md)
4. [System Architecture](docs/04-system-architecture.md)
5. [Domain Design (DDD) + State Machine](docs/05-domain-design-ddd.md)
6. [Database Schema (Supabase)](docs/06-database-schema.md)
7. [AI Agent Architecture + Human Review + Permission](docs/07-ai-agent-architecture.md)
8. [Workflow / Loops](docs/08-workflow.md)
9. [Frontend (UI Flow)](docs/09-frontend.md)
10. [Backend (API / Services / Workers)](docs/10-backend.md)
11. [Roadmap (MVP → Beta → Production → Enterprise)](docs/11-roadmap.md)
12. [Claude Code Development Guide](docs/12-claude-code-development-guide.md)

### 附錄
- [A · Folder Structure](docs/appendix/A-folder-structure.md)
- [B · Next.js Structure](docs/appendix/B-nextjs-structure.md)
- [C · API Naming Convention](docs/appendix/C-api-naming-convention.md)
- [D · Database Naming Convention](docs/appendix/D-database-naming-convention.md)
- [E · Skill Design Guide](docs/appendix/E-skill-design-guide.md)
- [F · Connector Design Guide](docs/appendix/F-connector-design-guide.md)
- [G · Loop Template](docs/appendix/G-loop-template.md)
- [H · Agent Template](docs/appendix/H-agent-template.md)
- [I · PR Review Template](docs/appendix/I-pr-review-template.md)
- [J · Git Flow](docs/appendix/J-git-flow.md)
- [K · Human Review Checklist](docs/appendix/K-human-review-checklist.md)

## 技術棧（摘要，權威版見 `docs/00` §0.3）

Next.js (App Router) + TypeScript + Tailwind/shadcn · Supabase (Postgres + Auth + Storage + pgvector + Edge Functions) · Anthropic Claude (reasoning / vision) · Vercel · Connectors: Google Drive / Facebook / LINE。

## 部署

見 [DEPLOY.md](DEPLOY.md)：Render 一鍵藍圖（`render.yaml` 就緒）+ 接雲端 Supabase / Anthropic 的步驟。已驗證無 env 下可 build/start 並優雅回退靜態。

## 狀態

- [x] Architecture Bible v1.0（本文件集）
- [x] MVP 核心：Loop/Agent/Permission runtime、7 agents、product-lifecycle 端到端（落真 Supabase）
- [x] UI：Dashboard / Human Review / Loops trace（互動式，可觸發 + 核准 resume）
- [ ] 接真 connector（Drive/FB/LINE）與真 Anthropic（需憑證）— 見 [DEPLOY.md](DEPLOY.md)

---
版本 v1.0 · 2026-07-07
