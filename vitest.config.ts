import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["packages/**/*.test.ts", "tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@jbg/db": r("./packages/db/src/index.ts"),
      "@jbg/domain": r("./packages/domain/src/index.ts"),
      "@jbg/harness": r("./packages/harness/src/index.ts"),
      "@jbg/prompts": r("./packages/prompts/src/index.ts"),
      "@jbg/skills": r("./packages/skills/src/index.ts"),
      "@jbg/connectors": r("./packages/connectors/src/index.ts"),
      "@jbg/eval": r("./packages/eval/src/index.ts"),
    },
  },
});
