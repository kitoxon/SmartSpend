import React, { useId } from 'react';
import { Card, CardStatement, Debt } from '../types';
import { formatWeekdayDate } from '../utils/jpCalendar';
import { formatMonthName, formatYen, parseAmount } from '../utils/format';
import { unusuallyHighBy } from '../utils/payCycle';
import { AmountInput } from './ui/AmountInput';
import { CardSplitInput, installmentDueOnBill } from '../services/planner';

export interface CardBillValue {
  amount: string;
  installment: string;
  splitOn: boolean;
  splitAmount: string;
  months: number;
  rate: string;
}

export const SPLIT_MONTH_OPTIONS = [3, 5, 6, 10, 12];
export const DEFAULT_SPLIT_RATE = '15';

export const emptyCardBillValue = (amount: number | null, installment: number, split?: { amount: number; months: number; rate: number }): CardBillValue => ({
  amount: amount === null ? '' : String(amount),
  installment: installment > 0 ? String(installment) : '',
  splitOn: Boolean(split),
  splitAmount: split ? String(split.amount) : '',
  months: split?.months ?? 3,
  rate: split ? String(split.rate) : DEFAULT_SPLIT_RATE,
});

/** Form state for a card bill: the saved statement if there is one, otherwise blank with installments due. */
export const cardBillValueFor = (card: Card, usageMonth: string, statement: CardStatement | undefined, debts: Debt[], statements: CardStatement[]) => {
  if (!statement) return emptyCardBillValue(null, installmentDueOnBill(card, usageMonth, debts, statements));
  const splitDebt = statement.splitDebtId ? debts.find((debt) => debt.id === statement.splitDebtId) : undefined;
  return emptyCardBillValue(statement.amount, statement.installment, splitDebt ? {
    amount: statement.splitAmount,
    months: Math.max(1, Math.round(statement.splitAmount / (splitDebt.minimumPayment || statement.splitAmount))),
    rate: splitDebt.interestRate ?? 0,
  } : undefined);
};

export const readSplit = (value: CardBillValue): CardSplitInput | null => {
  if (!value.splitOn) return null;
  const amount = parseAmount(value.splitAmount);
  const rate = Number(value.rate);
  if (!amount) return null;
  return { amount, months: value.months, rate: Number.isFinite(rate) && rate >= 0 ? rate : 0 };
};

/**
 * Validation message for a card bill, or null when it can be saved. While the
 * user is still typing (`final` false), a split amount that is not entered yet
 * is not reported.
 */
export const cardBillError = (value: CardBillValue, final = true) => {
  const amount = parseAmount(value.amount);
  if (amount === null) return null;
  const installment = parseAmount(value.installment) ?? 0;
  if (installment > amount) return 'The installment cannot be more than the bill.';
  const split = readSplit(value);
  if (value.splitOn && !split) return final ? 'Enter how much to split.' : null;
  if (split && split.amount >= amount) return 'Leave some of the bill to pay now, or pay it in full.';
  return null;
};

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
}

export const CardBillFields: React.FC<CardBillFieldsProps> = ({ card, usageMonth, dueDate, value, onChange, estimate, lastBill, usual, showInstallment }) => {
  const id = useId();
  const amount = parseAmount(value.amount);
  const split = readSplit(value);
  const error = cardBillError(value, false);
  const highBy = amount !== null ? unusuallyHighBy(amount - (parseAmount(value.installment) ?? 0), usual) : null;
  const set = (patch: Partial<CardBillValue>) => onChange({ ...value, ...patch });
  const splitMonthly = split ? Math.ceil(split.amount / split.months) + Math.round((split.amount * split.rate) / 100 / 12) : 0;

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

      {value.splitOn && (
        <div className="space-y-3 rounded-lg border border-line p-3">
          <div className="grid grid-cols-[minmax(0,1fr)_88px] gap-2">
            <div>
              <label htmlFor={`${id}-split`} className="field-label">Amount to split</label>
              <AmountInput id={`${id}-split`} value={value.splitAmount} onChange={(next) => set({ splitAmount: next })} />
            </div>
            <div>
              <label htmlFor={`${id}-rate`} className="field-label">Interest %</label>
              <input id={`${id}-rate`} type="text" inputMode="decimal" value={value.rate} onChange={(event) => set({ rate: event.target.value.replace(/[^\d.]/g, '') })} className="field tabular-nums" />
            </div>
          </div>
          <div>
            <p className="field-label">Payments</p>
            <div className="flex flex-wrap gap-1.5">
              {SPLIT_MONTH_OPTIONS.map((months) => (
                <button key={months} type="button" onClick={() => set({ months })} className={value.months === months ? 'chip-on' : 'chip'} aria-pressed={value.months === months}>
                  {months}×
                </button>
              ))}
            </div>
          </div>
          {split && amount !== null && split.amount < amount && (
            <p className="text-xs leading-relaxed text-ink-2">
              Pay {formatYen(amount - split.amount)} now. About {formatYen(splitMonthly)} a month is added to the next {split.months} {card.name} bills.
            </p>
          )}
        </div>
      )}

      {error && <p className="text-xs text-bad">{error}</p>}
    </div>
  );
};
