import { describe, expect, it } from 'vitest';
import { Bill, Card, Category, Debt, PlannerData, Transaction } from '../types';
import {
  DEFAULT_SETTINGS, billDueDatesIn, buildCyclePlan, cardDueDate, cycleBreakdown, cycleForDate, expectedBalance, getCycle, getPayday,
  projectCardUsage, suggestedCarryover, unusuallyHighBy, usualPaceBy,
} from './payCycle';
import { BALANCE_ADJUSTMENT_NOTE } from './transactions';
import { localDateInputToIso } from './date';

const smbc: Card = { id: 'amazon', name: 'Amazon Mastercard', paymentDay: 26, sortOrder: 0 };
const paypay: Card = { id: 'paypay', name: 'PayPay Card', paymentDay: 27, sortOrder: 1 };
const rent: Bill = { id: 'rent', name: 'Rent', amount: 85_000, dueDay: 'last', shift: 'none', variable: false, active: true, sortOrder: 0 };
const water: Bill = { id: 'water', name: 'Water', amount: 4_800, dueDay: 4, shift: 'none', variable: true, active: true, sortOrder: 1 };
const karate: Bill = { id: 'karate', name: 'Karate', amount: 8_000, dueDay: 27, shift: 'next', variable: false, active: true, sortOrder: 2 };

const emptyData = (): PlannerData => ({
  settings: DEFAULT_SETTINGS, cards: [], bills: [], statements: [], billPayments: [], cycles: [], cardUsage: [], cardBreakdowns: [],
});

const cash = (date: string, amount: number, category = Category.Food): Transaction => ({
  id: `${date}-${amount}`, date: localDateInputToIso(date), amount, category, description: '', type: 'expense',
});

describe('paydays', () => {
  it('uses the 20th, or the business day before it', () => {
    expect(getPayday('2026-10')).toBe('2026-10-20');
    expect(getPayday('2026-11')).toBe('2026-11-20');
    expect(getPayday('2026-12')).toBe('2026-12-18'); // Sunday
    expect(getPayday('2027-02')).toBe('2027-02-19'); // Saturday
    expect(getPayday('2027-09')).toBe('2027-09-17'); // Monday holiday
  });

  it('runs a cycle from payday to the day before the next payday', () => {
    expect(getCycle('2026-10')).toMatchObject({ start: '2026-10-20', end: '2026-11-19' });
    expect(getCycle('2026-11')).toMatchObject({ start: '2026-11-20', end: '2026-12-17' });
  });

  it('finds the cycle that contains a date', () => {
    expect(cycleForDate('2026-10-09').key).toBe('2026-09');
    expect(cycleForDate('2026-10-20').key).toBe('2026-10');
    expect(cycleForDate('2026-12-18').key).toBe('2026-12');
    expect(cycleForDate('2026-12-17').key).toBe('2026-11');
  });
});

describe('due dates', () => {
  it('pays a month of card purchases the next month, on the next business day', () => {
    expect(cardDueDate(smbc, '2026-09')).toBe('2026-10-26');
    expect(cardDueDate(paypay, '2026-09')).toBe('2026-10-27');
    expect(cardDueDate(smbc, '2026-11')).toBe('2026-12-28'); // Dec 26 is Saturday
    expect(cardDueDate(paypay, '2027-01')).toBe('2027-03-01'); // Feb 27 is Saturday
  });

  it('lists each bill once per cycle', () => {
    const cycle = getCycle('2026-10');
    expect(billDueDatesIn(rent, cycle.start, cycle.end)).toEqual(['2026-10-31']);
    expect(billDueDatesIn(water, cycle.start, cycle.end)).toEqual(['2026-11-04']);
    expect(billDueDatesIn(karate, cycle.start, cycle.end)).toEqual(['2026-10-27']);
    const december = getCycle('2026-12');
    expect(billDueDatesIn(karate, december.start, december.end)).toEqual(['2026-12-28']); // Dec 27 is Sunday
  });
});

