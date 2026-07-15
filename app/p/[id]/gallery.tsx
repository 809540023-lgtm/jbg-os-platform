"use client";

import { useState } from "react";

/** 商品相簿：主圖 + 縮圖列，點縮圖切換主圖。 */
export function ProductGallery({ images, alt }: { images: string[]; alt: string }) {
  const [active, setActive] = useState(0);
  if (images.length === 0) return null;
  const main = images[Math.min(active, images.length - 1)];

  return (
    <div className="mb-5">
      <div className="overflow-hidden rounded-xl border border-line bg-panel">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={main} alt={alt} className="max-h-[440px] w-full object-contain" />
      </div>
      {images.length > 1 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {images.map((url, i) => (
            <button
              key={url}
              type="button"
              onClick={() => setActive(i)}
              className={`h-16 w-16 overflow-hidden rounded-md border ${i === active ? "border-accent ring-1 ring-accent" : "border-line"}`}
              aria-label={`照片 ${i + 1}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
