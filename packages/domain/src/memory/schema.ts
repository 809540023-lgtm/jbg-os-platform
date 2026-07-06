import { z } from "zod";

/** Memory 契約 —— docs/07 §7.3.7 (memory agent)。 */

export const memoryInputSchema = z.object({
  sourceType: z.enum(["order", "inquiry", "aftersale"]),
  sourceId: z.string(),
  payload: z.record(z.string(), z.unknown()),
});
export type MemoryInput = z.infer<typeof memoryInputSchema>;

export const memoryDraftSchema = z.object({
  slug: z.string(), // kebab-case
  kind: z.enum(["fact", "preference", "feedback", "reference"]),
  content: z.string(), // 去識別化
  links: z.array(z.string()), // [[slug]] → MemoryLink
  sourceRef: z.object({ type: z.string(), id: z.string() }),
  confidence: z.number().min(0).max(1),
});
export type MemoryDraft = z.infer<typeof memoryDraftSchema>;

/**
 * Agent 輸出用物件包裹（`{ memories: [...] }`）而非裸陣列：
 * harness 的 JSON 抽取以物件為單位，裸陣列會被截斷。語意等同 docs 的 MemoryDraft[]。
 */
export const memoryOutputSchema = z.object({
  memories: z.array(memoryDraftSchema),
});
export type MemoryOutput = z.infer<typeof memoryOutputSchema>;
