import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/** robots.txt —— 開放收錄公開商品頁，擋掉內部後台（/loops /reviews /inquiries）。 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/p"],
      disallow: ["/loops", "/reviews", "/inquiries"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
