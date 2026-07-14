import type { SupabaseClient } from "./client";

/** 公開商品頁（SEO）用的讀取查詢。 */

export interface CatalogAttribute {
  key: string;
  value: string;
}

export interface CatalogProduct {
  id: string;
  title: string | null;
  description: string | null;
  condition: string | null;
  status: string;
  priceAmount: number | null;
  priceCurrency: string | null;
  attributes: CatalogAttribute[];
  imageUrl: string | null;
  updatedAt: string;
}

interface Row {
  id: string;
  title: string | null;
  description: string | null;
  condition: string | null;
  status: string;
  price_amount: number | null;
  price_currency: string | null;
  attributes: unknown;
  image_url: string | null;
  updated_at: string;
}

function toDomain(r: Row): CatalogProduct {
  const attrs = Array.isArray(r.attributes) ? (r.attributes as CatalogAttribute[]) : [];
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    condition: r.condition,
    status: r.status,
    priceAmount: r.price_amount,
    priceCurrency: r.price_currency,
    attributes: attrs.filter((a) => a && typeof a.key === "string"),
    imageUrl: r.image_url,
    updatedAt: r.updated_at,
  };
}

const COLS =
  "id, title, description, condition, status, price_amount, price_currency, attributes, image_url, updated_at";

/** 已上架（published）商品清單 —— 目錄頁與 sitemap 用。 */
export async function listPublishedProducts(
  db: SupabaseClient,
  limit = 200,
): Promise<CatalogProduct[]> {
  const { data, error } = await db
    .from("products")
    .select(COLS)
    .eq("status", "published")
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listPublishedProducts: ${error.message}`);
  return ((data ?? []) as Row[]).map(toDomain);
}

/** 單一商品（任何狀態）—— 商品頁用。 */
export async function getCatalogProduct(
  db: SupabaseClient,
  id: string,
): Promise<CatalogProduct | null> {
  const { data, error } = await db.from("products").select(COLS).eq("id", id).maybeSingle<Row>();
  if (error) throw new Error(`getCatalogProduct: ${error.message}`);
  return data ? toDomain(data) : null;
}

/** 全部商品（任何狀態）—— 後台管理清單用。 */
export async function listAllProducts(db: SupabaseClient, limit = 500): Promise<CatalogProduct[]> {
  const { data, error } = await db
    .from("products")
    .select(COLS)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listAllProducts: ${error.message}`);
  return ((data ?? []) as Row[]).map(toDomain);
}
