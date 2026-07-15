/**
 * 地區×品項落地頁定義 —— 規劃書 §3.3：為台北/新北/桃園/新竹/台中各建品項落地頁，
 * 卡「中古XX＋地區」「二手XX＋地區」長尾詞。slug 用 ASCII（URL 乾淨），中文放 title/h1/內文。
 */

export interface LandingCategory {
  slug: string;
  label: string;        // 品項中文（比對商品 title 用）
  aliases: string[];    // 其他常見說法（比對用）
  intro: string;        // 落地頁導言（SEO 內文）
  buyingTips: string[]; // 挑選要點（解痛內容，建信任）
}

export interface LandingRegion {
  slug: string;
  label: string;
}

export const LANDING_CATEGORIES: LandingCategory[] = [
  {
    slug: "ice-machine",
    label: "製冰機",
    aliases: ["製冰機"],
    intro:
      "營業用二手製冰機（萬利多 Manitowoc、Scotsman、力頓 Hoshizaki 等品牌），依日產能磅數挑選，全部經水路清洗除垢、製冰量實測。撮合直送、可驗收、附保固。",
    buyingTips: [
      "磅數怎麼算：手搖飲每日約需 1 磅冰/杯 ×日杯量 ×1.5 安全係數；小吃店 200–300 磅、飲料店 400–600 磅起。",
      "驗收重點：製冰速度、儲冰量、排水順暢、冷媒壓力、運轉噪音。",
      "二手製冰機最大地雷是水路水垢與冷媒洩漏——我們交機前完成清洗與壓力測試。",
    ],
  },
  {
    slug: "commercial-fridge",
    label: "商用冰箱",
    aliases: ["商用冰箱", "營業用冰箱", "冷凍冷藏", "工作台冰箱"],
    intro:
      "二手商用冰箱／營業用冷凍冷藏設備：四門、六門、工作台（臥式）、玻璃展示櫃。門封更新、溫控校準、壓縮機實測，開店整套採購另有優惠。",
    buyingTips: [
      "先確認電壓（110V/220V/三相）與擺放尺寸，再挑門數與上藏下凍配置。",
      "驗收重點：各室到溫時間、門封密合、壓縮機聲音、排水孔是否通暢。",
      "工作台冰箱檯面即備料區，適合吧檯與廚房動線緊湊的店型。",
    ],
  },
  {
    slug: "dishwasher",
    label: "洗碗機",
    aliases: ["洗碗機"],
    intro:
      "營業用二手洗碗機（掀門式、輸送帶式），管路清洗完成、加熱與洗程實測。適合餐廳、團膳、中央廚房。",
    buyingTips: [
      "掀門式適合中小型餐廳；百人以上團膳建議輸送帶式。",
      "驗收重點：洗程完整、加熱到溫、排水、噴臂轉動。",
      "留意進水水質，硬水區建議加裝軟水器延長壽命。",
    ],
  },
  {
    slug: "stove",
    label: "爐具",
    aliases: ["爐具", "快炒爐", "西餐爐", "湯爐"],
    intro:
      "二手營業用爐具：快炒爐、西餐爐、湯爐、煎台。火力與瓦斯管線實測，安全閥檢查完成。",
    buyingTips: [
      "先確認燃料（天然氣/桶裝瓦斯）與抽風条件，再挑口數與火力。",
      "驗收重點：點火順暢、火力均勻、瓦斯管線無漏、鼓風機運轉。",
      "熱炒店選鼓風快炒爐、咖啡簡餐選西餐爐即可，別為用不到的火力多花錢。",
    ],
  },
  {
    slug: "stainless",
    label: "不鏽鋼設備",
    aliases: ["不鏽鋼", "工作台", "水槽", "層架"],
    intro:
      "二手不鏽鋼廚房設備：工作台、水槽、層架、置物架。除鏽拋光整新，尺寸齊全可搭配規劃。",
    buyingTips: [
      "留意板厚與腳架穩固度，檯面凹陷影響使用壽命。",
      "水槽驗收：焊接處無滲漏、落水頭配件齊全。",
      "開店建議先畫動線再買尺寸，我們可依現場圖協助配置。",
    ],
  },
];

export const LANDING_REGIONS: LandingRegion[] = [
  { slug: "taipei", label: "台北" },
  { slug: "new-taipei", label: "新北" },
  { slug: "taoyuan", label: "桃園" },
  { slug: "hsinchu", label: "新竹" },
  { slug: "taichung", label: "台中" },
];

export interface LandingDef {
  slug: string; // e.g. "ice-machine" 或 "ice-machine-taipei"
  category: LandingCategory;
  region: LandingRegion | null;
  title: string; // 「二手製冰機 台北」
}

/** 展開全部落地頁（品項 5 + 品項×地區 25 = 30 頁）。 */
export function allLandingDefs(): LandingDef[] {
  const defs: LandingDef[] = [];
  for (const c of LANDING_CATEGORIES) {
    defs.push({ slug: c.slug, category: c, region: null, title: `二手${c.label}` });
    for (const r of LANDING_REGIONS) {
      defs.push({
        slug: `${c.slug}-${r.slug}`,
        category: c,
        region: r,
        title: `二手${c.label} ${r.label}`,
      });
    }
  }
  return defs;
}

export function findLandingDef(slug: string): LandingDef | null {
  return allLandingDefs().find((d) => d.slug === slug) ?? null;
}

/**
 * 商品是否屬於此落地頁。優先用正式 category/region 欄位；
 * 舊資料（無欄位）才回退 title/attributes 字串比對。
 */
export function matchesLanding(
  def: LandingDef,
  product: {
    title: string | null;
    attributes: { key: string; value: string }[];
    category?: string | null;
    region?: string | null;
  },
): boolean {
  const categoryHit = product.category
    ? product.category === def.category.slug
    : (() => {
        const text = `${product.title ?? ""} ${product.attributes.map((a) => a.value).join(" ")}`;
        return def.category.aliases.some((a) => text.includes(a));
      })();
  if (!categoryHit) return false;
  if (!def.region) return true;
  return product.region
    ? product.region === def.region.slug
    : `${product.title ?? ""} ${product.attributes.map((a) => a.value).join(" ")}`.includes(def.region.label);
}
