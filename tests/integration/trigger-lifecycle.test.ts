import { createServiceClient } from "@jbg/persistence";
import { afterEach, describe, expect, it } from "vitest";
import { buildLifecycleRuntime } from "../../app/lib/lifecycle-runtime";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasDb = Boolean(url && key);

describe.skipIf(!hasDb)("觸發 demo lifecycle + resume（互動流程，真 DB）", () => {
  const db = createServiceClient(url!, key!);
  const trash: { execIds: string[]; productIds: string[]; memSlugs: string[] } = { execIds: [], productIds: [], memSlugs: [] };

  afterEach(async () => {
    for (const id of trash.execIds) await db.from("loop_executions").delete().eq("id", id);
    for (const id of trash.productIds) await db.from("products").delete().eq("id", id);
    for (const s of trash.memSlugs) await db.from("memories").delete().eq("slug", s);
    trash.execIds = []; trash.productIds = []; trash.memSlugs = [];
  });

  it("trigger → waiting_human（product 已建）→ resume → succeeded（memory 已建）", async () => {
    const rt = buildLifecycleRuntime(db);

    const { executionId, status } = await rt.trigger();
    trash.execIds.push(executionId);
    expect(status).toBe("waiting_human");

    // product 落 DB
    const { data: ex } = await db
      .from("loop_executions")
      .select("status, context")
      .eq("id", executionId)
      .single<{ status: string; context: { assemble?: { product?: { id: string } } } }>();
    expect(ex?.status).toBe("waiting_human");
    const productId = ex?.context?.assemble?.product?.id;
    expect(productId).toBeTruthy();
    if (productId) trash.productIds.push(productId);

    const { data: prod } = await db.from("products").select("status").eq("id", productId!).single<{ status: string }>();
    expect(prod?.status).toBe("assembled");

    // resume → 發佈 + 記憶 → succeeded
    const memSlug = `demo-mem-${executionId.slice(0, 8)}`;
    trash.memSlugs.push(memSlug);
    const finalStatus = await rt.resume(executionId);
    expect(finalStatus).toBe("succeeded");

    const { data: mem } = await db.from("memories").select("type").eq("slug", memSlug).maybeSingle<{ type: string }>();
    expect(mem?.type).toBe("fact");
  });
});
