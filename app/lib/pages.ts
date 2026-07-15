/**
 * 靜態法遵/資訊頁內容（台灣電商必備）。純資料，頁面元件共用。
 * 佔位處（【】）待 owner 填公司資訊；先給合理預設，可在此檔改。
 */

export interface InfoSection {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
}

export interface InfoPage {
  slug: string;
  title: string;
  description: string;
  sections: InfoSection[];
}

export const COMPANY = {
  name: "JBG OS · 餐飲二手設備撮合直送",
  contactEmail: "【請填聯絡 Email】",
  contactLine: "【請填 LINE ID】",
  serviceArea: "台中以北（台北、新北、桃園、新竹、台中）",
};

export const INFO_PAGES: InfoPage[] = [
  {
    slug: "about",
    title: "關於我們",
    description: "北台灣餐飲二手設備撮合直送平台 —— 資訊最流通、價格最低、可驗收附保固。",
    sections: [
      {
        heading: "我們在做什麼",
        paragraphs: [
          "我們是專注於北台灣的餐飲二手設備撮合直送平台，供應製冰機、商用冰箱、洗碗機、爐具、不鏽鋼設備等。用系統化的方式把每一台設備的規格、成色、瑕疵、可驗收項結構化呈現，讓開店的你用更低的成本、更透明的資訊買到對的設備。",
        ],
      },
      {
        heading: "我們的三個承諾",
        paragraphs: [],
        bullets: [
          "結構化狀態紀錄：每台設備的規格、外觀、瑕疵、可驗收項都寫清楚，透明取代眼見為憑。",
          "款項代管履約：款項先由平台代管，設備送達、驗收無誤才撥付賣方。",
          "可到府安裝、附驗收：大型設備媒合搬運與安裝，交機前完成基本檢測。",
        ],
      },
      {
        heading: "服務範圍",
        paragraphs: [`目前服務區域：${COMPANY.serviceArea}。其他地區可來訊詢問是否可安排配送。`],
      },
    ],
  },
  {
    slug: "returns",
    title: "退換貨與驗收政策",
    description: "二手設備驗收標準、鑑賞期、退換貨與爭議處理流程。",
    sections: [
      {
        heading: "驗收標準",
        paragraphs: [
          "每筆交易於商品頁與訂單載明「可驗收項」（例如：製冰機的製冰量與排水、冰箱的到溫與門封、爐具的火力與管線）。設備送達時請依可驗收項當場檢查，確認符合描述。",
        ],
      },
      {
        heading: "鑑賞期與退換貨",
        paragraphs: [
          "二手設備係中古品、非全新品，恕不適用《消費者保護法》七天鑑賞期之無條件退貨。惟若交付之設備與商品頁載明之規格、成色或可驗收項有重大不符，買方得於交付後七日內提出退換貨。",
        ],
        bullets: [
          "退換貨以「與描述不符」為要件，並須提供照片或影片佐證。",
          "屬正常使用痕跡、已於商品頁揭露之瑕疵，不在退換貨範圍。",
          "客製化安裝、已改裝或人為損壞者，不接受退換貨。",
        ],
      },
      {
        heading: "款項代管與撥款",
        paragraphs: [
          "買方款項先由平台代管；設備送達並完成驗收無誤後，款項始撥付賣方。若驗收發現重大不符且成立退貨，代管款項將退還買方。",
        ],
      },
      {
        heading: "爭議處理",
        paragraphs: [
          `對驗收結果有爭議時，以商品頁之結構化狀態紀錄與可驗收項為認定依據，由平台居中協調。如需協助請聯繫：${COMPANY.contactEmail}／LINE ${COMPANY.contactLine}。`,
        ],
      },
    ],
  },
  {
    slug: "privacy",
    title: "隱私權政策",
    description: "我們如何蒐集、使用與保護您的個人資料。",
    sections: [
      {
        heading: "蒐集的資料",
        paragraphs: [
          "當您透過本站詢問或下單時，我們會蒐集您主動提供的聯絡資訊（如稱呼、聯絡方式）與詢問內容，用以回覆與履行交易。瀏覽網站時可能蒐集必要的技術性資訊（如頁面瀏覽紀錄）以維持服務運作。",
        ],
      },
      {
        heading: "資料的使用",
        paragraphs: [],
        bullets: [
          "回覆您的詢問、安排看貨、配送與售後服務。",
          "改善商品資訊與網站體驗。",
          "非經您同意，不會將您的個人資料販售或提供給無關第三方。",
        ],
      },
      {
        heading: "資料保護與您的權利",
        paragraphs: [
          `我們採取合理的技術與管理措施保護您的資料。您可隨時要求查詢、更正或刪除您的個人資料，請來信：${COMPANY.contactEmail}。`,
          "本站可能使用第三方服務（如客服、金流、廣告成效衡量）以提供功能，該等服務有其各自之隱私政策。",
        ],
      },
    ],
  },
  {
    slug: "contact",
    title: "聯絡我們",
    description: "詢問設備、洽談貨源、售後服務的聯絡方式。",
    sections: [
      {
        heading: "聯絡方式",
        paragraphs: ["有任何設備需求、貨源合作或售後問題，歡迎透過以下方式聯繫，我們會盡快回覆。"],
        bullets: [
          `Email：${COMPANY.contactEmail}`,
          `LINE：${COMPANY.contactLine}`,
          `服務區域：${COMPANY.serviceArea}`,
        ],
      },
      {
        heading: "找特定設備？",
        paragraphs: [
          "倉裡沒有的品項，我們有貨源網絡可調貨、賣家直送。把你要的品項、規格、預算與地區告訴我們，讓我們替你媒合。",
        ],
      },
    ],
  },
];

export function findInfoPage(slug: string): InfoPage | null {
  return INFO_PAGES.find((p) => p.slug === slug) ?? null;
}
