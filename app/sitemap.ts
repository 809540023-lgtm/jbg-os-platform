import { listPublishedProducts } from "@jbg/persistence";
import type { MetadataRoute } from "next";
import { getServerDb } from "@/lib/server-db";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

/** sitemap.xml —— 讓 Google 收錄目錄與每一個商品 SEO 頁。 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: "weekly", priority: 0.5 },
    { url: `${SITE_URL}/p`, changeFrequency: "daily", priority: 0.9 },
  ];
  const db = getServerDb();
  if (!db) return base;
  try {
    const products = await listPublishedProducts(db, 1000);
    return [
      ...base,
      ...products.map((p) => ({
        url: `${SITE_URL}/p/${p.id}`,
        lastModified: new Date(p.updatedAt),
        changeFrequency: "weekly" as const,
        priority: 0.8,
      })),
    ];
  } catch {
    return base;
  }
}
