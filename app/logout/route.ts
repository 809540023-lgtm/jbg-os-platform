import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ADMIN_COOKIE } from "@/lib/auth";

/** 登出：清除 session cookie，導回登入頁。 */
export async function GET(req: Request) {
  const jar = await cookies();
  jar.delete(ADMIN_COOKIE);
  return NextResponse.redirect(new URL("/login", req.url));
}
