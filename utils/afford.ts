import { Card, PlannerSettings } from '../types';
import { CyclePlan, cardDueDate, cycleForDate } from './payCycle';
import { LocalDate, monthKeyOf, monthsBetween, shiftMonthKey } from './jpCalendar';

// "Can I afford this?": a purchase tried out against the coming pay cycles,
// without saving anything.

export const DEFAULT_CUSHION = 20_000;
const MIN_CYCLES = 3;

export type PayWith =
  | { kind: 'cash' }
  // payments 1 is the card's usual pay-in-full; rate is yearly interest in percent, for splits.
  | { kind: 'card'; card: Card; payments: number; rate: number };

export interface PurchasePayment {
  dueDate: LocalDate;
  amount: number; // Principal and interest
  interest: number;
}

export type Verdict = 'affordable' | 'tight' | 'short';

export interface CycleOutlook {
  plan: CyclePlan;
  cushion: number; // For the current cycle, only the part for the days left
  before: number; // Left to spend without the purchase
  after: number;
  payments: PurchasePayment[]; // The purchase's payments due in this cycle
  estimated: boolean; // Uses an estimated salary or estimated bills
}

export interface Affordability {
  cycles: CycleOutlook[];
  worst: CycleOutlook; // Lowest after the purchase, against its cushion
  verdict: Verdict; // From the cycles the purchase changes
  alreadyShort: CycleOutlook | null; // The lowest cycle that's short even without the purchase
  interest: number;
}

/**
 * When the purchase leaves the account. Cash or debit: today. On a card:
 * with the bill for this month's purchases, or split into equal parts from
 * that bill on, each adding a month's interest on what's still owed.
 */
export const purchasePayments = (price: number, payWith: PayWith, today: LocalDate): PurchasePayment[] => {
  if (payWith.kind === 'cash') return [{ dueDate: today, amount: price, interest: 0 }];
  const usageMonth = monthKeyOf(today);
  const count = Math.max(1, Math.round(payWith.payments));
  const part = Math.ceil(price / count);
  let owed = price;
  return Array.from({ length: count }, (_, index) => {
    const principal = index === count - 1 ? owed : Math.min(part, owed);
    const interest = count > 1 ? Math.round((owed * payWith.rate) / 100 / 12) : 0;
    owed -= principal;
    return { dueDate: cardDueDate(payWith.card, shiftMonthKey(usageMonth, index)), amount: principal + interest, interest };
  });
};

/** The cycles to check: from the current one to the last payment's, and at least three. */
export const cycleKeysToCheck = (currentKey: string, payments: PurchasePayment[], settings: PlannerSettings) => {
  const lastDue = payments.map((payment) => payment.dueDate).sort().at(-1);
  const reach = lastDue ? monthsBetween(currentKey, cycleForDate(lastDue, settings).key) + 1 : 0;
  return Array.from({ length: Math.max(MIN_CYCLES, reach) }, (_, index) => shiftMonthKey(currentKey, index));
};

/**
 * What's left to spend in each cycle, before and after the purchase. The
 * current cycle starts from what's left now; later ones from their free
 * money, with the latest salary where none is known yet. Leftover money is
 * assumed spent, but a shortfall comes out of the next cycle.
 */
export const checkAffordability = (plans: CyclePlan[], payments: PurchasePayment[], salaryEstimate: number, cushion: number): Affordability => {
  let shortBefore = 0;
  let shortAfter = 0;
  const cycles = plans.map((plan): CycleOutlook => {
    const current = plan.status === 'current';
    const salary = !plan.record && plan.salary === 0 ? salaryEstimate : plan.salary;
    const base = current ? plan.left : plan.free - plan.salary + salary;
    const due = payments.filter((payment) => payment.dueDate >= plan.cycle.start && payment.dueDate <= plan.cycle.end);
    const before = base + shortBefore;
    const after = base - due.reduce((sum, payment) => sum + payment.amount, 0) + shortAfter;
    shortBefore = Math.min(0, before);
    shortAfter = Math.min(0, after);
    return {
      plan,
      cushion: current && plan.daysTotal > 0 ? Math.round((cushion * plan.daysLeft) / plan.daysTotal) : cushion,
      before,
      after,
      payments: due,
      estimated: !plan.record || plan.obligations.some((obligation) => !obligation.paid && obligation.estimated),
    };
  });
  // Judge the purchase by the cycles it changes: one that's short anyway says nothing about it.
  const changed = cycles.filter((cycle) => cycle.after !== cycle.before);
  const judged = changed.length ? changed : cycles;
  const verdict: Verdict = judged.some((cycle) => cycle.after < 0) ? 'short' : judged.some((cycle) => cycle.after < cycle.cushion) ? 'tight' : 'affordable';
  // Short: the lowest balance. Otherwise: the cycle closest to (or furthest below) its cushion.
  const shortfall = (cycle: CycleOutlook) => (verdict === 'short' ? cycle.after : cycle.after - cycle.cushion);
  const worst = judged.reduce((low, cycle) => (shortfall(cycle) < shortfall(low) ? cycle : low));
  const lowestBefore = cycles.reduce((low, cycle) => (cycle.before < low.before ? cycle : low));
  return {
    cycles,
    worst,
    verdict,
    alreadyShort: lowestBefore.before < 0 ? lowestBefore : null,
    interest: payments.reduce((sum, payment) => sum + payment.interest, 0),
  };
};
