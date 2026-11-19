import { describe, expect, it } from 'vitest';
import { hasSplitFeeTable, splitFeePer100, splitSchedule } from './cardSplit';

describe('card split fees', () => {
  it('uses each card company\'s published fee per ¥100', () => {
    expect(splitFeePer100('Amazon Mastercard', 3)).toBe(1.68);
    expect(splitFeePer100('Amazon Mastercard', 12)).toBe(6.72);
    expect(splitFeePer100('Olive', 3)).toBe(2.46);
    expect(splitFeePer100('Olive', 10)).toBe(8.2);
    expect(hasSplitFeeTable('PayPay Card')).toBe(false);
  });

  it('matches the card company\'s own examples', () => {
    // 三井住友カード: ¥60,000 in 3 is ¥1,476 of fee and ¥20,492 a month.
    expect(splitSchedule([60_000], 3, 2.46)).toEqual({ principal: 60_000, fee: 1_476, total: 61_476, first: 20_492, monthly: 20_492 });
    // Amazon Mastercard: ¥50,000 in 10 is ¥2,800 of fee and ¥5,280 a month.
    expect(splitSchedule([50_000], 10, 5.6)).toMatchObject({ fee: 2_800, first: 5_280, monthly: 5_280 });
  });

  it('rounds the fee down and puts leftover yen in the first payment', () => {
    // What Vpass showed for ¥31,950 in 3 on Amazon Mastercard.
    expect(splitSchedule([31_950], 3, 1.68)).toEqual({ principal: 31_950, fee: 536, total: 32_486, first: 10_830, monthly: 10_828 });
    // Each purchase is rounded on its own.
    expect(splitSchedule([1_000, 1_000, 1_000], 3, 1.68)).toMatchObject({ fee: 48, first: 1_020, monthly: 1_014 });
    expect(splitSchedule([3_000], 3, 1.68)).toMatchObject({ fee: 50, first: 1_018, monthly: 1_016 });
  });

  it('charges nothing for a single payment', () => {
    expect(splitSchedule([5_000], 1, 1.68)).toEqual({ principal: 5_000, fee: 0, total: 5_000, first: 5_000, monthly: 5_000 });
  });
});
