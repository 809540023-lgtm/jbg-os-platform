import Link from "next/link";
import { INFO_PAGES } from "@/lib/pages";
import { SITE_NAME } from "@/lib/site";

/** 公開店面頁尾：法遵頁連結 + 版權。 */
export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-line">
      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <Link href="/p" className="text-slate-600 hover:text-accent">商品目錄</Link>
          <Link href="/guides" className="text-slate-600 hover:text-accent">選購指南</Link>
          {INFO_PAGES.map((p) => (
            <Link key={p.slug} href={`/info/${p.slug}`} className="text-slate-600 hover:text-accent">
              {p.title}
            </Link>
          ))}
        </div>
        <p className="mt-4 text-xs text-slate-400">© {SITE_NAME}　·　二手設備為中古品，交易前請詳閱商品描述與退換貨政策。</p>
      </div>
    </footer>
  );
}
