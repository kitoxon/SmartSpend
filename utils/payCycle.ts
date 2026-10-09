import {
  Bill, BillPayment, Card, CardStatement, CardUsage, Category, Debt, PayCycleRecord, PlannerData, PlannerSettings, Transaction,
} from '../types';
import {
  LocalDate, addDays, dayOfMonth, daysInMonth, diffDays, fromDate, monthKeyOf, parseLocalDate, shiftMonthKey, shiftToBusinessDay,
} from './jpCalendar';
import { cashOutflowFor, isBalanceAdjustment } from './transactions';

export interface PayCycle {
  key: string; // Payday month, 'YYYY-MM'
  payday: LocalDate;
  start: LocalDate;
  end: LocalDate; // Day before the next payday
}

export const DEFAULT_SETTINGS: PlannerSettings = { paydayDay: 20, defaultSavings: 0 };

/** Salary arrives on the payday, or the business day before it. */
export const getPayday = (monthKey: string, settings: PlannerSettings = DEFAULT_SETTINGS) =>
  shiftToBusinessDay(dayOfMonth(monthKey, settings.paydayDay), 'previous');

export const getCycle = (key: string, settings: PlannerSettings = DEFAULT_SETTINGS): PayCycle => {
  const payday = getPayday(key, settings);
  return { key, payday, start: payday, end: addDays(getPayday(shiftMonthKey(key, 1), settings), -1) };
};

export const cycleForDate = (date: LocalDate, settings: PlannerSettings = DEFAULT_SETTINGS) => {
  const sameMonth = getCycle(monthKeyOf(date), settings);
  return date >= sameMonth.start ? sameMonth : getCycle(shiftMonthKey(sameMonth.key, -1), settings);
};

export const isWithin = (date: LocalDate, start: LocalDate, end: LocalDate) => date >= start && date <= end;

/** Card bills for a month's purchases are paid the next month, moved to the next business day. */
export const cardDueDate = (card: Pick<Card, 'paymentDay'>, usageMonth: string) =>
  shiftToBusinessDay(dayOfMonth(shiftMonthKey(usageMonth, 1), card.paymentDay), 'next');

/** Purchase months whose card bill falls inside the cycle (normally exactly one). */
export const usageMonthsDueIn = (card: Card, cycle: PayCycle) =>
  [-2, -1, 0]
    .map((offset) => shiftMonthKey(cycle.key, offset))
    .filter((usageMonth) => isWithin(cardDueDate(card, usageMonth), cycle.start, cycle.end));

export const billDueDatesIn = (bill: Bill, start: LocalDate, end: LocalDate) => {
  const dates: LocalDate[] = [];
  // Look one month either side so a business-day shift across the boundary is still found.
  for (let month = shiftMonthKey(monthKeyOf(start), -1); month <= shiftMonthKey(monthKeyOf(end), 1); month = shiftMonthKey(month, 1)) {
    const due = shiftToBusinessDay(dayOfMonth(month, bill.dueDay), bill.shift);
    if (isWithin(due, start, end)) dates.push(due);
  }
  return dates;
};

export const statementId = (cardId: string, usageMonth: string) => `statement:${cardId}:${usageMonth}`;
export const billPaymentId = (billId: string, dueDate: LocalDate) => `billpay:${billId}:${dueDate}`;
export const cycleRecordId = (key: string) => `cycle:${key}`;

export const monthlyInterest = (debt: Pick<Debt, 'amount' | 'interestRate'>) =>
  Math.round(debt.amount * ((debt.interestRate ?? 0) / 100 / 12));

export const scheduledPrincipal = (debt: Pick<Debt, 'amount' | 'minimumPayment'>) =>
  Math.min(debt.amount, debt.minimumPayment ?? debt.amount);

const isActiveDebt = (debt: Debt) => !debt.isPaid && debt.amount > 0;

/** Split debts on a card whose next installment is collected with the bill due on `billDueDate`. */
export const installmentDebtsFor = (cardId: string, debts: Debt[], billDueDate: LocalDate) => debts.filter((debt) => {
  if (debt.cardId !== cardId || !isActiveDebt(debt)) return false;
  const nextInstallment = new Date(debt.dueDate);
  return !Number.isNaN(nextInstallment.getTime()) && fromDate(nextInstallment) <= billDueDate;
});

