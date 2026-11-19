import {
  Bill, BillPayment, Card, CardBreakdown, CardSplitPlan, CardStatement, CardUsage, Debt, PayCycleRecord, PlannerData, PlannerSettings, SplitLine,
} from '../types';
import type { PlannerRecord } from './storageService';
import { DEFAULT_SETTINGS, cardDueDate, installmentDebtsFor, scheduledInstallment, scheduledPrincipal, statementId } from '../utils/payCycle';
import { shiftMonthKey, toDate } from '../utils/jpCalendar';
import { addMonthsClamped } from '../utils/date';
import { formatMonthName, formatYen } from '../utils/format';
import { splitSchedule } from '../utils/cardSplit';

export const SETTINGS_RECORD_ID = 'settings';

const bySortOrder = (a: { sortOrder: number }, b: { sortOrder: number }) => a.sortOrder - b.sortOrder;

export const toPlannerData = (records: PlannerRecord[]): PlannerData => {
  const ofKind = <T,>(kind: PlannerRecord['kind']) => records.filter((record) => record.kind === kind).map((record) => record.data as T);
  const settings = records.find((record) => record.kind === 'settings')?.data as Partial<PlannerSettings> | undefined;
  return {
    settings: { ...DEFAULT_SETTINGS, ...settings },
    cards: ofKind<Card>('card').sort(bySortOrder),
    bills: ofKind<Bill>('bill').sort(bySortOrder),
    statements: ofKind<CardStatement>('statement'),
    billPayments: ofKind<BillPayment>('bill_payment'),
    cycles: ofKind<PayCycleRecord>('cycle'),
    cardUsage: ofKind<CardUsage>('card_usage'),
    cardBreakdowns: ofKind<CardBreakdown>('card_breakdown'),
  };
};

export const isPlannerConfigured = (data: PlannerData) =>
  data.cards.some((card) => !card.archived) || data.bills.some((bill) => bill.active);

/** Starting point for the first setup, based on how this household pays its bills. */
export const suggestedSetup = (): { cards: Card[]; bills: Bill[] } => ({
  cards: [
    { id: crypto.randomUUID(), name: 'Amazon Mastercard', paymentDay: 26, sortOrder: 0 },
    { id: crypto.randomUUID(), name: 'Olive', paymentDay: 26, sortOrder: 1 },
    { id: crypto.randomUUID(), name: 'PayPay Card', paymentDay: 27, sortOrder: 2 },
  ],
  bills: [
    { id: crypto.randomUUID(), name: 'Rent', amount: 0, dueDay: 'last', shift: 'none', variable: false, active: true, sortOrder: 0 },
    { id: crypto.randomUUID(), name: 'Water', amount: 0, dueDay: 4, shift: 'none', variable: true, active: true, sortOrder: 1 },
    { id: crypto.randomUUID(), name: 'Karate', amount: 0, dueDay: 27, shift: 'next', variable: false, active: true, sortOrder: 2 },
  ],
});

export interface CardSplitInput {
  amount: number; // Purchases moved out of this bill
  months: number;
  feePer100: number; // The card's fee per ¥100 for this many payments
  // The first installment is paid with this same bill (SMBC's あとから分割 works this
  // way: the purchase is treated as split from the start) instead of the next one.
  startsThisBill: boolean;
  lines?: SplitLine[]; // The purchases chosen; fees are worked out for each one
}

// 'keep' leaves the bill's split as it was saved: one from before fees came from the card's table.
export type CardSplit = CardSplitInput | 'keep' | null;

export const splitScheduleFor = (split: CardSplitInput) =>
  splitSchedule(split.lines?.length ? split.lines.map((line) => line.amount) : [split.amount], split.months, split.feePer100);

/** What a split changes on the bill it's made on: purchases moved out, and the first installment paid when it starts there. */
export const splitOnBill = (split: CardSplit, existing?: CardStatement) => {
  if (split === 'keep') return { moved: existing?.splitAmount ?? 0, first: existing?.splitFirstPayment ?? 0 };
  if (!split || split.amount <= 0) return { moved: 0, first: 0 };
  return { moved: split.amount, first: split.startsThisBill ? splitScheduleFor(split).first : 0 };
};

export interface CardBillInput {
  card: Card;
  usageMonth: string;
  amount: number; // Total bill, installments included
  installment: number;
  split: CardSplit;
}

/** Installments already owed on a card, excluding a split created from this same bill. */
export const installmentDueOnBill = (card: Card, usageMonth: string, debts: Debt[], statements: CardStatement[]) => {
  const ownSplit = statements.find((item) => item.id === statementId(card.id, usageMonth))?.splitDebtId;
  return scheduledInstallment(card.id, debts.filter((debt) => debt.id !== ownSplit), cardDueDate(card, usageMonth));
};

const samePlan = (a: CardSplitPlan, b: CardSplitPlan) => a.payments === b.payments && a.feePer100 === b.feePer100
  && a.startsThisBill === b.startsThisBill && JSON.stringify(a.lines ?? []) === JSON.stringify(b.lines ?? []);

