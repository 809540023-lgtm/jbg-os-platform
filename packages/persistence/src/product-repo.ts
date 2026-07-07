import type {
  AdoptedAttribute,
  Product,
  ProductId,
  ProductRepo,
} from "@jbg/domain";
import type { ProductStatus } from "@jbg/db";
import type { SupabaseClient } from "./client";

interface ProductRow {
  id: string;
  status: ProductStatus;
  title: string | null;
  description: string | null;
  brand_id: string | null;
  category_id: string | null;
  condition: string | null;
  attributes: AdoptedAttribute[] | null;
  primary_photo_id: string | null;
  missing_fields: string[] | null;
  created_at: string;
  updated_at: string;
}

/** products repo（domain ProductRepo 的 Supabase 實作）。 */
export class SupabaseProductRepo implements ProductRepo {
  constructor(private readonly db: SupabaseClient) {}

  private toRow(p: Product) {
    return {
      id: p.id,
      status: p.status,
      title: p.title,
      description: p.description,
      brand_id: p.brandId,
      category_id: p.categoryId,
      condition: p.condition,
      attributes: p.attributes,
      primary_photo_id: p.primaryPhotoId,
      missing_fields: p.missingFields,
      created_at: p.createdAt,
      updated_at: p.updatedAt,
    };
  }

  async create(product: Product): Promise<void> {
    const { error } = await this.db.from("products").insert(this.toRow(product));
    if (error) throw new Error(`create product: ${error.message}`);
  }

  async update(product: Product): Promise<void> {
    const { id, ...rest } = this.toRow(product);
    const { error } = await this.db.from("products").update(rest).eq("id", id);
    if (error) throw new Error(`update product: ${error.message}`);
  }

  async get(id: ProductId): Promise<Product | null> {
    const { data, error } = await this.db
      .from("products")
      .select("*")
      .eq("id", id)
      .maybeSingle<ProductRow>();
    if (error) throw new Error(`get product: ${error.message}`);
    return data ? toProductDomain(data) : null;
  }

  async listByStatus(status: ProductStatus, limit = 50): Promise<Product[]> {
    const { data, error } = await this.db
      .from("products")
      .select("*")
      .eq("status", status)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(`listByStatus: ${error.message}`);
    return ((data ?? []) as ProductRow[]).map(toProductDomain);
  }
}

function toProductDomain(row: ProductRow): Product {
  return {
    id: row.id as ProductId,
    status: row.status,
    title: row.title,
    description: row.description,
    brandId: (row.brand_id ?? null) as Product["brandId"],
    categoryId: (row.category_id ?? null) as Product["categoryId"],
    condition: (row.condition ?? null) as Product["condition"],
    attributes: row.attributes ?? [],
    primaryPhotoId: (row.primary_photo_id ?? null) as Product["primaryPhotoId"],
    missingFields: row.missing_fields ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
