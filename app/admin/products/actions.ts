"use server";

import {
  createProduct,
  setProductStatus,
  deleteProduct,
  updateProduct,
  uploadProductImages,
  type CatalogAttribute,
} from "@jbg/persistence";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerDb } from "@/lib/server-db";

export interface NewProductState {
  error?: string;
}

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

/** 把 textarea 的「key：value 每行一組」解析成屬性陣列。 */
function parseAttributes(raw: string): CatalogAttribute[] {
  return raw
    .split("\n")
    .map((line) => line.split(/[:：]/))
    .filter((p) => p.length >= 2 && p[0]?.trim() && p[1]?.trim())
    .map((p) => ({ key: p[0]!.trim(), value: p.slice(1).join(":").trim() }));
}

/** 上傳多張照片（表單 name="photos"），回傳 URL 陣列；任一格式/大小不合則回錯誤。 */
async function uploadPhotos(
  db: ReturnType<typeof getServerDb>,
  files: FormDataEntryValue[],
): Promise<{ urls?: string[]; error?: string }> {
  const real = files.filter((f): f is File => f instanceof File && f.size > 0);
  if (real.length === 0) return { urls: [] };
  if (real.length > 15) return { error: "一次最多 15 張照片。" };
  const prepared: { bytes: ArrayBuffer; contentType: string; ext: string }[] = [];
  for (const f of real) {
    if (f.size > 8 * 1024 * 1024) return { error: `照片「${f.name}」超過 8MB。` };
    const ext = EXT_BY_TYPE[f.type];
    if (!ext) return { error: `照片「${f.name}」格式限 JPG / PNG / WebP。` };
    prepared.push({ bytes: await f.arrayBuffer(), contentType: f.type, ext });
  }
  const keyPrefix = `p-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
  return { urls: await uploadProductImages(db!, prepared, keyPrefix) };
}

/** 後台新增商品：可選上傳照片 → 建立商品列。 */
export async function createProductAction(
  _prev: NewProductState,
  formData: FormData,
): Promise<NewProductState> {
  const title = String(formData.get("title") ?? "").trim();
  const priceRaw = String(formData.get("price") ?? "").trim();
  if (title.length < 2) return { error: "請填寫商品標題。" };

  const db = getServerDb();
  if (!db) return { error: "系統未連線資料庫。" };

  const condition = String(formData.get("condition") ?? "good");
  const status = String(formData.get("status") ?? "published");
  const description = String(formData.get("description") ?? "").trim() || null;
  const priceAmount = priceRaw ? Math.max(0, Math.round(Number(priceRaw))) : null;
  if (priceRaw && Number.isNaN(priceAmount)) return { error: "價格請填數字。" };
  const attributes = parseAttributes(String(formData.get("attributes") ?? ""));

  try {
    const photos = await uploadPhotos(db, formData.getAll("photos"));
    if (photos.error) return { error: photos.error };
    await createProduct(db, {
      title,
      description,
      condition,
      status,
      priceAmount,
      priceCurrency: "TWD",
      attributes,
      imageUrl: photos.urls?.[0] ?? null,
      imageUrls: photos.urls ?? [],
      category: String(formData.get("category") ?? "") || null,
      region: String(formData.get("region") ?? "") || null,
    });
  } catch {
    return { error: "建立失敗，請稍後再試。" };
  }

  revalidatePath("/admin/products");
  revalidatePath("/p");
  redirect("/admin/products");
}

/** 後台編輯既有商品：可換照片（不換就沿用舊圖）。 */
export async function updateProductAction(
  _prev: NewProductState,
  formData: FormData,
): Promise<NewProductState> {
  const id = String(formData.get("id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  if (!id) return { error: "缺少商品 ID。" };
  if (title.length < 2) return { error: "請填寫商品標題。" };

  const db = getServerDb();
  if (!db) return { error: "系統未連線資料庫。" };

  const priceRaw = String(formData.get("price") ?? "").trim();
  const priceAmount = priceRaw ? Math.max(0, Math.round(Number(priceRaw))) : null;
  if (priceRaw && Number.isNaN(priceAmount)) return { error: "價格請填數字。" };

  try {
    // 相簿 = 保留未被移除的既有照片 + 新上傳的照片
    const kept = formData.getAll("keep").map(String).filter(Boolean);
    const added = await uploadPhotos(db, formData.getAll("photos"));
    if (added.error) return { error: added.error };
    const imageUrls = [...kept, ...(added.urls ?? [])];

    await updateProduct(db, id, {
      title,
      description: String(formData.get("description") ?? "").trim() || null,
      condition: String(formData.get("condition") ?? "good"),
      status: String(formData.get("status") ?? "published"),
      priceAmount,
      priceCurrency: "TWD",
      attributes: parseAttributes(String(formData.get("attributes") ?? "")),
      category: String(formData.get("category") ?? "") || null,
      region: String(formData.get("region") ?? "") || null,
      imageUrls,
    });
  } catch {
    return { error: "更新失敗，請稍後再試。" };
  }

  revalidatePath("/admin/products");
  revalidatePath(`/p/${id}`);
  revalidatePath("/p");
  redirect("/admin/products");
}

/** 上架/下架切換。 */
export async function toggleStatusAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id || !status) return;
  const db = getServerDb();
  if (!db) return;
  await setProductStatus(db, id, status);
  revalidatePath("/admin/products");
  revalidatePath("/p");
}

/** 刪除商品。 */
export async function deleteProductAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const db = getServerDb();
  if (!db) return;
  await deleteProduct(db, id);
  revalidatePath("/admin/products");
  revalidatePath("/p");
}
