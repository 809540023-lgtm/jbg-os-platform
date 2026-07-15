import { listPublishedProducts } from "@jbg/persistence";
import { getServerDb } from "@/lib/server-db";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

/**
 * Meta 商品目錄（Catalog）feed —— 規劃書 §3.5 / §四「Publisher 產出可餵入 Meta 目錄」。
 * 格式：Meta Commerce CSV（Data Feed 規格必填欄：id,title,description,availability,
 * condition,price,link,image_link,brand）。在 Meta Commerce Manager 用
 * 「Scheduled feed」指向 {SITE_URL}/feed.csv 即可自動同步 → 開 DPA 再行銷。
 */

function csvEscape(v: string): string {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

const CONDITION_MAP: Record<string, string> = {
  new: "new",
  like_new: "refurbished",
  excellent: "refurbished",
  good: "used",
  fair: "used",
  poor: "used",
};

export async function GET(): Promise<Response> {
  const db = getServerDb();
  const header = [
    "id", "title", "description", "availability", "condition",
    "price", "link", "image_link", "additional_image_link", "brand", "google_product_category",
  ].join(",");

  if (!db) {
    return new Response(header + "\n", {
      headers: { "content-type": "text/csv; charset=utf-8" },
    });
  }

  const products = await listPublishedProducts(db, 1000);
  const rows = products.map((p) => {
    const brand =
      p.attributes.find((a) => a.key === "品牌")?.value ?? "JBG OS";
    // image_link 必填：優先用商品實際照片，沒有才退回站上 OG 佔位圖。
    const image = p.imageUrl ?? `${SITE_URL}/og-placeholder.svg`;
    // 相簿其餘照片放 additional_image_link（Meta 上限 10 張，逗號分隔）。
    const extra = p.imageUrls.filter((u) => u !== image).slice(0, 10).join(",");
    return [
      p.id,
      p.title ?? "餐飲二手設備",
      (p.description ?? "").replace(/\s+/g, " ").slice(0, 4990),
      "in stock",
      CONDITION_MAP[p.condition ?? "good"] ?? "used",
      `${((p.priceAmount ?? 0)).toFixed(2)} ${p.priceCurrency ?? "TWD"}`,
      `${SITE_URL}/p/${p.id}`,
      image,
      extra,
      brand,
      "Business & Industrial > Food Service",
    ]
      .map((v) => csvEscape(String(v)))
      .join(",");
  });

  return new Response([header, ...rows].join("\n") + "\n", {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}
