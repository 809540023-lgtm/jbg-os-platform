import { z } from "zod";
import { marketingDraftSchema } from "../channel/schema";
import { priceSuggestionSchema } from "../pricing/schema";

/** Reviewer 契約 —— docs/07 §7.3.5 (reviewer agent)。自動審關卡。 */

export const reviewInputSchema = z.object({
  productId: z.string(),
  card: z.record(z.string(), z.unknown()),
  marketing: marketingDraftSchema,
  price: priceSuggestionSchema,
});
export type ReviewInput = z.infer<typeof reviewInputSchema>;

export const reviewResultSchema = z.object({
  productId: z.string(),
  decision: z.enum(["pass", "reject", "escalate"]),
  checks: z.array(
    z.object({
      name: z.string(),
      status: z.enum(["pass", "fail"]),
      reason: z.string(),
    }),
  ),
  reworkStage: z.enum(["assemble", "compose", "price"]).optional(),
  escalateReason: z.string().optional(),
});
export type ReviewResult = z.infer<typeof reviewResultSchema>;
