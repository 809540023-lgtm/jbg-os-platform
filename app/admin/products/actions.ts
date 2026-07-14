"use server";

import {
  createProduct,
  setProductStatus,
  deleteProduct,
  uploadProductImage,
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

  // 屬性：品牌/磅數/地區… 用「key:value，每行一組」的自由格式
  const attrsRaw = String(formData.get("attributes") ?? "");
  const attributes: CatalogAttribute[] = attrsRaw
    .split("\n")
    .map((line) => line.split(/[:：]/))
    .filter((p) => p.length >= 2 && p[0]?.trim() && p[1]?.trim())
    .map((p) => ({ key: p[0]!.trim(), value: p.slice(1).join(":").trim() }));

  try {
    // 照片（選填）
    let imageUrl: string | null = null;
    const file = formData.get("photo");
    if (file instanceof File && file.size > 0) {
      if (file.size > 8 * 1024 * 1024) return { error: "照片請小於 8MB。" };
      const ext = EXT_BY_TYPE[file.type];
      if (!ext) return { error: "照片格式限 JPG / PNG / WebP。" };
      const bytes = await file.arrayBuffer();
      const keyHint = `p-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
      imageUrl = await uploadProductImage(db, { bytes, contentType: file.type, ext }, keyHint);
    }

    await createProduct(db, {
      title,
      description,
      condition,
      status,
      priceAmount,
      priceCurrency: "TWD",
      attributes,
      imageUrl,
    });
  } catch {
    return { error: "建立失敗，請稍後再試。" };
  }

  revalidatePath("/admin/products");
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
