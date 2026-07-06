# migrations

依序放 SQL migration，命名見 `docs/appendix/D-database-naming-convention.md` §D.11。
例：`20260707T0900_create_catalog_products.sql`

完整 schema（31 張 table + enum + RLS + pgvector + audit trigger）的權威 DDL 在
`docs/06-database-schema.md`。第一批 migration 依 `docs/12` 的 MVP Todo 順序建立。