/** What a card's split debts add to the bill due on `billDueDate`: principal plus interest. */
export const scheduledInstallment = (cardId: string, debts: Debt[], billDueDate: LocalDate) => installmentDebtsFor(cardId, debts, billDueDate)
  .reduce((sum, debt) => sum + scheduledPrincipal(debt) + monthlyInterest(debt), 0);

/** Average new purchases on a card over its last three bills before `usageMonth`. */
export const averageCardUsage = (cardId: string, statements: CardStatement[], usageMonth: string) => {
  const recent = statements
    .filter((statement) => statement.cardId === cardId && statement.usageMonth < usageMonth)
    .sort((a, b) => b.usageMonth.localeCompare(a.usageMonth))
    .slice(0, 3);
  if (!recent.length) return null;
  return Math.round(recent.reduce((sum, statement) => sum + statement.amount - statement.installment, 0) / recent.length);
};

export const cardUsageId = (cardId: string, usageMonth: string) => `usage:${cardId}:${usageMonth}`;
export const cardBreakdownId = (cardId: string, usageMonth: string) => `breakdown:${cardId}:${usageMonth}`;

/**
 * Expected month-end purchases from a "used so far" total: what is already
 * spent, plus the card's usual pace for the days still left in the month.
 */
export const projectCardUsage = (usage: CardUsage, average: number | null) => {
  const [year, month] = usage.usageMonth.split('-').map(Number);
  const days = daysInMonth(year, month);
  const asOfDay = monthKeyOf(usage.asOf) === usage.usageMonth ? parseLocalDate(usage.asOf).day : usage.asOf > usage.usageMonth ? days : 0;
  return Math.round(usage.amount + (average ?? 0) * (days - asOfDay) / days);
};

/** The card's usual spending expected by `date` within the month, for pace comparisons. */
export const usualPaceBy = (average: number, date: LocalDate) => {
  const { year, month, day } = parseLocalDate(date);
  return Math.round((average * day) / daysInMonth(year, month));
};

/**
 * How far a month of purchases is above the card's usual, when it's notably
 * high (at least ¥5,000 and 25% over); otherwise null.
 */
export const unusuallyHighBy = (purchases: number, usual: number | null) => {
  if (usual === null) return null;
  const excess = purchases - usual;
  return excess >= Math.max(5_000, usual * 0.25) ? excess : null;
};

export const lastCardBill = (cardId: string, statements: CardStatement[], usageMonth: string) => statements
  .filter((statement) => statement.cardId === cardId && statement.usageMonth < usageMonth)
  .sort((a, b) => b.usageMonth.localeCompare(a.usageMonth))[0]?.amount ?? null;

export type ObligationKind = 'card' | 'bill' | 'debt';

export interface Obligation {
  key: string;
  kind: ObligationKind;
  refId: string;
  label: string;
  dueDate: LocalDate;
  amount: number; // Cash leaving the account this cycle
  estimated: boolean;
  needsAmount: boolean; // Estimated, with nothing to estimate from
  paid: boolean;
  usageMonth?: string;
  statement?: CardStatement;
  billPayment?: BillPayment;
  usage?: CardUsage; // Latest "used so far" total behind an estimated card bill
  usual: number | null; // Card's average purchases over its previous bills
  installment: number;
  splitAmount: number;
}

export interface CyclePlan {
  cycle: PayCycle;
  record: PayCycleRecord | null;
  status: 'past' | 'current' | 'future';
  countFrom: LocalDate;
  salary: number;
  carryover: number;
  savings: number;
  otherIncome: number;
  obligations: Obligation[];
  obligationsTotal: number;
  unpaidTotal: number;
  free: number; // After every bill and savings, before cash spending
  cashSpent: number;
  left: number;
  cashTransactions: Transaction[];
  spentToday: number;
  daysTotal: number;
  dayNumber: number;
  daysLeft: number; // Including today
  perDay: number; // Today's budget: what was left this morning, spread over the days left
}

