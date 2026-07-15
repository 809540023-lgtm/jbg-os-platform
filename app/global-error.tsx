"use client";

/** 最外層錯誤邊界（連 layout 都掛掉時的底線）。必須自帶 html/body。 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="zh-Hant">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "3rem", textAlign: "center", color: "#1f2937" }}>
        <h1 style={{ fontSize: "1.25rem", fontWeight: 700 }}>系統暫時無法使用</h1>
        <p style={{ marginTop: "0.5rem", color: "#64748b" }}>請稍後再試。</p>
        <button
          onClick={() => reset()}
          style={{ marginTop: "1.5rem", padding: "0.5rem 1rem", background: "#2563eb", color: "#fff", border: 0, borderRadius: 6 }}
        >
          重新載入
        </button>
      </body>
    </html>
  );
}
