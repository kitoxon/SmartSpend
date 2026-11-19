import { describe, expect, it } from 'vitest';
import { Card, CardStatement, Debt } from '../types';
import { fromDate } from '../utils/jpCalendar';
import { buildCardBill, markCardBillPaid, unmarkCardBillPaid } from './planner';

const card: Card = { id: 'amazon', name: 'Amazon Mastercard', paymentDay: 26, sortOrder: 0 };

describe('card bills', () => {
  it('splits purchases the way the card company does, starting on this bill', () => {
    // Amazon Mastercard, 3 payments: ¥1.68 per ¥100. The fee on ¥31,950 is ¥536, and
    // ¥32,486 is paid as ¥10,830 + ¥10,828 + ¥10,828. Vpass shows this bill as ¥41,267.
    const input = { card, usageMonth: '2026-10', amount: 62_387, installment: 0, split: { amount: 31_950, months: 3, feePer100: 1.68, startsThisBill: true } };
    const { statement, splitDebt } = buildCardBill(input, undefined, []);
    expect(statement).toMatchObject({ amount: 62_387, splitAmount: 31_950, splitFirstPayment: 10_830, splitDebtId: splitDebt!.id });
    expect(statement.amount - statement.splitAmount + statement.splitFirstPayment!).toBe(41_267);
    expect(statement.splitPlan).toEqual({ payments: 3, feePer100: 1.68, fee: 536, startsThisBill: true });
    // The other two payments come with the December and January bills.
    expect(splitDebt).toMatchObject({ amount: 21_656, minimumPayment: 10_828, interestRate: 0, cardId: 'amazon' });
    expect(fromDate(new Date(splitDebt!.dueDate))).toBe('2026-12-28');

    // Paying this bill pays the first installment, which was never part of the debt.
    const paid = markCardBillPaid(statement, [splitDebt!], '2026-11-26');
    expect(paid.updatedDebts).toEqual([]);
    // Unchanged when saved again, so installments paid later aren't undone.
    const later = { ...splitDebt!, amount: 10_828 };
    expect(buildCardBill(input, paid.statement, [later]).splitDebt).toBe(later);
  });

  it('works out the fee for each chosen purchase', () => {
    const lines = [
      { id: '0', date: '2026-10-03', label: 'AMAZON.CO.JP', amount: 21_950 },
      { id: '1', date: '2026-10-09', label: 'ニトリ', amount: 10_000 },
    ];
    const { statement, splitDebt } = buildCardBill(
      { card, usageMonth: '2026-10', amount: 62_387, installment: 0, split: { amount: 31_950, months: 3, feePer100: 1.68, startsThisBill: true, lines } },
      undefined,
      [],
    );
    // ¥368 and ¥168 of fee: 7,440 + 7,439 × 2, and 3,390 + 3,389 × 2.
    expect(statement).toMatchObject({ splitFirstPayment: 10_830, splitPlan: { fee: 536, lines } });
    expect(splitDebt).toMatchObject({ amount: 21_656, minimumPayment: 10_828 });
  });

  it('can start the split with the next bill instead', () => {
    const { statement, splitDebt } = buildCardBill(
      { card, usageMonth: '2026-09', amount: 120_000, installment: 0, split: { amount: 60_000, months: 3, feePer100: 2.46, startsThisBill: false } },
      undefined,
      [],
    );
    expect(statement).toMatchObject({ id: 'statement:amazon:2026-09', amount: 120_000, splitAmount: 60_000, splitDebtId: splitDebt!.id });
    expect(statement.splitFirstPayment).toBeUndefined();
    expect(splitDebt).toMatchObject({ amount: 61_476, minimumPayment: 20_492, interestRate: 0 });
    // First installment comes with the October purchases bill, due Nov 26.
    expect(fromDate(new Date(splitDebt!.dueDate))).toBe('2026-11-26');
  });

  it('keeps a split saved with yearly interest until it is redone', () => {
    const old: Debt = {
      id: 'd', person: 'Amazon Mastercard split', amount: 20_666, description: '', dueDate: '2026-12-26T03:00:00.000Z',
      type: 'payable', debtCategory: 'Credit Card', isPaid: false, interestRate: 15, minimumPayment: 10_334, cardId: 'amazon',
    };
    const existing: CardStatement = {
      id: 'statement:amazon:2026-10', cardId: 'amazon', usageMonth: '2026-10', amount: 61_000, installment: 0,
      splitAmount: 31_000, splitDebtId: 'd', splitFirstPayment: 10_722,
    };
    const kept = buildCardBill({ card, usageMonth: '2026-10', amount: 61_500, installment: 0, split: 'keep' }, existing, [old]);
    expect(kept.splitDebt).toBe(old);
    expect(kept.statement).toMatchObject({ amount: 61_500, splitAmount: 31_000, splitDebtId: 'd', splitFirstPayment: 10_722 });

    const redone = buildCardBill(
      { card, usageMonth: '2026-10', amount: 61_500, installment: 0, split: { amount: 31_000, months: 3, feePer100: 1.68, startsThisBill: true } },
      { ...existing, paidAt: '2026-11-26', appliedPayments: [{ debtId: 'd', principal: 10_334, previousDueDate: '2026-11-26T03:00:00.000Z' }] },
      [old],
    );
    expect(redone.splitDebt).toMatchObject({ id: 'd', amount: 21_012, minimumPayment: 10_506, interestRate: 0 });
    expect(redone.statement.appliedPayments).toEqual([]); // Un-marking the bill no longer adds the old principal back
  });

  it('removes the split debt when the split is undone', () => {
    const first = buildCardBill({ card, usageMonth: '2026-09', amount: 120_000, installment: 0, split: { amount: 60_000, months: 3, feePer100: 2.46, startsThisBill: false } }, undefined, []);
    const again = buildCardBill({ card, usageMonth: '2026-09', amount: 120_000, installment: 0, split: null }, first.statement, [first.splitDebt!]);
    expect(again.splitDebt).toBeNull();
    expect(again.removedSplitDebtId).toBe(first.splitDebt!.id);
    expect(again.statement.splitAmount).toBe(0);
    expect(again.statement.splitPlan).toBeUndefined();
  });

  it('pays installments when the bill is paid and restores them when un-marked', () => {
    const split: Debt = {
      id: 'd', person: 'Amazon split', amount: 40_000, description: '', dueDate: '2026-11-26T03:00:00.000Z',
      type: 'payable', debtCategory: 'Credit Card', isPaid: false, interestRate: 15, minimumPayment: 20_000, cardId: 'amazon',
    };
    const statement: CardStatement = { id: 's', cardId: 'amazon', usageMonth: '2026-10', amount: 90_500, installment: 20_500, splitAmount: 0 };

    const paid = markCardBillPaid(statement, [split], '2026-11-26');
    expect(paid.statement.paidAt).toBeTruthy();
    expect(paid.updatedDebts[0]).toMatchObject({ amount: 20_000, isPaid: false });
    expect(new Date(paid.updatedDebts[0].dueDate).getMonth()).toBe(11);

    const unpaid = unmarkCardBillPaid(paid.statement, paid.updatedDebts);
    expect(unpaid.statement.paidAt).toBeUndefined();
    expect(unpaid.updatedDebts[0]).toMatchObject({ amount: 40_000, dueDate: split.dueDate });
  });

  it('leaves split debts alone when an earlier bill is paid', () => {
    const split: Debt = {
      id: 'd', person: 'Amazon split', amount: 40_000, description: '', dueDate: '2026-11-26T03:00:00.000Z',
      type: 'payable', debtCategory: 'Credit Card', isPaid: false, minimumPayment: 20_000, cardId: 'amazon',
    };
    const statement: CardStatement = { id: 's', cardId: 'amazon', usageMonth: '2026-08', amount: 50_000, installment: 5_000, splitAmount: 0 };
    expect(markCardBillPaid(statement, [split], '2026-09-28').updatedDebts).toEqual([]);
  });
});
