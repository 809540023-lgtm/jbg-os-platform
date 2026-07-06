/**
 * Money value object —— docs/00 §0.10：金額一律整數（最小貨幣單位）+ ISO-4217 currency。
 * 禁用 float 存錢。
 */
export interface Money {
  /** 整數，最小貨幣單位（TWD 以「元」為最小單位時即為元；JPY 為円）。 */
  readonly amount: number;
  /** ISO-4217，3 碼大寫。 */
  readonly currency: string;
}

export function money(amount: number, currency: string): Money {
  if (!Number.isInteger(amount)) {
    throw new Error(`Money.amount 必須為整數，收到 ${amount}`);
  }
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error(`Money.currency 必須為 ISO-4217 3 碼大寫，收到 "${currency}"`);
  }
  return { amount, currency };
}

export function addMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) {
    throw new Error(`幣別不同無法相加：${a.currency} vs ${b.currency}`);
  }
  return money(a.amount + b.amount, a.currency);
}
