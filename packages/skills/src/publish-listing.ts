import type { FacebookConnector } from "@jbg/connectors";
import {
  ACTIONS,
  type Actor,
  type PolicyEngine,
  type PublishInput,
  type PublishResult,
} from "@jbg/domain";

/**
 * publishListing —— Publisher（`publisher`）的執行（docs/07 §7.3.6）。
 * 唯一產生外部副作用的動作：發佈前**必過 PolicyEngine**（§7.5），只接受 approved，冪等（走 connector）。
 * 依附錄 A 分層：此邏輯屬 skills（skills→connectors→domain），不放 domain。
 */
export interface PublishDeps {
  policy: PolicyEngine;
  facebook: FacebookConnector;
  actor: Actor;
  now?: () => string;
}

export async function publishListing(
  deps: PublishDeps,
  input: PublishInput,
  opts?: { humanApproved?: boolean },
): Promise<PublishResult> {
  const base = {
    listingId: input.listingId,
    published: false,
    externalPostId: null,
    publishedAt: null,
  };

  if (input.status !== "approved") {
    return { ...base, error: "只接受 approved 的 Listing" };
  }

  const decision = deps.policy.decide({
    actor: deps.actor,
    action: ACTIONS.PUBLISH,
    resource: { kind: "listing", id: input.listingId },
    context: { humanApproved: opts?.humanApproved === true },
  });

  if (decision.effect === "require_human") {
    return { ...base, needsHuman: true, error: decision.reason };
  }
  if (decision.effect === "deny") {
    return { ...base, error: `發佈被拒：${decision.reason}` };
  }

  const res = await deps.facebook.publishPost({
    message: input.content.body,
    title: input.content.title,
    mediaUrls: input.content.mediaUrls,
    idempotencyKey: input.idempotencyKey, // 冪等：同 Listing 不重發
  });

  return {
    listingId: input.listingId,
    published: true,
    externalPostId: res.postId,
    publishedAt: res.publishedAt,
  };
}
