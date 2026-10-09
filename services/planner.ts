import {
  Bill, BillPayment, Card, CardBreakdown, CardStatement, CardUsage, Debt, PayCycleRecord, PlannerData, PlannerSettings,
} from '../types';
import type { PlannerRecord } from './storageService';
import { DEFAULT_SETTINGS, cardDueDate, installmentDebtsFor, scheduledInstallment, scheduledPrincipal, statementId } from '../utils/payCycle';
import { shiftMonthKey, toDate } from '../utils/jpCalendar';
import { addMonthsClamped } from '../utils/date';
import { formatMonthName } from '../utils/format';

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
  amount: number;
  months: number;
  rate: number; // Annual %
}

export interface CardBillInput {
  card: Card;
  usageMonth: string;
  amount: number; // Total bill, installments included
  installment: number;
  split: CardSplitInput | null;
}

/** Installments already owed on a card, excluding a split created from this same bill. */
export const installmentDueOnBill = (card: Card, usageMonth: string, debts: Debt[], statements: CardStatement[]) => {
  const ownSplit = statements.find((item) => item.id === statementId(card.id, usageMonth))?.splitDebtId;
  return scheduledInstallment(card.id, debts.filter((debt) => debt.id !== ownSplit), cardDueDate(card, usageMonth));
};

/**
 * Records to write for one card bill. A split moves part of the bill into an
 * installment debt whose payments are added to the card's following bills.
 */
export const buildCardBill = (input: CardBillInput, existing: CardStatement | undefined, debts: Debt[]) => {
  const { card, usageMonth, amount, installment, split } = input;
  const previousSplit = existing?.splitDebtId ? debts.find((debt) => debt.id === existing.splitDebtId) : undefined;

  let splitDebt: Debt | null = null;
  if (split && split.amount > 0) {
    const months = Math.max(1, Math.round(split.months));
    splitDebt = {
      id: previousSplit?.id ?? crypto.randomUUID(),
      person: `${card.name} split`,
      description: `${months} payments from the ${formatMonthName(usageMonth)} bill`,
      amount: split.amount,
      // The first installment is collected with the next bill.
      dueDate: toDate(cardDueDate(card, shiftMonthKey(usageMonth, 1))).toISOString(),
      type: 'payable',
      debtCategory: 'Credit Card',
      isPaid: false,
      interestRate: split.rate,
      minimumPayment: Math.ceil(split.amount / months),
      cardId: card.id,
    };
  }

  const statement: CardStatement = {
    ...existing,
    id: statementId(card.id, usageMonth),
    cardId: card.id,
    usageMonth,
    amount,
    installment: Math.min(installment, amount),
    splitAmount: splitDebt ? Math.min(splitDebt.amount, amount) : 0,
    splitDebtId: splitDebt?.id,
  };

  return { statement, splitDebt, removedSplitDebtId: previousSplit && !splitDebt ? previousSplit.id : null };
};

/** Paying a card bill also pays the installments it collects on the card's split debts. */
export const markCardBillPaid = (statement: CardStatement, debts: Debt[], billDueDate: string) => {
  const linked = statement.installment > 0
    ? installmentDebtsFor(statement.cardId, debts, billDueDate).filter((debt) => debt.id !== statement.splitDebtId)
    : [];
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
