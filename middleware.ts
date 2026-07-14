import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE, isValidSession } from "@/lib/auth";

/**
 * 後台認證閘（P0 資安）。保護內部營運頁面：/、/reviews、/inquiries、/analytics、/loops。
 * 公開店面（/p、/t、/guides、/feed.csv…）不受影響。
 * 未設定 ADMIN_PASSWORD/ADMIN_SESSION_SECRET 時放行（本地開發/預覽）；正式環境務必設定。
 */
export async function middleware(req: NextRequest) {
  const secret = process.env.ADMIN_SESSION_SECRET;
  const password = process.env.ADMIN_PASSWORD;
  if (!secret || !password) return NextResponse.next(); // 未設定 → 不啟用（dev）

  const cookie = req.cookies.get(ADMIN_COOKIE)?.value;
  if (await isValidSession(cookie, secret)) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/admin/login";
  url.searchParams.set("next", req.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/", "/reviews/:path*", "/inquiries/:path*", "/analytics/:path*", "/loops/:path*"],
};