export interface PlanInput {
  data: PlannerData;
  debts: Debt[];
  transactions: Transaction[];
  today: LocalDate;
}

const localDateOfTransaction = (transaction: Transaction) => {
  const date = new Date(transaction.date);
  return Number.isNaN(date.getTime()) ? null : fromDate(date);
};

const cardObligations = (cycle: PayCycle, countFrom: LocalDate, isPast: boolean, input: PlanInput): Obligation[] => {
  const { cards, statements } = input.data;
  const obligations: Obligation[] = [];
  for (const card of cards) {
    if (card.archived) continue;
    for (const usageMonth of usageMonthsDueIn(card, cycle)) {
      const dueDate = cardDueDate(card, usageMonth);
      if (dueDate < countFrom) continue;
      const statement = statements.find((item) => item.cardId === card.id && item.usageMonth === usageMonth);
      if (statement) {
        obligations.push({
          key: `card:${card.id}:${usageMonth}`, kind: 'card', refId: card.id, label: card.name, dueDate,
          amount: statement.amount - statement.splitAmount, estimated: false, needsAmount: false,
          paid: Boolean(statement.paidAt), usageMonth, statement, usual: averageCardUsage(card.id, statements, usageMonth),
          installment: statement.installment, splitAmount: statement.splitAmount,
        });
        continue;
      }
      // Split debts only exist from now on, so they cannot explain an old bill.
      const installment = isPast ? 0 : scheduledInstallment(card.id, input.debts, dueDate);
      const average = averageCardUsage(card.id, statements, usageMonth);
      const usage = input.data.cardUsage.find((item) => item.cardId === card.id && item.usageMonth === usageMonth);
      const purchases = usage ? projectCardUsage(usage, average) : average;
      obligations.push({
        key: `card:${card.id}:${usageMonth}`, kind: 'card', refId: card.id, label: card.name, dueDate,
        amount: (purchases ?? 0) + installment, estimated: true, needsAmount: purchases === null,
        paid: false, usageMonth, usage, usual: average, installment, splitAmount: 0,
      });
    }
  }
  return obligations;
};

const billObligations = (cycle: PayCycle, countFrom: LocalDate, input: PlanInput): Obligation[] => {
  const { bills, billPayments } = input.data;
  return bills.filter((bill) => bill.active).flatMap((bill) =>
    billDueDatesIn(bill, countFrom, cycle.end).map((dueDate) => {
      const payment = billPayments.find((item) => item.billId === bill.id && item.dueDate === dueDate);
      const amount = payment?.amount ?? bill.amount;
      const estimated = bill.variable && !payment?.confirmed;
      return {
        key: `bill:${bill.id}:${dueDate}`, kind: 'bill' as const, refId: bill.id, label: bill.name, dueDate,
        amount, estimated, needsAmount: estimated && amount <= 0, paid: Boolean(payment?.paidAt),
        billPayment: payment, usual: null, installment: 0, splitAmount: 0,
      };
    }));
};

/** Debts not tied to a card are paid on their own due date. Paying one records a cash expense. */
const debtObligations = (cycle: PayCycle, countFrom: LocalDate, status: CyclePlan['status'], input: PlanInput): Obligation[] => input.debts
  .filter((debt) => isActiveDebt(debt) && !debt.cardId)
  .flatMap((debt) => {
    const due = new Date(debt.dueDate);
    if (Number.isNaN(due.getTime())) return [];
    const dueDate = fromDate(due);
    const overdue = status === 'current' && dueDate < countFrom;
    if (!overdue && !isWithin(dueDate, countFrom, cycle.end)) return [];
    return [{
      key: `debt:${debt.id}`, kind: 'debt' as const, refId: debt.id, label: debt.person, dueDate,
      amount: scheduledPrincipal(debt) + monthlyInterest(debt), estimated: false, needsAmount: false,
      paid: false, usual: null, installment: 0, splitAmount: 0,
    }];
  });

