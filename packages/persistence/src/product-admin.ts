import type { CatalogAttribute } from "./catalog-read";
import type { SupabaseClient } from "./client";

/** 後台商品寫入 —— 手動上架/編輯（P1）。走 service_role。 */

export interface ProductWrite {
  title: string;
  description: string | null;
  condition: string;
  status: string;
  priceAmount: number | null;
  priceCurrency: string;
  attributes: CatalogAttribute[];
  imageUrl: string | null;
  imageUrls?: string[]; // 相簿；imageUrl 會自動設為第一張
  category?: string | null;
  region?: string | null;
  source?: string; // own | brokered
}

const BUCKET = "product-photos";

/** 上傳一張商品照片到 Storage，回傳公開 URL。 */
export async function uploadProductImage(
  db: SupabaseClient,
  file: { bytes: ArrayBuffer; contentType: string; ext: string },
  keyHint: string,
): Promise<string> {
  const path = `${keyHint}.${file.ext}`;
  const { error } = await db.storage.from(BUCKET).upload(path, file.bytes, {
    contentType: file.contentType,
    upsert: true,
  });
  if (error) throw new Error(`uploadProductImage: ${error.message}`);
  const { data } = db.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/** 批次上傳多張照片，回傳公開 URL 陣列（依傳入順序）。 */
export async function uploadProductImages(
  db: SupabaseClient,
  files: { bytes: ArrayBuffer; contentType: string; ext: string }[],
  keyPrefix: string,
): Promise<string[]> {
  const urls: string[] = [];
  for (let i = 0; i < files.length; i++) {
    urls.push(await uploadProductImage(db, files[i]!, `${keyPrefix}-${i}`));
  }
  return urls;
}

export async function createProduct(db: SupabaseClient, p: ProductWrite): Promise<string> {
  const { data, error } = await db
    .from("products")
    .insert({
      title: p.title,
      description: p.description,
      condition: p.condition,
      status: p.status,
      price_amount: p.priceAmount,
      price_currency: p.priceCurrency,
      attributes: p.attributes,
      image_url: p.imageUrls?.[0] ?? p.imageUrl,
      image_urls: p.imageUrls ?? (p.imageUrl ? [p.imageUrl] : []),
      category: p.category ?? null,
      region: p.region ?? null,
      source: p.source ?? "own",
    })
    .select("id")
    .single<{ id: string }>();
  if (error) throw new Error(`createProduct: ${error.message}`);
  return data.id;
}

export async function updateProduct(db: SupabaseClient, id: string, p: Partial<ProductWrite>): Promise<void> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (p.title !== undefined) patch.title = p.title;
  if (p.description !== undefined) patch.description = p.description;
  if (p.condition !== undefined) patch.condition = p.condition;
  if (p.status !== undefined) patch.status = p.status;
  if (p.priceAmount !== undefined) patch.price_amount = p.priceAmount;
  if (p.priceCurrency !== undefined) patch.price_currency = p.priceCurrency;
  if (p.attributes !== undefined) patch.attributes = p.attributes;
  if (p.imageUrls !== undefined) {
    patch.image_urls = p.imageUrls;
    patch.image_url = p.imageUrls[0] ?? null; // 主圖=第一張
  } else if (p.imageUrl !== undefined) {
    patch.image_url = p.imageUrl;
  }
  if (p.category !== undefined) patch.category = p.category;
  if (p.region !== undefined) patch.region = p.region;
  const { error } = await db.from("products").update(patch).eq("id", id);
  if (error) throw new Error(`updateProduct: ${error.message}`);
}

export async function setProductStatus(db: SupabaseClient, id: string, status: string): Promise<void> {
  const { error } = await db
    .from("products")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`setProductStatus: ${error.message}`);
}

export async function deleteProduct(db: SupabaseClient, id: string): Promise<void> {
  const { error } = await db.from("products").delete().eq("id", id);
  if (error) throw new Error(`deleteProduct: ${error.message}`);
}
