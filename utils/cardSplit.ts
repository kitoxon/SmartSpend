// 分割払い as the card companies charge it: a flat fee per ¥100 that depends only
// on the number of payments, worked out for each purchase on its own.

// Yen of fee per ¥100 for each payment. Both published tables are a straight
// line: 3 payments cost three times this, 12 payments twelve times.
// Amazon Mastercard: 3回 1.68, 6回 3.36, 12回 6.72 (smbc-card.com, shiharaihouhou_amazon).
// Other 三井住友カード, Olive included: 3回 2.46, 6回 4.92, 12回 9.84, from April 2025.
const FEE_PLANS = [
  { match: /amazon/i, perPayment: 0.56 },
  { match: /olive|smbc|mitsui|sumitomo|三井住友/i, perPayment: 0.82 },
];
const FALLBACK_PER_PAYMENT = 0.82;

/** Whether the card's published 分割払い fees are known, rather than assumed. */
export const hasSplitFeeTable = (cardName: string) => FEE_PLANS.some((plan) => plan.match.test(cardName));

/** Fee per ¥100 for splitting into `payments` on this card. */
export const splitFeePer100 = (cardName: string, payments: number) => {
  const perPayment = FEE_PLANS.find((plan) => plan.match.test(cardName))?.perPayment ?? FALLBACK_PER_PAYMENT;
  return Math.round(perPayment * payments * 100) / 100;
};

export interface SplitSchedule {
  principal: number;
  fee: number;
  total: number; // Principal and fee
  first: number; // The first payment, which takes each purchase's leftover yen
  monthly: number; // Every payment after the first
}

/**
 * What the card company collects for purchases split into `payments`. For
 * each purchase the fee is rounded down, the monthly payment is in whole yen,
 * and what's left over goes into the first payment (端数は初回に算入).
 * ¥31,950 in 3 on Amazon Mastercard: fee ¥536, then ¥10,830 + ¥10,828 + ¥10,828.
 */
export const splitSchedule = (amounts: number[], payments: number, feePer100: number): SplitSchedule => {
  const count = Math.max(1, Math.round(payments));
  // Whole-number arithmetic, so a fee landing exactly on a yen isn't rounded down by a float.
  const feeHundredths = Math.max(0, Math.round(feePer100 * 100));
  const schedule = { principal: 0, fee: 0, total: 0, first: 0, monthly: 0 };
  for (const amount of amounts) {
    if (amount <= 0) continue;
    const fee = count > 1 ? Math.floor((amount * feeHundredths) / 10_000) : 0;
    const monthly = Math.floor((amount + fee) / count);
    schedule.principal += amount;
    schedule.fee += fee;
    schedule.total += amount + fee;
    schedule.monthly += monthly;
    schedule.first += amount + fee - monthly * (count - 1);
  }
  return schedule;
};
