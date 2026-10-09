import React, { useId } from 'react';
import { ChevronDown, Trash2 } from 'lucide-react';
import { Bill, BusinessDayShift } from '../types';
import { billDueDatesIn } from '../utils/payCycle';
import { addDays, formatWeekdayDate, todayLocalDate } from '../utils/jpCalendar';
import { formatYen, parseAmount } from '../utils/format';
import { AmountInput } from './ui/AmountInput';
import { BillIcon } from './ui/BillIcon';
import { Segmented } from './ui/Segmented';

export type BillDraft = Omit<Bill, 'amount'> & { amount: string };

const DAYS = Array.from({ length: 31 }, (_, index) => index + 1);
const MONTHS = Array.from({ length: 12 }, (_, index) => ({
  value: index + 1,
  label: new Date(2026, index, 1).toLocaleDateString(undefined, { month: 'long' }),
}));

const ordinal = (day: number) => {
  const suffix = day % 100 >= 11 && day % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[day % 10] ?? 'th';
  return `${day}${suffix}`;
};

/** "Monthly on the 27th · moves later on weekends" */
export const describeBill = (bill: Pick<Bill, 'dueDay' | 'shift' | 'frequency' | 'month'>) => {
  const monthName = MONTHS.find((month) => month.value === bill.month)?.label ?? '';
  const when = bill.frequency === 'yearly'
    ? bill.dueDay === 'last' ? `Yearly, end of ${monthName}` : `Yearly on ${monthName} ${bill.dueDay}`
    : bill.dueDay === 'last' ? 'Monthly, end of month' : `Monthly on the ${ordinal(bill.dueDay)}`;
  const shift = bill.shift === 'next' ? ' · moves later on weekends' : bill.shift === 'previous' ? ' · moves earlier on weekends' : '';
  return when + shift;
};

/** The next due date the rules produce, from today. */
const nextDueDate = (bill: BillDraft) => {
  const today = todayLocalDate();
  return billDueDatesIn({ ...bill, amount: 0 }, today, addDays(today, 400))[0] ?? null;
};

interface BillEditorProps {
  bill: BillDraft;
  expanded: boolean;
  problem: string | null;
  onToggle: () => void;
  onChange: (patch: Partial<BillDraft>) => void;
  onRemove: () => void;
}

export const BillEditor: React.FC<BillEditorProps> = ({ bill, expanded, problem, onToggle, onChange, onRemove }) => {
  const id = useId();
  const amount = parseAmount(bill.amount);
  const next = nextDueDate(bill);
  const isYearly = bill.frequency === 'yearly';

  return (
    <div className={`overflow-hidden rounded-xl border ${problem ? 'border-bad/60' : expanded ? 'border-accent/50' : 'border-line'}`}>
      <button type="button" onClick={onToggle} aria-expanded={expanded} className="flex w-full items-center gap-3 px-3 py-3 text-left transition hover:bg-subtle/60">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-subtle text-ink-2"><BillIcon name={bill.name} size={16} /></span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-ink">{bill.name.trim() || 'New bill'}</span>
          <span className="block text-xs leading-snug text-ink-3">{describeBill(bill)}</span>
        </span>
        {amount ? (
          <span className="shrink-0 text-right text-sm tabular-nums text-ink">
            {bill.variable ? '~' : ''}{formatYen(amount)}
            {bill.variable && <span className="block text-[11px] text-ink-3">varies</span>}
          </span>
        ) : (
          <span className="shrink-0 rounded-md bg-warn-soft px-2 py-1 text-xs text-warn">{bill.variable ? 'Add estimate' : 'Add amount'}</span>
        )}
        <ChevronDown size={16} className={`shrink-0 text-ink-3 transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      {expanded && (
        <div className="space-y-4 border-t border-line px-3 py-4">
          <div className="grid grid-cols-[minmax(0,1fr)_128px] gap-2">
            <div>
              <label htmlFor={`${id}-name`} className="field-label">Name</label>
              <input id={`${id}-name`} value={bill.name} onChange={(event) => onChange({ name: event.target.value })} placeholder="Rent" className="field" autoFocus={!bill.name} />
            </div>
            <div>
              <label htmlFor={`${id}-amount`} className="field-label">{bill.variable ? 'Typical amount' : 'Amount'}</label>
              <AmountInput id={`${id}-amount`} value={bill.amount} onChange={(value) => onChange({ amount: value })} placeholder="0" />
            </div>
          </div>

          <div className="-mt-1 space-y-1.5">
            <Segmented
              label="Does the amount change?"
              value={bill.variable ? 'varies' : 'fixed'}
              options={[{ value: 'fixed', label: 'Same every time' }, { value: 'varies', label: 'Changes each time' }]}
              onChange={(value) => onChange({ variable: value === 'varies' })}
            />
            {bill.variable && <p className="text-xs leading-relaxed text-ink-3">The typical amount is set aside; you confirm the real one when the bill comes.</p>}
          </div>

          <div className="space-y-1.5">
            <p className="field-label mb-0">Repeats</p>
            <Segmented
              label="Repeats"
              value={isYearly ? 'yearly' : 'monthly'}
              options={[{ value: 'monthly', label: 'Every month' }, { value: 'yearly', label: 'Every year' }]}
              onChange={(value) => onChange(value === 'yearly'
                ? { frequency: 'yearly', month: bill.month ?? new Date().getMonth() + 1 }
                : { frequency: 'monthly', month: undefined })}
            />
          </div>

          <div className={isYearly ? 'grid grid-cols-2 gap-2' : ''}>
            {isYearly && (
              <div>
                <label htmlFor={`${id}-month`} className="field-label">Month</label>
                <select id={`${id}-month`} value={bill.month ?? 1} onChange={(event) => onChange({ month: Number(event.target.value) })} className="field px-2 text-sm">
                  {MONTHS.map((month) => <option key={month.value} value={month.value}>{month.label}</option>)}
                </select>
              </div>
            )}
            <div>
              <label htmlFor={`${id}-day`} className="field-label">Due</label>
              <select
                id={`${id}-day`}
                value={String(bill.dueDay)}
                onChange={(event) => onChange({ dueDay: event.target.value === 'last' ? 'last' : Number(event.target.value) })}
                className="field px-2 text-sm"
              >
                {DAYS.map((day) => <option key={day} value={day}>{isYearly ? `Day ${day}` : `The ${ordinal(day)}`}</option>)}
                <option value="last">End of month</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="field-label mb-0">If it falls on a weekend or holiday</p>
            <Segmented<BusinessDayShift>
              label="If it falls on a weekend or holiday"
              value={bill.shift}
              options={[{ value: 'none', label: 'Same day' }, { value: 'previous', label: 'Move earlier' }, { value: 'next', label: 'Move later' }]}
              onChange={(shift) => onChange({ shift })}
            />
          </div>

          {next && <p className="rounded-lg bg-subtle px-3 py-2 text-[13px] text-ink-2">Next due <span className="text-ink">{formatWeekdayDate(next)}</span></p>}
          {problem && <p className="text-xs text-bad">{problem}</p>}

          <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={onRemove} className="btn-ghost -ml-2 text-bad hover:bg-bad-soft hover:text-bad"><Trash2 size={14} /> Remove bill</button>
            <button type="button" onClick={onToggle} className="btn min-h-9 px-4 text-[13px]">Done</button>
          </div>
        </div>
      )}
    </div>
  );
};
