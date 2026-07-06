import type { ProductStatus } from "@jbg/db";
import type { ProductId, ProductPhotoId } from "../shared/id";
import type { Id } from "../shared/id";

export type BrandId = Id<"Brand">;
export type CategoryId = Id<"Category">;

export interface AuditFields {
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

export type ProductCondition =
  | "new"
  | "like_new"
  | "excellent"
  | "good"
  | "fair"
  | "poor";

export type PhotoStatus =
  | "ingested"
  | "perceiving"
  | "perceived"
  | "attached"
  | "rejected";

/** 從 OCR/Vision 採納的一條結構化屬性（可追溯來源與信心）。 */
export interface AdoptedAttribute {
  key: string;
  value: string;
  source: "ocr" | "vision";
  confidence: number;
}

export interface Brand extends AuditFields {
  readonly id: BrandId;
  readonly slug: string;
  displayName: string;
  aliases: string[];
  tier: "luxury" | "premium" | "mass" | "unknown";
  isActive: boolean;
}

export interface Category extends AuditFields {
  readonly id: CategoryId;
  readonly slug: string;
  displayName: string;
  parentId: CategoryId | null;
  /** 驅動 gap-check 的必填屬性（如 shoes 需 size/material）。 */
  requiredAttributes: string[];
}

export interface ProductPhoto extends AuditFields {
  readonly id: ProductPhotoId;
  productId: ProductId | null;
  status: PhotoStatus;
  readonly driveFileId: string;
  readonly driveFolderId: string;
  storagePath: string;
  readonly contentHash: string;
  width: number | null;
  height: number | null;
  ocrResultId: string | null;
  visionResultId: string | null;
  isPrimary: boolean;
}

export interface Product extends AuditFields {
  readonly id: ProductId;
  readonly sku: string;
  status: ProductStatus;
  title: string | null;
  description: string | null;
  brandId: BrandId | null;
  categoryId: CategoryId | null;
  condition: ProductCondition | null;
  attributes: AdoptedAttribute[];
  primaryPhotoId: ProductPhotoId | null;
  /** gap-check 結果：缺哪些必填欄位。empty ⇒ 資料齊。 */
  missingFields: string[];
}
