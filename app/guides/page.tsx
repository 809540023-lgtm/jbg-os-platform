import type { Metadata } from "next";
import Link from "next/link";
import { GUIDES } from "@/lib/guides";
import { SITE_NAME, SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: `餐飲二手設備選購指南｜避雷・驗收・省錢攻略｜${SITE_NAME}`,
  description:
    "開店設備怎麼選二手：製冰機磅數計算、營業用冰箱避雷、整套採購清單、款項代管保障——實戰選購指南。",
  alternates: { canonical: `${SITE_URL}/guides` },
};

export default function GuidesPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <nav className="mb-6 text-xs text-zinc-500">
        <Link href="/p" className="text-accent hover:underline">← 餐飲二手設備目錄</Link>
      </nav>
      <h1 className="text-3xl font-bold">選購指南</h1>
      <p className="mt-2 text-zinc-400">開店設備怎麼選二手 —— 避雷、驗收、省錢，一次講清楚。</p>

      <div className="mt-8 space-y-4">
        {GUIDES.map((g) => (
          <Link
            key={g.slug}
            href={`/guides/${g.slug}`}
            className="block rounded-xl border border-line bg-panel/60 p-5 transition hover:border-accent/50"
          >
            <h2 className="text-lg font-semibold leading-snug">{g.title}</h2>
            <p className="mt-2 text-sm text-zinc-400">{g.description}</p>
          </Link>
        ))}
      </div>

      <p className="mt-10 text-center text-xs text-zinc-600">{SITE_NAME}</p>
    </main>
  );
}
