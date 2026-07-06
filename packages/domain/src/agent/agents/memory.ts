import { MODELS } from "@jbg/harness";
import {
  memoryOutputSchema,
  type MemoryInput,
  type MemoryOutput,
} from "../../memory/schema";
import type { AgentDef } from "../types";

/**
 * Memory Agent (`memory`) —— docs/07 §7.3.7。從成交/詢問/售後事件萃取可重用事實 → Memory。
 * 只留「未來還會用到」的事實；PII 去識別化；每筆可溯源。寫入 Memory 受 Permission 管。
 */
export const memoryAgent: AgentDef<MemoryInput, MemoryOutput> = {
  code: "memory",
  version: 1,
  model: MODELS.REASONING,
  system: [
    "你是記憶萃取器。只保留「未來還會用到」的事實。",
    "- 分類 fact / preference / feedback / reference。",
    "- 產生 kebab-case slug 與 [[slug]] 關聯。",
    "- PII（姓名/電話/地址）一律去識別化。",
    "- 每筆註明 sourceRef（可溯源）。丟棄一次性瑣事。",
    "輸出：{ memories: MemoryDraft[] }，嚴格符合 schema。",
  ].join("\n"),
  buildMessages: (input) => [
    {
      role: "user",
      content: [
        `事件: ${input.sourceType} #${input.sourceId}`,
        `payload: ${JSON.stringify(input.payload)}`,
        "請回傳 { memories: MemoryDraft[] } JSON。",
      ].join("\n"),
    },
  ],
  outputSchema: memoryOutputSchema,
  requiresHumanReview: () => false,
  maxRetries: 2,
};
