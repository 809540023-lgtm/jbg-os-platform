import { z } from "zod";

/**
 * Perception 契約 —— 對應 docs/07 §7.3.1 (vision) / §7.3.2 (ocr) 的 I/O schema。
 * zod schema 為 single source，TS 型別由 z.infer 導出，避免雙寫。
 */

const confidence = z.number().min(0).max(1);

// ── Vision（§7.3.1）────────────────────────────────────────
export const visionInputSchema = z.object({
  photoId: z.string(),
  imageUrl: z.string(),
  knownBrands: z.array(z.string()),
  knownCategories: z.array(z.string()),
});
export type VisionInput = z.infer<typeof visionInputSchema>;

export const visionResultSchema = z.object({
  brand: z.object({
    value: z.string().nullable(),
    confidence,
    isGuess: z.boolean(),
  }),
  category: z.object({ value: z.string().nullable(), confidence }),
  colors: z.array(z.object({ name: z.string(), confidence })),
  attachments: z.array(z.string()),
  defects: z.array(
    z.object({
      type: z.string(),
      area: z.string(),
      severity: z.enum(["minor", "moderate", "major"]),
      confidence,
    }),
  ),
  overallConfidence: confidence,
  notes: z.string().nullable(),
});
export type VisionResult = z.infer<typeof visionResultSchema>;

// ── OCR（§7.3.2）───────────────────────────────────────────
export const ocrInputSchema = z.object({
  photoId: z.string(),
  imageUrl: z.string(),
  hint: z.enum(["tag", "label", "serial"]).optional(),
});
export type OCRInput = z.infer<typeof ocrInputSchema>;

const ocrField = z.object({ value: z.string().nullable(), confidence });

export const ocrResultSchema = z.object({
  rawText: z.string(),
  fields: z.object({
    model: ocrField,
    serial: ocrField,
    size: ocrField,
    material: ocrField,
  }),
  language: z.string().nullable(),
  lowConfidence: z.boolean(),
});
export type OCRResult = z.infer<typeof ocrResultSchema>;
