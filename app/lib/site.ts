/** 站台常數 —— SEO canonical / sitemap 用。可用 NEXT_PUBLIC_SITE_URL 覆寫。 */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://jbg-os-platform.onrender.com";

export const SITE_NAME = "JBG OS · 餐飲二手設備撮合直送";

/** 金額格式化（price_amount 為整數 TWD 元）。 */
export function formatPrice(amount: number | null, currency: string | null): string {
  if (amount == null) return "價格洽詢";
  const cur = currency ?? "TWD";
  const symbol = cur === "TWD" ? "NT$" : cur + " ";
  return `${symbol}${amount.toLocaleString("zh-TW")}`;
}

const CONDITION_LABEL: Record<string, string> = {
  new: "全新",
  like_new: "近全新",
  excellent: "九成新",
  good: "良好",
  fair: "堪用",
  poor: "待修",
};
export function conditionLabel(c: string | null): string {
  return c ? (CONDITION_LABEL[c] ?? c) : "—";
}
