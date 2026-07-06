import type { FacebookConnector } from "@jbg/connectors";
import {
  AgentRunner,
  assembleFrom,
  marketingAgent,
  memoryAgent,
  perceive,
  priceAgent,
  reviewerAgent,
  type Actor,
  type Brand,
  type Category,
  type MarketingDraft,
  type OCRInput,
  type PerceiveResult,
  type PolicyEngine,
  type Product,
  type ProductPhoto,
  type PublishInput,
  type StepExecutor,
  type VisionInput,
} from "@jbg/domain";
import { publishListing } from "./publish-listing";

/**
 * product-lifecycle 的執行器 —— docs/08。把 §0.7 各階段接上實際 agent/skill/connector。
 * 依附錄 A 分層放 skills（可依賴 domain + connectors）。純 domain 的 LoopRunner 注入本 executor。
 */
export interface LifecycleInput {
  driveFileId: string;
  photo: ProductPhoto;
  ocr: OCRInput;
  vision: VisionInput;
}

export interface LifecycleDeps {
  agentRunner: AgentRunner;
  policy: PolicyEngine;
  facebook: FacebookConnector;
  /** 執行發佈的 agent actor（`publisher`）。 */
  actor: Actor;
  brands: Brand[];
  categories: Category[];
  currency?: string;
  now?: () => string;
}

export function buildLifecycleExecutor(deps: LifecycleDeps): StepExecutor {
  const currency = deps.currency ?? "TWD";
  const now = deps.now ?? (() => new Date().toISOString());

  return async ({ step, execution }) => {
    const ctx = execution.context as Record<string, unknown>;
    const input = execution.input as LifecycleInput;

    switch (step.id) {
      case "perceive": {
        const r = await perceive(deps.agentRunner, { ocr: input.ocr, vision: input.vision });
        return { output: r };
      }

      case "assemble": {
        const p = ctx.perceive as PerceiveResult;
        const { product } = assembleFrom({
          photo: input.photo,
          ocr: p.ocr,
          vision: p.vision,
          brands: deps.brands,
          categories: deps.categories,
          now: now(),
        });
        return { output: { product } };
      }

      case "price": {
        const product = (ctx.assemble as { product: Product }).product;
        const out = await deps.agentRunner.run(priceAgent, {
          productId: product.id,
          productCard: {
            brand: product.brandId,
            category: product.categoryId,
            condition: product.condition ?? "unknown",
            attachments: product.attributes
              .filter((a) => a.key === "attachment")
              .map((a) => a.value),
            defects: [],
          },
          comparableSales: [],
          currency,
        });
        return { output: out.output };
      }

      case "compose": {
        const product = (ctx.assemble as { product: Product }).product;
        const price = ctx.price as { suggestedAmount: number; currency: string };
        const out = await deps.agentRunner.run(marketingAgent, {
          productId: product.id,
          productCard: { ...product },
          price: { amount: price.suggestedAmount, currency: price.currency },
        });
        return { output: out.output };
      }

      case "review": {
        const product = (ctx.assemble as { product: Product }).product;
        const out = await deps.agentRunner.run(reviewerAgent, {
          productId: product.id,
          card: { ...product },
          marketing: ctx.compose as MarketingDraft,
          price: ctx.price as never,
        });
        return { output: out.output };
      }

      case "publish": {
        const product = (ctx.assemble as { product: Product }).product;
        const marketing = ctx.compose as MarketingDraft;
        const publishInput: PublishInput = {
          listingId: product.id,
          productId: product.id,
          status: "approved",
          content: {
            title: marketing.title,
            body: marketing.body,
            hashtags: marketing.hashtags,
            mediaUrls: [input.photo.storagePath],
          },
          idempotencyKey: `${product.id}-v1`,
        };
        // 已過 human-review 關卡 → humanApproved=true 讓 PolicyEngine 放行。
        const result = await publishListing(
          { policy: deps.policy, facebook: deps.facebook, actor: deps.actor, now },
          publishInput,
          { humanApproved: true },
        );
        if (!result.published) {
          throw new Error(result.error ?? "發佈失敗");
        }
        return { output: result };
      }

      case "remember": {
        const product = (ctx.assemble as { product: Product }).product;
        const price = ctx.price as { suggestedAmount: number; currency: string };
        const out = await deps.agentRunner.run(memoryAgent, {
          sourceType: "order",
          sourceId: product.id,
          payload: { productId: product.id, amount: price.suggestedAmount, currency: price.currency },
        });
        return { output: out.output };
      }

      default:
        return { output: null };
    }
  };
}
