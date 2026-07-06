import type { LoopDef } from "../types";

/**
 * SHAP 主 Workflow 的核心 Loop —— docs/00 §0.7 / docs/08 `product-lifecycle`。
 * 純定義（不 import 任何 IO）。步驟的實際執行由上層（@jbg/skills 的 executor）注入。
 *
 * 階段（§0.7）：perceive → assemble → gap-check → price → compose → review
 *              → human-review → publish → remember
 * （MVP 打通到 publish + 最小 remember；engage/close/aftersale 留 Beta。）
 */
export const productLifecycleLoop: LoopDef = {
  id: "product-lifecycle",
  version: 1,
  trigger: { kind: "manual" },
  // 冪等：同一張 Drive 照片不重複建立生命週期。
  idempotencyKey: (input) => (input as { driveFileId?: string }).driveFileId ?? "",
  steps: [
    { id: "perceive", type: "skill", ref: "perceive" },
    { id: "assemble", type: "skill", ref: "assemble" },
    { id: "price", type: "agent", ref: "price" },
    { id: "compose", type: "agent", ref: "marketing" },
    { id: "review", type: "agent", ref: "reviewer" },
    // 高風險關卡：發佈前一律人審（MVP 強制全審，docs/12 Todo13）。
    { id: "human-review", type: "human" },
    { id: "publish", type: "connector", ref: "facebook" },
    // 記憶萃取失敗不應讓整條生命週期失敗。
    { id: "remember", type: "agent", ref: "memory", failLoopOnError: false },
  ],
};
