import React, { useId, useState } from 'react';
import { Card, CardStatement, Debt, SplitLine } from '../types';
import { formatShortDate, formatWeekdayDate } from '../utils/jpCalendar';
import { formatMonthName, formatYen, parseAmount } from '../utils/format';
import { unusuallyHighBy } from '../utils/payCycle';
import { hasSplitFeeTable, splitFeePer100 } from '../utils/cardSplit';
import { AmountInput } from './ui/AmountInput';
import { CardSplit, installmentDueOnBill, splitScheduleFor } from '../services/planner';
import { Segmented } from './ui/Segmented';

export interface CardBillValue {
  amount: string;
  installment: string;
  splitOn: boolean;
  picked: SplitLine[]; // Purchases chosen from the imported statement
  splitAmount: string; // Typed instead, when there's no statement to choose from
  months: number;
  fee: string; // Yen per ¥100 for this many payments
  splitStartsNow: boolean; // First installment with this bill, not the next
  // A split saved with yearly interest, before fees came from the card's table. Left as it is until redone.
  keptSplit: { amount: number; months: number; rate: number } | null;
}

export const SPLIT_MONTH_OPTIONS = [3, 5, 6, 10, 12];
const DEFAULT_SPLIT_MONTHS = 3;
const LINES_SHOWN = 6;

const feeFor = (card: Card | undefined, months: number) => String(splitFeePer100(card?.name ?? '', months));

export const emptyCardBillValue = (card: Card | undefined, amount: number | null, installment: number): CardBillValue => ({
  amount: amount === null ? '' : String(amount),
  installment: installment > 0 ? String(installment) : '',
  splitOn: false,
  picked: [],
  splitAmount: '',
  months: DEFAULT_SPLIT_MONTHS,
  fee: feeFor(card, DEFAULT_SPLIT_MONTHS),
  splitStartsNow: true,
  keptSplit: null,
});

/** Form state for a card bill: the saved statement if there is one, otherwise blank with installments due. */
export const cardBillValueFor = (card: Card, usageMonth: string, statement: CardStatement | undefined, debts: Debt[], statements: CardStatement[]): CardBillValue => {
  if (!statement) return emptyCardBillValue(card, null, installmentDueOnBill(card, usageMonth, debts, statements));
  const value = emptyCardBillValue(card, statement.amount, statement.installment);
  const splitDebt = statement.splitDebtId ? debts.find((debt) => debt.id === statement.splitDebtId) : undefined;
  if (!splitDebt) return value;
  const plan = statement.splitPlan;
  if (!plan) {
    const months = Math.max(1, Math.round(statement.splitAmount / (splitDebt.minimumPayment || statement.splitAmount)));
    return { ...value, splitOn: true, keptSplit: { amount: statement.splitAmount, months, rate: splitDebt.interestRate ?? 0 } };
  }
  return {
    ...value,
    splitOn: true,
    picked: plan.lines ?? [],
    splitAmount: plan.lines?.length ? '' : String(statement.splitAmount),
    months: plan.payments,
    fee: String(plan.feePer100),
    splitStartsNow: plan.startsThisBill,
  };
};

export const readSplit = (value: CardBillValue): CardSplit => {
  if (!value.splitOn) return null;
  if (value.keptSplit) return 'keep';
  const fee = Number(value.fee);
  const amount = value.picked.length ? value.picked.reduce((sum, line) => sum + line.amount, 0) : parseAmount(value.splitAmount);
  if (!amount) return null;
  return {
    amount,
    months: value.months,
    feePer100: Number.isFinite(fee) && fee >= 0 ? fee : 0,
    startsThisBill: value.splitStartsNow,
    ...(value.picked.length ? { lines: value.picked } : {}),
  };
};

/**
 * Validation message for a card bill, or null when it can be saved. While the
 * user is still typing (`final` false), a split with nothing chosen yet is
 * not reported.
 */
export const cardBillError = (value: CardBillValue, final = true) => {
  const amount = parseAmount(value.amount);
  if (amount === null) return null;
  const installment = parseAmount(value.installment) ?? 0;
  if (installment > amount) return 'The installment cannot be more than the bill.';
  const split = readSplit(value);
  if (value.splitOn && !split) return final ? 'Choose what to split.' : null;
  if (split && split !== 'keep' && split.amount > amount) return 'The split cannot be more than the bill.';
  return null;
};

const lineKey = (line: SplitLine) => `${line.id}:${line.date}:${line.amount}`;

