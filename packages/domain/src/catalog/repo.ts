import type { ProductStatus } from "@jbg/db";
import type { ProductId } from "../shared/id";
import type { Product } from "./types";

/** Product repository 介面（Supabase 實作在 @jbg/persistence）。 */
export interface ProductRepo {
  create(product: Product): Promise<void>;
  update(product: Product): Promise<void>;
  get(id: ProductId): Promise<Product | null>;
  listByStatus(status: ProductStatus, limit?: number): Promise<Product[]>;
}
