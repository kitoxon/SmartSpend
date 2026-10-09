import React, { useMemo, useState } from 'react';
import { Bill, Card, Debt, Goal, PlannerData } from '../types';
import { CyclePlan, averageCardUsage, lastCardBill } from '../utils/payCycle';
import { formatShortDate, formatWeekdayDate, todayLocalDate } from '../utils/jpCalendar';
import { formatSignedYen, formatYen, parseAmount } from '../utils/format';
import { CardBillInput, installmentDueOnBill } from '../services/planner';
import { AmountInput } from './ui/AmountInput';
import { CardBillFields, CardBillValue, cardBillError, cardBillValueFor, readSplit } from './CardBillFields';
import { APP_NAME } from '../constants';

export interface CheckinResult {
  cycleKey: string;
  salary: number;
  carryover: number;
  savings: number;
  savingsGoalId?: string;
  trackingFrom?: string;
  cardBills: CardBillInput[];
  billAmounts: { bill: Bill; dueDate: string; amount: number }[];
}

interface PaydayCheckinProps {
  mode: 'payday' | 'today';
  plan: CyclePlan;
  data: PlannerData;
  debts: Debt[];
  goals: Goal[];
  suggestedCarryover: number | null;
  onSubmit: (result: CheckinResult) => Promise<void>;
  onCancel: () => void;
}

const Section: React.FC<{ title: string; note?: string; children: React.ReactNode }> = ({ title, note, children }) => (
  <section className="space-y-3 border-b border-line pb-5 last:border-b-0">
    <div>
      <h4 className="text-sm font-medium text-ink">{title}</h4>
      {note && <p className="mt-0.5 text-xs leading-relaxed text-ink-3">{note}</p>}
    </div>
    {children}
  </section>
);

