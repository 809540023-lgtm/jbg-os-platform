"use server";

import { PublicDriveConnector, parseDriveFolderId } from "@jbg/connectors";
import { createProduct, updateProduct, uploadProductImages } from "@jbg/persistence";
import { revalidatePath } from "next/cache";
import { getServerDb } from "@/lib/server-db";

export interface ImportState {
  done?: boolean;
  error?: string;
  created?: string[];
  updated?: string[];
  skipped?: string[];
}

const PHOTOS_PER_PRODUCT = 8;

function guessCategory(name: string): string | null {
  if (/製冰/.test(name)) return "ice-machine";
  if (/洗碗/.test(name)) return "dishwasher";
  if (/冰箱|冷凍|冷藏/.test(name)) return "commercial-fridge";
  if (/爐|瓦斯/.test(name)) return "stove";
  if (/工作台|水槽|不鏽鋼|櫃檯|層架|發酵陳列架/.test(name)) return "stainless";
  return null;
}

/**
 * 從公開 Google Drive 資料夾匯入商品（每個子資料夾＝一件設備，草稿狀態）。
 * 冪等：同名的 reviewing 商品會更新照片而非重複建立。
 */
export async function importFromDriveAction(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const folderId = parseDriveFolderId(String(formData.get("folder") ?? ""));
  if (!folderId) return { error: "無法辨識資料夾連結，請貼完整的 Google Drive 資料夾網址。" };

  const db = getServerDb();
  if (!db) return { error: "系統未連線資料庫。" };

  const drive = new PublicDriveConnector();
  const created: string[] = [];
  const updated: string[] = [];
  const skipped: string[] = [];

  let roots;
  try {
    roots = await drive.listFolder(folderId);
  } catch {
    return { error: "讀不到這個資料夾，請確認共用設定為「知道連結的任何人可檢視」。" };
  }
  if (roots.length === 0) return { error: "資料夾是空的，或無法讀取（請確認共用權限）。" };

  for (const entry of roots) {
    if (entry.isImage || /\.(mov|mp4)$/i.test(entry.name)) {
      skipped.push(`${entry.name}（根目錄檔案）`);
      continue;
    }
    let children;
    try {
      children = await drive.listFolder(entry.id);
    } catch {
      skipped.push(`${entry.name}（讀取失敗）`);
      continue;
    }
    const imgs = children.filter((c) => c.isImage).slice(0, PHOTOS_PER_PRODUCT);
    if (imgs.length === 0) {
      skipped.push(`${entry.name}（無照片/權限不同）`);
      continue;
    }

    // 下載照片
    const files: { bytes: ArrayBuffer; contentType: string; ext: string }[] = [];
    for (const im of imgs) {
      const img = await drive.fetchImage(im.id);
      if (img) files.push({ bytes: img.bytes, contentType: img.contentType, ext: img.ext });
    }
    if (files.length === 0) {
      skipped.push(`${entry.name}（照片下載失敗）`);
      continue;
    }

    const urls = await uploadProductImages(db, files, `drive-${entry.id}`);

    // 冪等：同名 reviewing 商品 → 更新；否則建立
    const { data: existing } = await db
      .from("products")
      .select("id")
      .eq("title", entry.name)
      .eq("status", "reviewing")
      .maybeSingle<{ id: string }>();

    if (existing) {
      await updateProduct(db, existing.id, { imageUrls: urls });
      updated.push(`${entry.name}（${urls.length}張）`);
    } else {
      await createProduct(db, {
        title: entry.name,
        description: null,
        condition: "good",
        status: "reviewing",
        priceAmount: null,
        priceCurrency: "TWD",
        attributes: [],
        imageUrl: urls[0] ?? null,
        imageUrls: urls,
        category: guessCategory(entry.name),
        region: null,
      });
      created.push(`${entry.name}（${urls.length}張）`);
    }
  }

  revalidatePath("/admin/products");
  revalidatePath("/p");
  return { done: true, created, updated, skipped };
}
