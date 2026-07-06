import { z } from "zod";

/** Marketing / Listing draft 契約 —— docs/07 §7.3.4 (marketing agent)。 */

export const marketingInputSchema = z.object({
  productId: z.string(),
  productCard: z.record(z.string(), z.unknown()),
  price: z.object({ amount: z.number().int(), currency: z.string().length(3) }),
  brandVoice: z.string().optional(),
});
export type MarketingInput = z.infer<typeof marketingInputSchema>;

export const marketingDraftSchema = z.object({
  productId: z.string(),
  title: z.string().min(1),
  body: z.string().min(1),
  sellingPoints: z.array(z.string()),
  hashtags: z.array(z.string()),
  complianceFlags: z.array(z.string()),
  requiresHumanReview: z.boolean(),
});
export type MarketingDraft = z.infer<typeof marketingDraftSchema>;
