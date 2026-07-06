import { z } from "zod";

/** Pricing 契約 —— docs/07 §7.3.3 (price agent)。金額整數（§0.10）。 */

export const priceInputSchema = z.object({
  productId: z.string(),
  productCard: z.object({
    brand: z.string().nullable(),
    category: z.string().nullable(),
    condition: z.string(),
    attachments: z.array(z.string()),
    defects: z.array(z.string()),
  }),
  comparableSales: z.array(
    z.object({
      amount: z.number().int(),
      currency: z.string().length(3),
      soldAt: z.string(),
      source: z.enum(["memory", "market"]),
    }),
  ),
  currency: z.string().length(3),
});
export type PriceInput = z.infer<typeof priceInputSchema>;

export const priceSuggestionSchema = z
  .object({
    productId: z.string(),
    suggestedAmount: z.number().int(),
    minAmount: z.number().int(),
    maxAmount: z.number().int(),
    currency: z.string().length(3),
    reasons: z.array(z.string()).min(2), // guardrail：至少 2 條理由
    confidence: z.number().min(0).max(1),
    requiresHumanReview: z.boolean(),
  })
  // guardrail：suggestedAmount 必落在 [minAmount, maxAmount]
  .refine((v) => v.minAmount <= v.suggestedAmount && v.suggestedAmount <= v.maxAmount, {
    message: "suggestedAmount 必須落在 [minAmount, maxAmount]",
    path: ["suggestedAmount"],
  });
export type PriceSuggestion = z.infer<typeof priceSuggestionSchema>;
