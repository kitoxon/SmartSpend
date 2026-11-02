import { describe, expect, it } from 'vitest';
import { Card, PayCycleRecord } from '../types';
import { CyclePlan, getCycle } from './payCycle';
import { checkAffordability, cycleKeysToCheck, purchasePayments } from './afford';

const olive: Card = { id: 'olive', name: 'Olive', paymentDay: 26, sortOrder: 0 };
const settings = { paydayDay: 20, defaultSavings: 0 };
const today = '2026-11-02'; // In the cycle from Tue Oct 20 to Thu Nov 19

const record = { id: 'cycle', key: '2026-10', salary: 170_000, carryover: 0, savings: 0, checkedInAt: '' } as PayCycleRecord;

/** The parts of a plan the check reads. */
const plan = (key: string, fields: Partial<CyclePlan>): CyclePlan => ({
  cycle: getCycle(key, settings), record: null, status: 'future', salary: 0, free: 0, left: 0,
  daysLeft: 31, daysTotal: 31, obligations: [], ...fields,
} as CyclePlan);

describe('purchase payments', () => {
  it('pays cash today and a card with the next bill', () => {
    expect(purchasePayments(30_000, { kind: 'cash' }, today)).toEqual([{ dueDate: today, amount: 30_000, interest: 0 }]);
    // November purchases are paid on Dec 26, a Saturday, so Monday Dec 28.
    expect(purchasePayments(30_000, { kind: 'card', card: olive, payments: 1, rate: 15 }, today))
      .toEqual([{ dueDate: '2026-12-28', amount: 30_000, interest: 0 }]);
  });

  it('splits from that bill on, with interest on what is still owed', () => {
    expect(purchasePayments(30_000, { kind: 'card', card: olive, payments: 3, rate: 15 }, today)).toEqual([
      { dueDate: '2026-12-28', amount: 10_375, interest: 375 },
      { dueDate: '2027-01-26', amount: 10_250, interest: 250 },
      { dueDate: '2027-02-26', amount: 10_125, interest: 125 },
    ]);
  });

  it('checks every cycle until the last payment, and at least three', () => {
    expect(cycleKeysToCheck('2026-10', purchasePayments(5_000, { kind: 'cash' }, today), settings)).toEqual(['2026-10', '2026-11', '2026-12']);
    const split = purchasePayments(60_000, { kind: 'card', card: olive, payments: 6, rate: 15 }, today);
    expect(cycleKeysToCheck('2026-10', split, settings).at(-1)).toBe('2027-05'); // Paid May 26, after the May 20 payday
  });
});

describe('affordability', () => {
  const plans = [
    plan('2026-10', { status: 'current', record, salary: 170_000, left: 31_000, daysLeft: 18, daysTotal: 31 }),
    plan('2026-11', { salary: 170_000, free: 40_000 }), // Salary from this cycle's check-in
    plan('2026-12', { salary: 0, free: -130_000 }), // No salary known yet: 170,000 is estimated
  ];

  it('is affordable when every cycle keeps its cushion', () => {
    const result = checkAffordability(plans, purchasePayments(5_000, { kind: 'cash' }, today), 170_000, 20_000);
    expect(result.cycles.map((cycle) => [cycle.before, cycle.after])).toEqual([[31_000, 26_000], [40_000, 40_000], [40_000, 40_000]]);
    expect(result.verdict).toBe('affordable');
  });

  it('only asks the current cycle to keep the cushion for the days left', () => {
    // 18 of 31 days left: a cushion of 11,613, not 20,000.
    const result = checkAffordability(plans, purchasePayments(18_000, { kind: 'cash' }, today), 170_000, 20_000);
    expect(result.cycles[0].cushion).toBe(11_613);
    expect(result.verdict).toBe('affordable');
    expect(checkAffordability(plans, purchasePayments(20_000, { kind: 'cash' }, today), 170_000, 20_000).verdict).toBe('tight');
  });

  it('puts a card purchase in the cycle its bill is paid in', () => {
    const result = checkAffordability(plans, purchasePayments(50_000, { kind: 'card', card: olive, payments: 1, rate: 15 }, today), 170_000, 20_000);
    expect(result.cycles.map((cycle) => cycle.after)).toEqual([31_000, 40_000, -10_000]);
    expect(result.verdict).toBe('short');
    expect(result.worst.plan.cycle.key).toBe('2026-12');
  });

  it('judges the purchase by the cycles it changes', () => {
    const short = [{ ...plans[0], left: -2_000 }, ...plans.slice(1)];
    const result = checkAffordability(short, purchasePayments(10_000, { kind: 'card', card: olive, payments: 1, rate: 15 }, today), 170_000, 20_000);
    expect(result.verdict).toBe('affordable'); // December keeps 30,000 after the bill
    expect(result.alreadyShort?.plan.cycle.key).toBe('2026-10'); // Short without it, said separately
  });

  it('takes a shortfall out of the next cycle', () => {
    const result = checkAffordability(plans, purchasePayments(36_000, { kind: 'cash' }, today), 170_000, 20_000);
    expect(result.cycles.map((cycle) => cycle.after)).toEqual([-5_000, 35_000, 40_000]);
    expect(result.worst.plan.cycle.key).toBe('2026-10');
  });
});
