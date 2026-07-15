import { requireAdmin } from "@/lib/require-admin";

/** 保護 /reviews /inquiries /analytics /loops 等內部營運頁。 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return <>{children}</>;
}
