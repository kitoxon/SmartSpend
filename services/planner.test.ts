import { describe, expect, it } from 'vitest';
import { Card, CardStatement, Debt } from '../types';
import { buildCardBill, markCardBillPaid, unmarkCardBillPaid } from './planner';

const card: Card = { id: 'amazon', name: 'Amazon Mastercard', paymentDay: 26, sortOrder: 0 };

describe('card bills', () => {
  it('moves part of a bill into an installment debt paid with the next bills', () => {
    const { statement, splitDebt } = buildCardBill(
      { card, usageMonth: '2026-09', amount: 120_000, installment: 0, split: { amount: 60_000, months: 3, rate: 15 } },
      undefined,
      [],
    );
    expect(statement).toMatchObject({ id: 'statement:amazon:2026-09', amount: 120_000, splitAmount: 60_000, splitDebtId: splitDebt!.id });
    expect(splitDebt).toMatchObject({ amount: 60_000, minimumPayment: 20_000, interestRate: 15, cardId: 'amazon' });
    // First installment comes with the October purchases bill, due Nov 26.
    expect(new Date(splitDebt!.dueDate).getDate()).toBe(26);
    expect(new Date(splitDebt!.dueDate).getMonth()).toBe(10);
  });

  it('removes the split debt when the split is undone', () => {
    const first = buildCardBill({ card, usageMonth: '2026-09', amount: 120_000, installment: 0, split: { amount: 60_000, months: 3, rate: 15 } }, undefined, []);
    const again = buildCardBill({ card, usageMonth: '2026-09', amount: 120_000, installment: 0, split: null }, first.statement, [first.splitDebt!]);
    expect(again.splitDebt).toBeNull();
    expect(again.removedSplitDebtId).toBe(first.splitDebt!.id);
    expect(again.statement.splitAmount).toBe(0);
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
