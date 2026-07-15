import { getAdminConfig } from "@jbg/persistence";
import type { Metadata } from "next";
import { sanitizeNext } from "@/lib/auth";
import { getServerDb } from "@/lib/server-db";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "後台登入 · JBG OS", robots: { index: false } };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const db = getServerDb();
  const needsSetup = db ? !(await getAdminConfig(db)) : false;

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center px-6">
      <div className="rounded-2xl border border-line bg-panel/60 p-6">
        <p className="text-sm font-medium tracking-widest text-accent">JBG OS</p>
        <h1 className="mt-1 text-2xl font-bold">{needsSetup ? "首次設定管理密碼" : "後台登入"}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {needsSetup
            ? "這是你第一次進後台，請設定一組管理密碼（只有你知道，我們僅保存加密雜湊）。"
            : "此區為內部營運後台，需管理密碼。"}
        </p>
        <LoginForm needsSetup={needsSetup} next={sanitizeNext(next)} />
      </div>
    </main>
  );
}