interface CardBillFieldsProps {
  card: Card;
  usageMonth: string;
  dueDate: string;
  value: CardBillValue;
  onChange: (value: CardBillValue) => void;
  estimate: number | null;
  lastBill: number | null;
  usual: number | null; // Average purchases over recent bills
  showInstallment: boolean;
  // Purchases on this bill's imported statement that the card company lets you split.
  purchases?: SplitLine[];
}

export const CardBillFields: React.FC<CardBillFieldsProps> = ({ card, usageMonth, dueDate, value, onChange, estimate, lastBill, usual, showInstallment, purchases = [] }) => {
  const id = useId();
  const [showAllLines, setShowAllLines] = useState(false);
  const amount = parseAmount(value.amount);
  const split = readSplit(value);
  const plan = split && split !== 'keep' ? split : null;
  const schedule = plan ? splitScheduleFor(plan) : null;
  const error = cardBillError(value, false);
  const highBy = amount !== null ? unusuallyHighBy(amount - (parseAmount(value.installment) ?? 0), usual) : null;
  const set = (patch: Partial<CardBillValue>) => onChange({ ...value, ...patch });

  // Purchases to choose from, largest first: the statement's, and any chosen earlier that a newer import no longer lists.
  const pickedKeys = new Set(value.picked.map(lineKey));
  const listed = new Set(purchases.map(lineKey));
  const lines = [...purchases, ...value.picked.filter((line) => !listed.has(lineKey(line)))].sort((a, b) => b.amount - a.amount);
  const shownLines = showAllLines ? lines : lines.filter((line, index) => index < LINES_SHOWN || pickedKeys.has(lineKey(line)));
  const togglePick = (line: SplitLine) => set({
    picked: pickedKeys.has(lineKey(line)) ? value.picked.filter((item) => lineKey(item) !== lineKey(line)) : [...value.picked, line],
  });
  const monthOptions = SPLIT_MONTH_OPTIONS.includes(value.months) ? SPLIT_MONTH_OPTIONS : [...SPLIT_MONTH_OPTIONS, value.months].sort((a, b) => a - b);

  return (
    <div className="space-y-3">
      <div>
        <div className="mb-1.5 flex items-baseline justify-between gap-3">
          <label htmlFor={`${id}-amount`} className="text-sm font-medium text-ink">{card.name}</label>
          <span className="text-xs text-ink-3">Due {formatWeekdayDate(dueDate)}</span>
        </div>
        <AmountInput
          id={`${id}-amount`}
          value={value.amount}
          onChange={(next) => set({ amount: next })}
          placeholder={estimate ? `About ${estimate.toLocaleString('ja-JP')}` : 'Bill amount'}
          aria-describedby={`${id}-hint`}
        />
        <p id={`${id}-hint`} className="mt-1 text-xs text-ink-3">
          {formatMonthName(usageMonth)} purchases{lastBill !== null ? ` · last bill ${formatYen(lastBill)}` : ''}
        </p>
        {highBy !== null && usual !== null && (
          <p className="mt-1 rounded-md bg-warn-soft px-2 py-1.5 text-xs text-warn">
            {formatYen(highBy)} more than your usual {formatYen(usual)}. Worth a quick look at the card app before paying.
          </p>
        )}
      </div>

      {showInstallment && (
        <div className="flex items-center justify-between gap-3 rounded-lg bg-subtle px-3 py-2">
          <label htmlFor={`${id}-installment`} className="text-[13px] text-ink-2">Includes split installment</label>
          <AmountInput id={`${id}-installment`} value={value.installment} onChange={(next) => set({ installment: next })} className="w-32" />
        </div>
      )}

      <label className="flex min-h-9 cursor-pointer items-center gap-2 text-[13px] text-ink-2">
        <input type="checkbox" checked={value.splitOn} onChange={(event) => set({ splitOn: event.target.checked })} className="h-4 w-4 accent-[rgb(var(--accent))]" />
        Can't pay it all? Split part of it
      </label>

      {value.splitOn && value.keptSplit && (
        <div className="space-y-2 rounded-lg border border-line p-3">
          <p className="text-xs leading-relaxed text-ink-2">
            {formatYen(value.keptSplit.amount)} is split into {value.keptSplit.months} payments, estimated at {value.keptSplit.rate}% yearly interest.
            The card company charges a set fee for each purchase instead, so its amounts are a little different.
          </p>
          <button
            type="button"
            onClick={() => set({
              keptSplit: null,
              splitAmount: purchases.length ? '' : String(value.keptSplit!.amount),
              months: value.keptSplit!.months,
              fee: feeFor(card, value.keptSplit!.months),
            })}
            className="btn-ghost -ml-2.5"
          >
            Redo with the card's fees
          </button>
        </div>
      )}

      {value.splitOn && !value.keptSplit && (
        <div className="space-y-3 rounded-lg border border-line p-3">
          {lines.length > 0 ? (
            <fieldset>
              <legend className="field-label">Purchases to split</legend>
              <ul className="divide-y divide-line">
                {shownLines.map((line) => (
                  <li key={lineKey(line)}>
                    <label className="flex min-h-11 cursor-pointer items-center gap-2.5 py-1.5">
                      <input type="checkbox" checked={pickedKeys.has(lineKey(line))} onChange={() => togglePick(line)} className="h-4 w-4 shrink-0 accent-[rgb(var(--accent))]" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] text-ink">{line.label}</span>
                        <span className="block text-xs text-ink-3">{formatShortDate(line.date)}</span>
                      </span>
                      <span className="shrink-0 text-[13px] tabular-nums text-ink-2">{formatYen(line.amount)}</span>
                    </label>
                  </li>
                ))}
              </ul>
              {lines.length > shownLines.length && (
                <button type="button" onClick={() => setShowAllLines(true)} className="btn-ghost -ml-2.5">Show all {lines.length}</button>
              )}
              <p className="mt-1 text-xs text-ink-3">
                {value.picked.length === 0
                  ? 'Choose the same purchases as in Vpass (あとから分割), which splits whole purchases of ¥1,000 or more.'
                  : `${value.picked.length} chosen, ${formatYen(plan?.amount ?? 0)}`}
              </p>
            </fieldset>
          ) : (
            <div>
              <label htmlFor={`${id}-split`} className="field-label">Amount to split</label>
              <AmountInput id={`${id}-split`} value={value.splitAmount} onChange={(next) => set({ splitAmount: next })} />
              {hasSplitFeeTable(card.name) && (
                <p className="mt-1 text-xs leading-relaxed text-ink-3">
                  Vpass splits whole purchases. Import this month's Vpass statement on the Cards tab to choose them here; a typed total can be a few yen off.
                </p>
              )}
            </div>
          )}
          <div>
            <p className="field-label">Payments</p>
            <div className="flex flex-wrap gap-1.5">
              {monthOptions.map((months) => (
                <button key={months} type="button" onClick={() => set({ months, fee: feeFor(card, months) })} className={value.months === months ? 'chip-on' : 'chip'} aria-pressed={value.months === months}>
                  {months}×
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-3">
            <div>
              <label htmlFor={`${id}-fee`} className="field-label">Fee per ¥100</label>
              <input id={`${id}-fee`} type="text" inputMode="decimal" value={value.fee} onChange={(event) => set({ fee: event.target.value.replace(/[^\d.]/g, '') })} className="field tabular-nums" />
            </div>
            <p className="pt-5 text-xs leading-relaxed text-ink-3">
              {hasSplitFeeTable(card.name)
                ? `${card.name}'s fee for ${value.months} payments. Change it if the card app shows another.`
                : `A typical fee for ${value.months} payments. Use the one ${card.name}'s app shows.`}
            </p>
          </div>
          <div className="space-y-1.5">
            <p className="field-label mb-0">First payment</p>
            <Segmented
              label="First payment"
              value={value.splitStartsNow ? 'this' : 'next'}
              options={[{ value: 'this', label: 'This bill' }, { value: 'next', label: 'Next bill' }]}
              onChange={(next) => set({ splitStartsNow: next === 'this' })}
            />
          </div>
          {plan && schedule && amount !== null && plan.amount <= amount && (
            <p className="text-xs leading-relaxed text-ink-2">
              {plan.startsThisBill
                ? `Pay ${formatYen(amount - plan.amount + schedule.first)} with this bill: ${formatYen(amount - plan.amount)} plus the first of ${plan.months} payments, ${formatYen(schedule.first)}. Then ${formatYen(schedule.monthly)} is added to each of the next ${plan.months - 1} ${card.name} bills.`
                : `Pay ${formatYen(amount - plan.amount)} with this bill. About ${formatYen(Math.ceil(schedule.total / plan.months))} is added to each of the next ${plan.months} ${card.name} bills.`}
              {' '}The fee is {formatYen(schedule.fee)} in all. The card app shows which bill the first payment is on when you apply.
            </p>
          )}
        </div>
      )}

      {error && <p className="text-xs text-bad">{error}</p>}
    </div>
  );
};