describe('cycle plan', () => {
  const october = getCycle('2026-10');

  it('subtracts card bills, transfer bills, savings and cash spending', () => {
    const data = emptyData();
    data.cards = [smbc, paypay];
    data.bills = [rent, water, karate];
    data.statements = [
      { id: 's1', cardId: 'amazon', usageMonth: '2026-09', amount: 68_200, installment: 0, splitAmount: 0 },
      { id: 's2', cardId: 'paypay', usageMonth: '2026-09', amount: 31_500, installment: 0, splitAmount: 0 },
    ];
    data.cycles = [{ id: 'c', key: '2026-10', salary: 300_000, carryover: 12_400, savings: 20_000, checkedInAt: '' }];
    const plan = buildCyclePlan(october, {
      data, debts: [], today: '2026-10-25',
      transactions: [cash('2026-10-21', 1_200), cash('2026-10-19', 9_999), cash('2026-10-22', 5_000, Category.Savings)],
    });

    expect(plan.obligations.map((item) => [item.label, item.dueDate, item.amount])).toEqual([
      ['Amazon Mastercard', '2026-10-26', 68_200],
      ['Karate', '2026-10-27', 8_000],
      ['PayPay Card', '2026-10-27', 31_500],
      ['Rent', '2026-10-31', 85_000],
      ['Water', '2026-11-04', 4_800],
    ]);
    expect(plan.free).toBe(300_000 + 12_400 - 20_000 - 197_500);
    expect(plan.cashSpent).toBe(1_200); // Before payday and savings transfers are excluded
    expect(plan.left).toBe(plan.free - 1_200);
    expect(plan.daysLeft).toBe(26);
    expect(plan.perDay).toBe(Math.floor(plan.left / 26));
  });

  it('estimates a missing card bill from recent bills plus split installments', () => {
    const data = emptyData();
    data.cards = [smbc];
    data.statements = [
      { id: 'a', cardId: 'amazon', usageMonth: '2026-07', amount: 60_000, installment: 0, splitAmount: 0 },
      { id: 'b', cardId: 'amazon', usageMonth: '2026-08', amount: 90_000, installment: 10_000, splitAmount: 0 },
    ];
    const split: Debt = {
      id: 'd', person: 'Amazon split', amount: 30_000, description: '', dueDate: '2026-10-26T03:00:00.000Z',
      type: 'payable', debtCategory: 'Credit Card', isPaid: false, interestRate: 15, minimumPayment: 10_000, cardId: 'amazon',
    };
    const plan = buildCyclePlan(october, { data, debts: [split], transactions: [], today: '2026-10-20' });
    const bill = plan.obligations[0];
    expect(bill.estimated).toBe(true);
    // Average new purchases (60k, 80k) plus 10k principal and 375 interest.
    expect(bill.amount).toBe(70_000 + 10_375);
    expect(plan.obligations).toHaveLength(1); // The split debt is not listed separately
  });

  it('only adds an installment to bills due on or after its next payment', () => {
    const data = emptyData();
    data.cards = [smbc];
    const split: Debt = {
      id: 'd', person: 'Amazon split', amount: 30_000, description: '', dueDate: '2026-11-26T03:00:00.000Z',
      type: 'payable', debtCategory: 'Credit Card', isPaid: false, interestRate: 0, minimumPayment: 10_000, cardId: 'amazon',
    };
    const input = { data, debts: [split], transactions: [], today: '2026-10-20' };
    expect(buildCyclePlan(october, input).obligations[0].installment).toBe(0); // Oct 26 bill
    expect(buildCyclePlan(getCycle('2026-11'), input).obligations[0].installment).toBe(10_000); // Nov 26 bill
  });

  it('ignores bills and spending before a mid-cycle start', () => {
    const data = emptyData();
    data.bills = [rent, water, karate];
    data.cycles = [{ id: 'c', key: '2026-09', salary: 0, carryover: 150_000, savings: 0, trackingFrom: '2026-10-09', checkedInAt: '' }];
    const plan = buildCyclePlan(getCycle('2026-09'), {
      data, debts: [], today: '2026-10-09', transactions: [cash('2026-10-08', 3_000), cash('2026-10-09', 700)],
    });
    expect(plan.obligations).toEqual([]); // Rent Sep 30, water Oct 4 and karate Sep 28 already passed
    expect(plan.cashSpent).toBe(700);
    expect(plan.left).toBe(149_300);
    expect(plan.daysLeft).toBe(11);
  });

  it('suggests last cycle\'s leftover as the next carry-over', () => {
    const data = emptyData();
    data.cycles = [{ id: 'c', key: '2026-09', salary: 0, carryover: 150_000, savings: 0, trackingFrom: '2026-10-09', checkedInAt: '' }];
    const input = { data, debts: [], today: '2026-10-20', transactions: [cash('2026-10-12', 40_000)] };
    expect(suggestedCarryover(october, input, DEFAULT_SETTINGS)).toBe(110_000);
  });
});

