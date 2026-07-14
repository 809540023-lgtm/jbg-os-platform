import { headers } from "next/headers";

/**
 * 極簡記憶體版 rate limit（P0 防濫用）。單一 Render 實例足夠；
 * 多實例/正式規模應改用 Supabase 或 Upstash。滑動視窗、per-key。
 */
const hits = new Map<string, number[]>();

export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= max) {
    hits.set(key, arr);
    return false; // 超過上限
  }
  arr.push(now);
  hits.set(key, arr);
  // 記憶體保護：偶爾清掉過期 key
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k);
  }
  return true;
}

/** 取請求來源 IP（Render/代理帶 x-forwarded-for）。 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "unknown"
  );
}