export const PaydayCheckin: React.FC<PaydayCheckinProps> = ({ mode, plan, data, debts, goals, suggestedCarryover, onSubmit, onCancel }) => {
  const fromToday = mode === 'today';
  // Editing a mid-cycle start keeps its original date, so spending since then still counts.
  const startDate = plan.record?.trackingFrom ?? todayLocalDate();
  const visible = plan.obligations.filter((obligation) => !fromToday || obligation.dueDate >= startDate);
  const cardItems = visible.filter((obligation) => obligation.kind === 'card');
  const billItems = visible.filter((obligation) => obligation.kind === 'bill');
  const debtItems = visible.filter((obligation) => obligation.kind === 'debt');
  const cardsById = useMemo(() => new Map<string, Card>(data.cards.map((card) => [card.id, card])), [data.cards]);
  const billsById = useMemo(() => new Map<string, Bill>(data.bills.map((bill) => [bill.id, bill])), [data.bills]);

  const lastSalary = [...data.cycles].filter((cycle) => cycle.salary > 0).sort((a, b) => b.key.localeCompare(a.key))[0]?.salary ?? null;
  const [salary, setSalary] = useState(plan.record?.salary ? String(plan.record.salary) : lastSalary ? String(lastSalary) : '');
  const [carryover, setCarryover] = useState(
    plan.record ? String(plan.record.carryover) : suggestedCarryover !== null ? String(suggestedCarryover) : '',
  );
  const [savings, setSavings] = useState(String(plan.record?.savings ?? data.settings.defaultSavings ?? 0));
  const openGoals = goals.filter((goal) => goal.currentAmount < goal.targetAmount || goal.id === plan.record?.savingsGoalId);
  const [savingsGoalId, setSavingsGoalId] = useState(() => {
    const preferred = plan.record ? plan.record.savingsGoalId : data.settings.defaultSavingsGoalId;
    return preferred && openGoals.some((goal) => goal.id === preferred) ? preferred : '';
  });
  const [cardValues, setCardValues] = useState<Record<string, CardBillValue>>(() => Object.fromEntries(cardItems.map((item) => [
    item.key, cardBillValueFor(cardsById.get(item.refId)!, item.usageMonth!, item.statement, debts, data.statements),
  ])));
  const [billValues, setBillValues] = useState<Record<string, string>>(() => Object.fromEntries(billItems.map((item) => [item.key, item.amount > 0 ? String(item.amount) : ''])));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const salaryAmount = fromToday ? 0 : parseAmount(salary) ?? 0;
  const carryoverAmount = parseAmount(carryover) ?? 0;
  const savingsAmount = parseAmount(savings) ?? 0;
  const cardTotal = cardItems.reduce((sum, item) => {
    const value = cardValues[item.key];
    const amount = parseAmount(value.amount);
    if (amount === null) return sum + item.amount;
    return sum + amount - (readSplit(value)?.amount ?? 0);
  }, 0);
  const billTotal = billItems.reduce((sum, item) => sum + (parseAmount(billValues[item.key] ?? '') ?? 0), 0);
  const debtTotal = debtItems.reduce((sum, item) => sum + item.amount, 0);
  const free = carryoverAmount + salaryAmount - savingsAmount - cardTotal - billTotal - debtTotal;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (fromToday ? parseAmount(carryover) === null : parseAmount(salary) === null) {
      setError(fromToday ? 'Enter your starting balance.' : 'Enter your salary.');
      return;
    }
    const cardError = cardItems.map((item) => cardBillError(cardValues[item.key])).find(Boolean);
    if (cardError) {
      setError(cardError);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await onSubmit({
        cycleKey: plan.cycle.key,
        salary: salaryAmount,
        carryover: carryoverAmount,
        savings: savingsAmount,
        savingsGoalId: savingsGoalId || undefined,
        trackingFrom: fromToday ? startDate : plan.record?.trackingFrom,
        cardBills: cardItems.flatMap((item) => {
          const value = cardValues[item.key];
          const amount = parseAmount(value.amount);
          if (amount === null) return [];
          return [{ card: cardsById.get(item.refId)!, usageMonth: item.usageMonth!, amount, installment: parseAmount(value.installment) ?? 0, split: readSplit(value) }];
        }),
        billAmounts: billItems.flatMap((item) => {
          const bill = billsById.get(item.refId);
          const amount = parseAmount(billValues[item.key] ?? '');
          return bill && amount !== null ? [{ bill, dueDate: item.dueDate, amount }] : [];
        }),
      });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Could not save the check-in.');
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
        {fromToday ? (
          <Section title={`Balance on ${formatShortDate(startDate)}`} note={`Money in your account and wallet on ${formatWeekdayDate(startDate)}. Bills and spending before then are left out of this cycle.`}>
            <AmountInput value={carryover} onChange={setCarryover} size="lg" placeholder="0" aria-label="Starting balance" autoFocus />
          </Section>
        ) : (
          <Section title="Income">
            <div>
              <label htmlFor="checkin-salary" className="field-label">Salary · {formatWeekdayDate(plan.cycle.payday)}</label>
              <AmountInput id="checkin-salary" value={salary} onChange={setSalary} size="lg" placeholder="0" autoFocus />
            </div>
            <div>
              <label htmlFor="checkin-carryover" className="field-label">Money left before the salary arrived</label>
              <AmountInput id="checkin-carryover" value={carryover} onChange={setCarryover} placeholder="0" />
              <p className="mt-1 text-xs text-ink-3">
                {suggestedCarryover !== null ? `${APP_NAME} expects ${formatYen(suggestedCarryover)} from last cycle. Use your real balance if it's different.` : 'Your account balance just before payday.'}
              </p>
            </div>
          </Section>
        )}

        {cardItems.length > 0 && (
          <Section title="Card bills" note="Totals from each card's app. Leave one empty to keep the estimate for now.">
            {cardItems.map((item) => {
              const card = cardsById.get(item.refId)!;
              const installment = installmentDueOnBill(card, item.usageMonth!, debts, data.statements);
              const usual = averageCardUsage(card.id, data.statements, item.usageMonth!);
              return (
                <div key={item.key} className="rounded-xl border border-line p-3">
                  <CardBillFields
                    card={card}
                    usageMonth={item.usageMonth!}
                    dueDate={item.dueDate}
                    value={cardValues[item.key]}
                    onChange={(value) => setCardValues((previous) => ({ ...previous, [item.key]: value }))}
                    estimate={usual === null && installment === 0 ? null : (usual ?? 0) + installment}
                    lastBill={lastCardBill(card.id, data.statements, item.usageMonth!)}
                    usual={usual}
                    showInstallment={installment > 0 || (item.statement?.installment ?? 0) > 0}
                  />
                </div>
              );
            })}
          </Section>
        )}

        {billItems.length > 0 && (
          <Section title="Transfer bills" note="Fixed amounts are filled in. Update any that changed this month.">
            {billItems.map((item) => {
              const bill = billsById.get(item.refId);
              return (
                <div key={item.key} className="grid grid-cols-[minmax(0,1fr)_132px] items-center gap-3">
                  <label htmlFor={`bill-${item.key}`} className="min-w-0">
                    <span className="block truncate text-sm text-ink">{item.label}</span>
                    <span className="block text-xs text-ink-3">{formatShortDate(item.dueDate)}{bill?.variable ? ' · amount varies' : ''}</span>
                  </label>
                  <AmountInput
                    id={`bill-${item.key}`}
                    value={billValues[item.key] ?? ''}
                    onChange={(value) => setBillValues((previous) => ({ ...previous, [item.key]: value }))}
                    placeholder={bill?.variable ? 'Estimate' : '0'}
                  />
                </div>
              );
            })}
          </Section>
        )}

        {debtItems.length > 0 && (
          <Section title="Debt payments">
            {debtItems.map((item) => (
              <div key={item.key} className="flex justify-between gap-3 text-sm">
                <span className="text-ink">{item.label} <span className="text-xs text-ink-3">· {formatShortDate(item.dueDate)}</span></span>
                <span className="tabular-nums text-ink-2">−{formatYen(item.amount)}</span>
              </div>
            ))}
          </Section>
        )}

        <Section title="Savings" note="Set aside before anything else. Next payday starts with this amount and goal.">
          <div className={openGoals.length > 0 ? 'grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2' : ''}>
            <AmountInput value={savings} onChange={setSavings} placeholder="0" aria-label="Amount to set aside" />
            {openGoals.length > 0 && (
              <select value={savingsGoalId} onChange={(event) => setSavingsGoalId(event.target.value)} aria-label="Add savings to a goal" className="field px-2 text-sm">
                <option value="">No goal</option>
                {openGoals.map((goal) => <option key={goal.id} value={goal.id}>Add to {goal.name}</option>)}
              </select>
            )}
          </div>
        </Section>
      </div>

      <div className="shrink-0 border-t border-line bg-card px-5 pt-3 pb-safe-3">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <span className="text-sm text-ink-2">Free this cycle</span>
          <span className={`text-xl font-medium tabular-nums ${free < 0 ? 'text-bad' : 'text-good'}`}>{formatSignedYen(free)}</span>
        </div>
        {error && <p className="mb-2 text-xs text-bad">{error}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className="btn flex-1">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary flex-[2]">{saving ? 'Saving…' : 'Save check-in'}</button>
        </div>
      </div>
    </form>
  );
};