describe('daily budget', () => {
  it('keeps today\'s budget fixed while spending today', () => {
    const data = emptyData();
    data.cycles = [{ id: 'c', key: '2026-09', salary: 0, carryover: 110_000, savings: 0, trackingFrom: '2026-10-09', checkedInAt: '' }];
    const morning = buildCyclePlan(getCycle('2026-09'), { data, debts: [], today: '2026-10-09', transactions: [] });
    const evening = buildCyclePlan(getCycle('2026-09'), {
      data, debts: [], today: '2026-10-09',
      transactions: [
        cash('2026-10-09', 3_000),
        { ...cash('2026-10-09', 9_000), description: BALANCE_ADJUSTMENT_NOTE },
      ],
    });
    expect(morning.perDay).toBe(10_000); // 110,000 over 11 days
    expect(evening.spentToday).toBe(3_000); // The adjustment is not today's spending
    expect(evening.perDay).toBe(Math.floor((110_000 - 12_000 + 3_000) / 11));
  });
});

describe('card usage so far', () => {
  it('adds the usual pace for the rest of the month to what is already spent', () => {
    const usage = { id: 'u', cardId: 'amazon', usageMonth: '2026-10', amount: 40_000, asOf: '2026-10-10' };
    expect(projectCardUsage(usage, 93_000)).toBe(40_000 + 63_000); // 21 of 31 days left
    expect(projectCardUsage(usage, null)).toBe(40_000);
    expect(projectCardUsage({ ...usage, asOf: '2026-11-02' }, 93_000)).toBe(40_000); // Month already over
    expect(usualPaceBy(93_000, '2026-10-10')).toBe(30_000);
  });

  it('uses the latest total for next cycle\'s card estimate', () => {
    const data = emptyData();
    data.cards = [smbc];
    data.statements = [{ id: 's', cardId: 'amazon', usageMonth: '2026-09', amount: 93_000, installment: 0, splitAmount: 0 }];
    data.cardUsage = [{ id: 'u', cardId: 'amazon', usageMonth: '2026-10', amount: 40_000, asOf: '2026-10-10' }];
    const next = buildCyclePlan(getCycle('2026-11'), { data, debts: [], transactions: [], today: '2026-10-10' });
    expect(next.obligations[0]).toMatchObject({ estimated: true, amount: 103_000 });
  });
});

describe('balance and history', () => {
  it('expects unspent money, unpaid bills and kept savings in the account', () => {
    const data = emptyData();
    data.bills = [rent];
    data.billPayments = [];
    data.cycles = [{ id: 'c', key: '2026-10', salary: 300_000, carryover: 0, savings: 20_000, checkedInAt: '' }];
    const plan = buildCyclePlan(getCycle('2026-10'), { data, debts: [], today: '2026-10-25', transactions: [cash('2026-10-21', 5_000)] });
    expect(plan.left).toBe(300_000 - 20_000 - 85_000 - 5_000);
    expect(expectedBalance(plan, true)).toBe(295_000);
    expect(expectedBalance(plan, false)).toBe(275_000);
    expect(cycleBreakdown(plan)).toEqual({ moneyIn: 300_000, bills: 85_000, cards: 0, cash: 5_000, savings: 20_000, left: 190_000 });
  });
});

describe('unusually high bills', () => {
  it('flags only bills well above the usual amount', () => {
    expect(unusuallyHighBy(130_000, 100_000)).toBe(30_000); // 30% over
    expect(unusuallyHighBy(120_000, 100_000)).toBeNull(); // 20% over is normal variation
    expect(unusuallyHighBy(14_000, 10_000)).toBeNull(); // 40% over, but only ¥4,000
    expect(unusuallyHighBy(16_000, 10_000)).toBe(6_000);
    expect(unusuallyHighBy(50_000, null)).toBeNull(); // Nothing to compare with yet
  });
});
