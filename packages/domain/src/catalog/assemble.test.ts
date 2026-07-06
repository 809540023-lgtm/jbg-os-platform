import { describe, expect, it } from "vitest";
import type { OCRResult, VisionResult } from "../perception/schema";
import { asId } from "../shared/id";
import { assembleFrom, gapCheck, needsGapTask } from "./assemble";
import type { Brand, Category, ProductPhoto } from "./types";

const now = "2026-07-07T00:00:00.000Z";

const brands: Brand[] = [
  {
    id: asId("b-chanel"),
    slug: "chanel",
    displayName: "Chanel",
    aliases: ["CHANEL", "香奈兒"],
    tier: "luxury",
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
];

const categories: Category[] = [
  {
    id: asId("c-handbag"),
    slug: "handbag",
    displayName: "handbag",
    parentId: null,
    requiredAttributes: ["material"],
    createdAt: now,
    updatedAt: now,
  },
];

const photo: ProductPhoto = {
  id: asId("ph-1"),
  productId: null,
  status: "perceived",
  driveFileId: "drive-1",
  driveFolderId: "folder-1",
  storagePath: "photos/1.jpg",
  contentHash: "hash1",
  width: 800,
  height: 600,
  ocrResultId: null,
  visionResultId: null,
  isPrimary: true,
  createdAt: now,
  updatedAt: now,
};

const ocr: OCRResult = {
  rawText: "caviar",
  fields: {
    model: { value: "Classic Flap", confidence: 0.8 },
    serial: { value: "12345678", confidence: 0.7 },
    size: { value: null, confidence: 0 },
    material: { value: "caviar", confidence: 0.9 },
  },
  language: "en",
  lowConfidence: false,
};

const vision: VisionResult = {
  brand: { value: "Chanel", confidence: 0.9, isGuess: false },
  category: { value: "handbag", confidence: 0.85 },
  colors: [{ name: "black", confidence: 0.9 }],
  attachments: ["dust bag"],
  defects: [{ type: "scratch", area: "corner", severity: "minor", confidence: 0.6 }],
  overallConfidence: 0.85,
  notes: null,
};

describe("assembleFrom (docs/07 assemble)", () => {
  it("合併 OCR+Vision → draft 商品卡：品牌對映、成色推估、屬性採納", () => {
    const { product } = assembleFrom({ photo, ocr, vision, brands, categories, now });
    expect(product.status).toBe("assembled");
    expect(product.brandId).toBe("b-chanel");
    expect(product.categoryId).toBe("c-handbag");
    expect(product.condition).toBe("like_new"); // minor defect
    // material 來自 ocr、color/attachment 來自 vision
    expect(product.attributes.find((a) => a.key === "material")?.value).toBe("caviar");
    expect(product.attributes.some((a) => a.key === "color")).toBe(true);
    expect(product.primaryPhotoId).toBe("ph-1");
  });

  it("品牌用猜的（isGuess）→ 不採納 brandId", () => {
    const guessVision: VisionResult = {
      ...vision,
      brand: { value: "Chanel", confidence: 0.9, isGuess: true },
    };
    const { product } = assembleFrom({ photo, ocr, vision: guessVision, brands, categories, now });
    expect(product.brandId).toBeNull();
    expect(product.missingFields).toContain("brandId");
  });
});

describe("gapCheck (docs/07 gap-check, INV-P2)", () => {
  it("title 一律缺（尚未 compose）；材質具備則不缺 attr:material", () => {
    const { product } = assembleFrom({ photo, ocr, vision, brands, categories, now });
    const missing = gapCheck(product, categories);
    expect(missing).toContain("title");
    expect(missing).not.toContain("attr:material");
    expect(needsGapTask(product)).toBe(true);
  });

  it("缺必填屬性 → 標 attr:<name>", () => {
    const ocrNoMaterial: OCRResult = {
      ...ocr,
      fields: { ...ocr.fields, material: { value: null, confidence: 0 } },
    };
    const { product } = assembleFrom({
      photo,
      ocr: ocrNoMaterial,
      vision,
      brands,
      categories,
      now,
    });
    expect(gapCheck(product, categories)).toContain("attr:material");
  });
});
