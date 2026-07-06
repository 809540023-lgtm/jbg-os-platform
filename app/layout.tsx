import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "JBG OS — AI Business Operating System",
  description:
    "AI 商品生命週期作業系統。第一個實作：Second-Hand AI Platform (SHAP)。",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-Hant">
      <body className="antialiased">{children}</body>
    </html>
  );
}
