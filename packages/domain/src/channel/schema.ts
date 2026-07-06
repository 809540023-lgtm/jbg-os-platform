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

/** Publisher 契約 —— docs/07 §7.3.6。只接受 approved、冪等、發佈前過 PolicyEngine。 */
export const publishInputSchema = z.object({
  listingId: z.string(),
  productId: z.string(),
  status: z.literal("approved"),
  content: z.object({
    title: z.string(),
    body: z.string(),
    hashtags: z.array(z.string()),
    mediaUrls: z.array(z.string()),
  }),
  idempotencyKey: z.string(), // = listingId + version
});
export type PublishInput = z.infer<typeof publishInputSchema>;

export const publishResultSchema = z.object({
  listingId: z.string(),
  published: z.boolean(),
  externalPostId: z.string().nullable(),
  publishedAt: z.string().nullable(),
  error: z.string().optional(),
  /** policy 判定需人審而暫停時為 true。 */
  needsHuman: z.boolean().optional(),
});
export type PublishResult = z.infer<typeof publishResultSchema>;
