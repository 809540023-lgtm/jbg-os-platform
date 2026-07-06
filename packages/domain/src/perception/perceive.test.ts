import type { ModelClient, ModelRequest } from "@jbg/harness";
import { describe, expect, it } from "vitest";
import { createInMemoryAgentRepos } from "../agent/repo";
import { AgentRunner } from "../agent/runner";
import { perceive } from "./perceive";

const OCR_JSON = JSON.stringify({
  rawText: "CHANEL 12345",
  fields: {
    model: { value: "Classic Flap", confidence: 0.8 },
    serial: { value: "12345678", confidence: 0.7 },
    size: { value: null, confidence: 0 },
    material: { value: "caviar", confidence: 0.6 },
  },
  language: "en",
  lowConfidence: false,
});

const VISION_JSON = JSON.stringify({
  brand: { value: "Chanel", confidence: 0.9, isGuess: false },
  category: { value: "handbag", confidence: 0.85 },
  colors: [{ name: "black", confidence: 0.9 }],
  attachments: ["dust bag"],
  defects: [{ type: "scratch", area: "corner", severity: "minor", confidence: 0.6 }],
  overallConfidence: 0.85,
  notes: null,
});

function client(map: { ocr: string; vision: string }): ModelClient {
  return {
    complete: async (req: ModelRequest) => {
      const isVision = req.system?.includes("視覺") ?? false;
      return {
        text: isVision ? map.vision : map.ocr,
        usage: { inputTokens: 50, outputTokens: 20 },
      };
    },
  };
}

const input = {
  ocr: { photoId: "p1", imageUrl: "https://x/p1.jpg" },
  vision: {
    photoId: "p1",
    imageUrl: "https://x/p1.jpg",
    knownBrands: ["Chanel"],
    knownCategories: ["handbag"],
  },
};

describe("perceive (docs/08 perceive：ocr ‖ vision 並行)", () => {
  it("兩者皆成功 → ocr 與 vision 都回來", async () => {
    const runner = new AgentRunner({
      client: client({ ocr: OCR_JSON, vision: VISION_JSON }),
      repos: createInMemoryAgentRepos(),
    });
    const r = await perceive(runner, input);
    expect(r.ocr?.fields.model.value).toBe("Classic Flap");
    expect(r.vision?.brand.value).toBe("Chanel");
    expect(r.visionNeedsReview).toBe(false);
    expect(r.ocrError).toBeUndefined();
  });

  it("vision 失敗不拖垮 ocr（部分成功）", async () => {
    const runner = new AgentRunner({
      client: client({ ocr: OCR_JSON, vision: '{"broken":true}' }),
      repos: createInMemoryAgentRepos(),
    });
    const r = await perceive(runner, input);
    expect(r.ocr?.fields.serial.value).toBe("12345678");
    expect(r.vision).toBeUndefined();
    expect(r.visionError).toBeTruthy();
  });

  it("vision 低信心 → visionNeedsReview=true（升級）", async () => {
    const lowConf = JSON.stringify({
      brand: { value: null, confidence: 0.2, isGuess: true },
      category: { value: "handbag", confidence: 0.3 },
      colors: [],
      attachments: [],
      defects: [],
      overallConfidence: 0.3,
      notes: "blurry",
    });
    const runner = new AgentRunner({
      client: client({ ocr: OCR_JSON, vision: lowConf }),
      repos: createInMemoryAgentRepos(),
    });
    const r = await perceive(runner, input);
    expect(r.visionNeedsReview).toBe(true);
  });
});
