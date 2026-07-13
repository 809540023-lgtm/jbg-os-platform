import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#f5f7fa", // 頁面底（淺）
        panel: "#ffffff", // 卡片底（白）
        line: "#dfe4ec", // 邊框（淺灰）
        accent: "#2563eb", // 主色藍（在白底上對比足夠）
      },
    },
  },
  plugins: [],
} satisfies Config;