export const buildCyclePlan = (cycle: PayCycle, input: PlanInput): CyclePlan => {
  const { data, transactions, today } = input;
  const record = data.cycles.find((item) => item.key === cycle.key) ?? null;
  const status = today < cycle.start ? 'future' : today > cycle.end ? 'past' : 'current';
  const countFrom = record?.trackingFrom && record.trackingFrom > cycle.start ? record.trackingFrom : cycle.start;

  const obligations = [
    ...cardObligations(cycle, countFrom, status === 'past', input),
    ...billObligations(cycle, countFrom, input),
    ...debtObligations(cycle, countFrom, status, input),
  ].sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.label.localeCompare(b.label));

  const cashTransactions = transactions.filter((transaction) => {
    const date = localDateOfTransaction(transaction);
    return date !== null && isWithin(date, countFrom, cycle.end);
  });
  const cashSpent = cashTransactions.reduce((sum, transaction) => sum + cashOutflowFor(transaction), 0);
  // Balance adjustments cover earlier days and debt payments were planned as bills,
  // so neither uses up today's budget.
  const spentToday = cashTransactions
    .filter((transaction) => localDateOfTransaction(transaction) === today && !isBalanceAdjustment(transaction) && transaction.category !== Category.Debt)
    .reduce((sum, transaction) => sum + cashOutflowFor(transaction), 0);
  // Salary is entered at check-in; any other income adds to the cycle.
  const otherIncome = cashTransactions
    .filter((transaction) => transaction.type === 'income' && transaction.category !== Category.Salary)
    .reduce((sum, transaction) => sum + transaction.amount, 0);

  const previous = record ? null : data.cycles.find((item) => item.key === shiftMonthKey(cycle.key, -1));
  const salary = record?.salary ?? previous?.salary ?? 0;
  const carryover = record?.carryover ?? 0;
  const savings = record?.savings ?? data.settings.defaultSavings;

  const obligationsTotal = obligations.reduce((sum, item) => sum + item.amount, 0);
  const unpaidTotal = obligations.filter((item) => !item.paid).reduce((sum, item) => sum + item.amount, 0);
  const free = carryover + salary + otherIncome - savings - obligationsTotal;
  const left = free - cashSpent;

  const daysTotal = diffDays(cycle.start, cycle.end) + 1;
  const dayNumber = status === 'future' ? 0 : status === 'past' ? daysTotal : diffDays(cycle.start, today) + 1;
  const daysLeft = status === 'future' ? daysTotal : status === 'past' ? 0 : diffDays(today, cycle.end) + 1;
  // Fixed for the whole day, so spending today doesn't shrink today's own budget.
  const perDay = daysLeft > 0 ? Math.floor(Math.max(0, left + (status === 'current' ? spentToday : 0)) / daysLeft) : 0;

  return {
    cycle, record, status, countFrom, salary, carryover, savings, otherIncome, obligations, obligationsTotal,
    unpaidTotal, free, cashSpent, left, cashTransactions, spentToday, daysTotal, dayNumber, daysLeft, perDay,
  };
};

/**
 * What should be in the account right now: everything not yet spent or paid.
 * Savings count only while they stay in the spending account.
 */
export const expectedBalance = (plan: CyclePlan, savingsInAccount: boolean) =>
  plan.left + plan.unpaidTotal + (savingsInAccount ? plan.savings : 0);

export interface CycleBreakdown {
  moneyIn: number;
  bills: number; // Transfer bills and debt payments
  cards: number;
  cash: number;
  savings: number;
  left: number;
}

/** Where a cycle's money went, for history charts. */
export const cycleBreakdown = (plan: CyclePlan): CycleBreakdown => {
  const cards = plan.obligations.filter((item) => item.kind === 'card').reduce((sum, item) => sum + item.amount, 0);
  return {
    moneyIn: plan.carryover + plan.salary + plan.otherIncome,
    bills: plan.obligationsTotal - cards,
    cards,
    cash: plan.cashSpent,
    savings: plan.savings,
    left: plan.left,
  };
};

/** Money expected to be left when the previous cycle ends — the default carry-over at check-in. */
export const suggestedCarryover = (cycle: PayCycle, input: PlanInput, settings: PlannerSettings) => {
  const previous = buildCyclePlan(getCycle(shiftMonthKey(cycle.key, -1), settings), input);
  return previous.record ? Math.max(0, previous.left) : null;
};
