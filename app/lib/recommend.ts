import type { CatalogProduct } from "@jbg/persistence";
import { LANDING_CATEGORIES, LANDING_REGIONS } from "@/lib/landing";

/**
 * 智能推薦（規劃書 §2.2「開店整套組合方案，提高客單」）。
 * 純函式：從已上架商品推「開店這樣配」（互補品項、同地區優先）與「類似設備」。
 * 不需 DB 變更，讀既有 published 商品即可。
 */

type P = {
  title: string | null;
  attributes: { key: string; value: string }[];
  category?: string | null;
  region?: string | null;
};

// 優先用正式欄位；舊資料（無欄位）才回退字串比對。
function categoryOf(p: P): string | null {
  if (p.category) return p.category;
  const text = `${p.title ?? ""} ${p.attributes.map((a) => a.value).join(" ")}`;
  return LANDING_CATEGORIES.find((c) => c.aliases.some((a) => text.includes(a)))?.slug ?? null;
}

function regionOf(p: P): string | null {
  if (p.region) return p.region;
  const text = `${p.title ?? ""} ${p.attributes.map((a) => a.value).join(" ")}`;
  return LANDING_REGIONS.find((r) => text.includes(r.label))?.slug ?? null;
}

export interface Recommendations {
  /** 開店整套：不同品項、同地區優先（提高客單的組合）。 */
  bundle: CatalogProduct[];
  /** 類似設備：同品項替代選擇。 */
  similar: CatalogProduct[];
}

export function recommend(
  current: CatalogProduct,
  all: CatalogProduct[],
  limit = 3,
): Recommendations {
  const curCat = categoryOf(current);
  const curRegion = regionOf(current);
  const pool = all.filter((p) => p.id !== current.id);

  const score = (p: CatalogProduct) => (regionOf(p) === curRegion && curRegion ? 2 : 0);

  // 開店套組：不同品項（互補），同地區加分
  const bundle = pool
    .filter((p) => {
      const c = categoryOf(p);
      return c !== null && c !== curCat;
    })
    .map((p) => ({ p, s: score(p) }))
    // 每個互補品項各取一個代表，避免同品項洗版
    .sort((a, b) => b.s - a.s)
    .reduce<{ seen: Set<string>; out: CatalogProduct[] }>(
      (acc, { p }) => {
        const c = categoryOf(p) ?? "?";
        if (!acc.seen.has(c) && acc.out.length < limit) {
          acc.seen.add(c);
          acc.out.push(p);
        }
        return acc;
      },
      { seen: new Set(), out: [] },
    ).out;

  // 類似設備：同品項
  const similar = pool
    .filter((p) => categoryOf(p) === curCat && curCat !== null)
    .sort((a, b) => score(b) - score(a))
    .slice(0, limit);

  return { bundle, similar };
}
