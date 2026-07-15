import { listPublishedProducts } from "@jbg/persistence";
import type { MetadataRoute } from "next";
import { GUIDES } from "@/lib/guides";
import { allLandingDefs } from "@/lib/landing";
import { INFO_PAGES } from "@/lib/pages";
import { getServerDb } from "@/lib/server-db";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

/** sitemap.xml —— 收錄目錄、每個商品 SEO 頁、與 30 個地區×品項落地頁。 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: "weekly", priority: 0.5 },
    { url: `${SITE_URL}/p`, changeFrequency: "daily", priority: 0.9 },
    ...allLandingDefs().map((d) => ({
      url: `${SITE_URL}/t/${d.slug}`,
      changeFrequency: "weekly" as const,
      priority: d.region ? 0.7 : 0.8,
    })),
    { url: `${SITE_URL}/guides`, changeFrequency: "weekly", priority: 0.7 },
    ...GUIDES.map((g) => ({
      url: `${SITE_URL}/guides/${g.slug}`,
      lastModified: new Date(g.updated),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    ...INFO_PAGES.map((p) => ({
      url: `${SITE_URL}/info/${p.slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.4,
    })),
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
