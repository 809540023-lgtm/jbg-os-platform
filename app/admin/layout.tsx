import { requireAdmin } from "@/lib/require-admin";

/** 保護 /admin/*（商品管理、上架、編輯）。/login 不在此路徑下，不受影響。 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return <>{children}</>;
}