/**
 * Records to write for one card bill. A split moves purchases out of the
 * bill into an installment debt holding what is still to pay, fee included,
 * which the card's following bills collect in equal payments. When the split
 * starts on this bill, its first payment stays in this bill instead.
 */
export const buildCardBill = (input: CardBillInput, existing: CardStatement | undefined, debts: Debt[]) => {
  const { card, usageMonth, amount, installment, split } = input;
  const previousSplit = existing?.splitDebtId ? debts.find((debt) => debt.id === existing.splitDebtId) : undefined;
  const base = { ...existing, id: statementId(card.id, usageMonth), cardId: card.id, usageMonth, amount, installment: Math.min(installment, amount) };

  if (split === 'keep' && previousSplit) return { statement: base as CardStatement, splitDebt: previousSplit, removedSplitDebtId: null };

  let splitDebt: Debt | null = null;
  let splitPlan: CardSplitPlan | undefined;
  let firstPayment = 0;
  if (split && split !== 'keep' && split.amount > 0) {
    const months = Math.max(1, Math.round(split.months));
    const schedule = splitScheduleFor({ ...split, months });
    splitPlan = {
      payments: months, feePer100: split.feePer100, fee: schedule.fee, startsThisBill: split.startsThisBill,
      ...(split.lines?.length ? { lines: split.lines } : {}),
    };
    firstPayment = split.startsThisBill ? schedule.first : 0;
    // Saving the bill again with the same split keeps the debt, and any installments already paid on it.
    const unchanged = previousSplit && existing?.splitPlan && existing.splitAmount === split.amount && samePlan(existing.splitPlan, splitPlan);
    // Starting on a later bill, the leftover yen can't sit in the first payment, so the last one is a few yen smaller instead.
    const later = split.startsThisBill ? schedule.monthly : Math.ceil(schedule.total / months);
    splitDebt = unchanged ? previousSplit : {
      id: previousSplit?.id ?? crypto.randomUUID(),
      person: `${card.name} split`,
      description: `${months} payments from the ${formatMonthName(usageMonth)} bill, ${formatYen(schedule.fee)} fee included`,
      amount: schedule.total - firstPayment,
      dueDate: toDate(cardDueDate(card, shiftMonthKey(usageMonth, 1))).toISOString(),
      type: 'payable',
      debtCategory: 'Credit Card',
      isPaid: false,
      interestRate: 0, // The fee is already in the amount
      minimumPayment: later,
      cardId: card.id,
    };
  }

  // A split that was rebuilt starts over: what an earlier payment of this bill took off the old one no longer applies.
  const rebuilt = previousSplit && splitDebt !== previousSplit;
  const statement: CardStatement = {
    ...base,
    ...(rebuilt && base.appliedPayments ? { appliedPayments: base.appliedPayments.filter((applied) => applied.debtId !== previousSplit.id) } : {}),
    splitAmount: splitDebt ? Math.min((split as CardSplitInput).amount, amount) : 0,
    splitDebtId: splitDebt?.id,
    splitFirstPayment: firstPayment > 0 ? firstPayment : undefined,
    splitPlan,
  };

  return { statement, splitDebt, removedSplitDebtId: previousSplit && !splitDebt ? previousSplit.id : null };
};

/**
 * Paying a card bill also pays the installments it collects on the card's
 * split debts, and the first installment of its own split when it starts here.
 */
export const markCardBillPaid = (statement: CardStatement, debts: Debt[], billDueDate: string) => {
  const linked = installmentDebtsFor(statement.cardId, debts, billDueDate)
    .filter((debt) => (debt.id === statement.splitDebtId ? Boolean(statement.splitFirstPayment) : statement.installment > 0));
  const appliedPayments = linked.map((debt) => ({ debtId: debt.id, principal: scheduledPrincipal(debt), previousDueDate: debt.dueDate }));
  const updatedDebts = linked.map((debt, index) => {
    const amount = Math.max(0, debt.amount - appliedPayments[index].principal);
    const due = new Date(debt.dueDate);
    return { ...debt, amount, isPaid: amount === 0, dueDate: addMonthsClamped(due, 1, due.getDate()).toISOString() };
  });
  return { statement: { ...statement, paidAt: new Date().toISOString(), appliedPayments }, updatedDebts };
};

export const unmarkCardBillPaid = (statement: CardStatement, debts: Debt[]) => {
  const updatedDebts = (statement.appliedPayments ?? []).flatMap((applied) => {
    const debt = debts.find((item) => item.id === applied.debtId);
    if (!debt) return [];
    return [{ ...debt, amount: debt.amount + applied.principal, isPaid: false, dueDate: applied.previousDueDate }];
  });
  const { paidAt: _paidAt, appliedPayments: _applied, ...rest } = statement;
  return { statement: rest as CardStatement, updatedDebts };
};
