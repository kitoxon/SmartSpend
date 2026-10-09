import React, { useState } from 'react';
import { Bill, Debt, PlannerData } from '../types';
import { Obligation, averageCardUsage, lastCardBill, monthlyInterest, scheduledPrincipal } from '../utils/payCycle';
import { formatWeekdayDate } from '../utils/jpCalendar';
import { formatYen, parseAmount } from '../utils/format';
import { CardBillInput, installmentDueOnBill } from '../services/planner';
import { AmountInput } from './ui/AmountInput';
import { CardBillFields, CardBillValue, cardBillError, cardBillValueFor, emptyCardBillValue, readSplit } from './CardBillFields';

interface ObligationEditorProps {
  obligation: Obligation;
  data: PlannerData;
  debts: Debt[];
  onSaveCard: (input: CardBillInput, paid: boolean) => Promise<void>;
  onSaveBill: (bill: Bill, dueDate: string, amount: number, paid: boolean) => Promise<void>;
  onPayDebt: (debtId: string) => void;
  onCancel: () => void;
}

const PaidToggle: React.FC<{ paid: boolean; onChange: (paid: boolean) => void }> = ({ paid, onChange }) => (
  <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-lg bg-subtle px-3">
    <span className="text-sm text-ink">Paid</span>
    <input type="checkbox" checked={paid} onChange={(event) => onChange(event.target.checked)} className="h-5 w-5 accent-[rgb(var(--good-mark))]" />
  </label>
);

export const ObligationEditor: React.FC<ObligationEditorProps> = ({ obligation, data, debts, onSaveCard, onSaveBill, onPayDebt, onCancel }) => {
  const card = obligation.kind === 'card' ? data.cards.find((item) => item.id === obligation.refId) : undefined;
  const bill = obligation.kind === 'bill' ? data.bills.find((item) => item.id === obligation.refId) : undefined;
  const debt = obligation.kind === 'debt' ? debts.find((item) => item.id === obligation.refId) : undefined;

  const [paid, setPaid] = useState(obligation.paid);
  const [cardValue, setCardValue] = useState<CardBillValue>(() => card
    ? cardBillValueFor(card, obligation.usageMonth!, obligation.statement, debts, data.statements)
    : emptyCardBillValue(null, 0));
  const [billAmount, setBillAmount] = useState(obligation.amount > 0 ? String(obligation.amount) : '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      if (card) {
        const amount = parseAmount(cardValue.amount);
        if (amount === null) {
          setError('Enter the bill amount from the card app.');
          return;
        }
        const problem = cardBillError(cardValue);
        if (problem) {
          setError(problem);
          return;
        }
        setSaving(true);
        await onSaveCard({ card, usageMonth: obligation.usageMonth!, amount, installment: parseAmount(cardValue.installment) ?? 0, split: readSplit(cardValue) }, paid);
      } else if (bill) {
        const amount = parseAmount(billAmount);
        if (amount === null) {
          setError('Enter the amount.');
          return;
        }
        setSaving(true);
        await onSaveBill(bill, obligation.dueDate, amount, paid);
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save.');
      setSaving(false);
    }
  };

  if (debt) {
    return (
      <div className="space-y-4">
        <div className="space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-ink-2">Principal</span><span className="tabular-nums">{formatYen(scheduledPrincipal(debt))}</span></div>
          <div className="flex justify-between"><span className="text-ink-2">Interest</span><span className="tabular-nums">{formatYen(monthlyInterest(debt))}</span></div>
          <div className="flex justify-between"><span className="text-ink-2">Due</span><span>{formatWeekdayDate(obligation.dueDate)}</span></div>
          <div className="flex justify-between border-t border-line pt-2"><span className="text-ink-2">Balance</span><span className="tabular-nums">{formatYen(debt.amount)}</span></div>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className="btn flex-1">Close</button>
          <button type="button" onClick={() => onPayDebt(debt.id)} className="btn-primary flex-1">Record payment</button>
        </div>
      </div>
    );
  }

  const installment = card ? installmentDueOnBill(card, obligation.usageMonth!, debts, data.statements) : 0;
  const usual = card ? averageCardUsage(card.id, data.statements, obligation.usageMonth!) : null;
  const lastBill = card ? lastCardBill(card.id, data.statements, obligation.usageMonth!) : null;

  return (
    <form onSubmit={save} className="space-y-4">
      {card && (
        <CardBillFields
          card={card}
          usageMonth={obligation.usageMonth!}
          dueDate={obligation.dueDate}
          value={cardValue}
          onChange={setCardValue}
          estimate={usual === null && installment === 0 ? null : (usual ?? 0) + installment}
          lastBill={lastBill}
          usual={usual}
          showInstallment={installment > 0 || obligation.installment > 0}
        />
      )}
      {bill && (
        <div>
          <label htmlFor="bill-amount" className="field-label">{bill.variable ? 'Amount this month' : 'Amount'} · due {formatWeekdayDate(obligation.dueDate)}</label>
          <AmountInput id="bill-amount" value={billAmount} onChange={setBillAmount} size="lg" autoFocus />
          {bill.variable && <p className="mt-1 text-xs text-ink-3">The usual estimate is {formatYen(bill.amount)}. Saving confirms this month's amount.</p>}
        </div>
      )}
      <PaidToggle paid={paid} onChange={setPaid} />
      {error && <p className="text-xs text-bad">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="btn flex-1">Cancel</button>
        <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? 'Saving…' : 'Save'}</button>
      </div>
    </form>
  );
};
