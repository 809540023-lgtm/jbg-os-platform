import type { OCRResult, VisionResult } from "../perception/schema";
import type { ProductId } from "../shared/id";
import { newId } from "../shared/id";
import type {
  AdoptedAttribute,
  Brand,
  BrandId,
  Category,
  CategoryId,
  Product,
  ProductCondition,
  ProductPhoto,
} from "./types";

/**
 * assemble —— docs/07 `assemble` + docs/05 §5.3.1 ProductAggregate.assembleFrom。
 * 合併 OCR + Vision → 一張 draft Product 商品卡（status='assembled'）。
 * 衝突欄位取捨：品牌/品類以 Vision（且需 !isGuess、達信心門檻）為準；
 * 屬性以 OCR 逐字欄位 + Vision 顏色/附件 為來源；缺欄位留待 gap-check。
 */

/** 品牌/品類採納的信心門檻。 */
export const ADOPT_CONFIDENCE_FLOOR = 0.6;

/** 硬性必填欄位（docs/05 INV-P2）。 */
export const HARD_REQUIRED_FIELDS = [
  "title",
  "brandId",
  "categoryId",
  "condition",
] as const;

export interface AssembleInput {
  photo: ProductPhoto;
  ocr?: OCRResult;
  vision?: VisionResult;
  brands: Brand[];
  categories: Category[];
  now: string;
  newProductId?: () => ProductId;
}

function matchBrand(name: string | null, brands: Brand[]): BrandId | null {
  if (!name) return null;
  const norm = name.trim().toLowerCase();
  const found = brands.find(
    (b) =>
      b.displayName.toLowerCase() === norm ||
      b.slug === norm ||
      b.aliases.some((a) => a.toLowerCase() === norm),
  );
  return found ? found.id : null;
}

function matchCategory(name: string | null, categories: Category[]): CategoryId | null {
  if (!name) return null;
  const norm = name.trim().toLowerCase();
  const found = categories.find(
    (c) => c.displayName.toLowerCase() === norm || c.slug === norm,
  );
  return found ? found.id : null;
}

/** 依 vision.defects 的最嚴重程度推估成色。無瑕疵 → excellent。 */
function deriveCondition(vision?: VisionResult): ProductCondition | null {
  if (!vision) return null;
  const severities = vision.defects.map((d) => d.severity);
  if (severities.includes("major")) return "fair";
  if (severities.includes("moderate")) return "good";
  if (severities.includes("minor")) return "like_new";
  return "excellent";
}

function collectAttributes(ocr?: OCRResult, vision?: VisionResult): AdoptedAttribute[] {
  const attrs: AdoptedAttribute[] = [];
  if (ocr) {
    for (const [key, field] of Object.entries(ocr.fields)) {
      if (field.value !== null) {
        attrs.push({ key, value: field.value, source: "ocr", confidence: field.confidence });
      }
    }
  }
  if (vision) {
    for (const c of vision.colors) {
      attrs.push({ key: "color", value: c.name, source: "vision", confidence: c.confidence });
    }
    for (const a of vision.attachments) {
      attrs.push({ key: "attachment", value: a, source: "vision", confidence: 1 });
    }
  }
  return attrs;
}

export interface AssembleOutput {
  product: Product;
}

export function assembleFrom(input: AssembleInput): AssembleOutput {
  const { photo, ocr, vision, brands, categories, now } = input;
  const id = (input.newProductId ?? (() => newId<"Product">()))();

  const brandId =
    vision && !vision.brand.isGuess && vision.brand.confidence >= ADOPT_CONFIDENCE_FLOOR
      ? matchBrand(vision.brand.value, brands)
      : null;
  const categoryId =
    vision && vision.category.confidence >= ADOPT_CONFIDENCE_FLOOR
      ? matchCategory(vision.category.value, categories)
      : null;

  const product: Product = {
    id,
    status: "assembled",
    title: null,
    description: null,
    brandId,
    categoryId,
    condition: deriveCondition(vision),
    attributes: collectAttributes(ocr, vision),
    primaryPhotoId: photo.id,
    missingFields: [],
    createdAt: now,
    updatedAt: now,
  };

  product.missingFields = gapCheck(product, categories);
  return { product };
}

/**
 * gapCheck —— docs/07 `gap-check` + docs/05 INV-P2。
 * 回傳缺少的必填欄位（硬性欄位 + 該品類 requiredAttributes）。empty ⇒ 資料齊。
 */
export function gapCheck(product: Product, categories: Category[]): string[] {
  const missing: string[] = [];

  if (!product.title) missing.push("title");
  if (!product.brandId) missing.push("brandId");
  if (!product.categoryId) missing.push("categoryId");
  if (!product.condition) missing.push("condition");

  const category = product.categoryId
    ? categories.find((c) => c.id === product.categoryId)
    : undefined;
  if (category) {
    const have = new Set(product.attributes.map((a) => a.key));
    for (const req of category.requiredAttributes) {
      if (!have.has(req)) missing.push(`attr:${req}`);
    }
  }
  return missing;
}

/** 是否需要開補件 Task（gap-check 有缺 ⇒ 需要）。 */
export function needsGapTask(product: Product): boolean {
  return product.missingFields.length > 0;
}
