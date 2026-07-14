import type { Metadata } from "next";
import { sanitizeNext } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "後台登入 · JBG OS", robots: { index: false } };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center px-6">
      <div className="rounded-2xl border border-line bg-panel/60 p-6">
        <p className="text-sm font-medium tracking-widest text-accent">JBG OS</p>
        <h1 className="mt-1 text-2xl font-bold">後台登入</h1>
        <p className="mt-1 text-sm text-slate-500">此區為內部營運後台，需管理密碼。</p>
        <LoginForm next={sanitizeNext(next)} />
      </div>
    </main>
  );
}
