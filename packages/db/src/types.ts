/**
 * Supabase 產生的 Database 型別會放這裡（`pnpm db:types` → supabase gen types）。
 * 目前為 placeholder，待 Supabase 專案建立後由 scripts/gen-db-types.ts 覆寫。
 * 權威 schema 見 docs/06-database-schema.md 與 supabase/migrations/*。
 */
export type Database = {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
};
