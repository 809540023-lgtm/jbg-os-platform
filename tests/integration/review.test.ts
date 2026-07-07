import {
  createServiceClient,
  decideReview,
  listPendingReviews,
} from "@jbg/persistence";
import { afterEach, describe, expect, it } from "vitest";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasDb = Boolean(url && key);

describe.skipIf(!hasDb)("Human Review repo（真 DB）", () => {
  const db = createServiceClient(url!, key!);
  let createdId = "";

  afterEach(async () => {
    if (createdId) await db.from("human_reviews").delete().eq("id", createdId);
    createdId = "";
  });

  it("列出 pending → decide approved → 不再 pending，DB status=approved", async () => {
    const { data } = await db
      .from("human_reviews")
      .insert({
        target_kind: "listing",
        target_id: "55555555-5555-5555-5555-555555555555",
        status: "pending",
        reason: "整合測試：發佈前審核",
      })
      .select("id")
      .single<{ id: string }>();
    createdId = data!.id;

    const pending = await listPendingReviews(db);
    expect(pending.some((r) => r.id === createdId)).toBe(true);

    await decideReview(db, {
      id: createdId,
      decision: "approved",
      note: "看起來沒問題",
      decidedAt: new Date().toISOString(),
    });

    const after = await listPendingReviews(db);
    expect(after.some((r) => r.id === createdId)).toBe(false);

    const { data: row } = await db
      .from("human_reviews")
      .select("status, decision_note")
      .eq("id", createdId)
      .single<{ status: string; decision_note: string }>();
    expect(row?.status).toBe("approved");
    expect(row?.decision_note).toBe("看起來沒問題");
  });
});
