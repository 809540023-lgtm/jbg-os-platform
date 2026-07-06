import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0d1117",
        panel: "#161b22",
        line: "#30363d",
        accent: "#4f8cff",
      },
    },
  },
  plugins: [],
} satisfies Config;
