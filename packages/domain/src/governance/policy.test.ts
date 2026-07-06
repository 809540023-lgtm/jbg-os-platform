import { describe, expect, it } from "vitest";
import { asId } from "../shared/id";
import { money } from "../shared/money";
import { agentActor, systemActor } from "./actor";
import { ACTIONS, PolicyEngine, defaultMvpRules } from "./policy";

const publisher = agentActor(asId("a1"), "publisher");
const price = agentActor(asId("a2"), "price");

describe("PolicyEngine (§0.9)", () => {
  const engine = new PolicyEngine({
    rules: defaultMvpRules({ priceThreshold: money(50000, "TWD") }),
    defaultEffect: "deny",
  });

  it("publish 一律需人審", () => {
    const d = engine.decide({
      actor: publisher,
      action: ACTIONS.PUBLISH,
      resource: { kind: "listing", id: "l1" },
    });
    expect(d.effect).toBe("require_human");
    expect(d.ruleId).toBe("publish-requires-human");
  });

  it("未命中規則的 agent 副作用 → 預設 deny（deny-first）", () => {
    const d = engine.decide({
      actor: publisher,
      action: ACTIONS.DELETE,
      resource: { kind: "product", id: "p1" },
    });
    expect(d.effect).toBe("deny");
  });

  it("唯讀動作放行", () => {
    const d = engine.decide({
      actor: price,
      action: "product.read",
      resource: { kind: "product", id: "p1" },
    });
    expect(d.effect).toBe("allow");
  });

  it("price.apply 超門檻需人審、未超則預設 deny（無明文 allow）", () => {
    const over = engine.decide({
      actor: price,
      action: ACTIONS.PRICE_APPLY,
      resource: { kind: "product", id: "p1" },
      context: { amount: money(80000, "TWD") },
    });
    expect(over.effect).toBe("require_human");

    const under = engine.decide({
      actor: price,
      action: ACTIONS.PRICE_APPLY,
      resource: { kind: "product", id: "p1" },
      context: { amount: money(10000, "TWD") },
    });
    expect(under.effect).toBe("deny");
  });

  it("human actor 動作層放行（資料層交給 RLS）", () => {
    const human = { ...systemActor(asId("h1")), kind: "human" as const, displayName: "boss" };
    const d = engine.decide({
      actor: human,
      action: ACTIONS.PUBLISH,
      resource: { kind: "listing", id: "l1" },
    });
    expect(d.effect).toBe("allow");
  });
});
