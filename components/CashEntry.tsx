import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Delete, PenLine } from 'lucide-react';
import { Category, Transaction } from '../types';
import { EXPENSE_CATEGORIES } from '../constants';
import { formatWeekdayDate, todayLocalDate } from '../utils/jpCalendar';
import { formatSignedYen, formatYen } from '../utils/format';
import { localDateInputToIso } from '../utils/date';
import { CategoryIcon } from './ui/CategoryIcon';

interface CashEntryProps {
  transactions: Transaction[];
  left: number | null;
  onSave: (transaction: Omit<Transaction, 'id'>) => Promise<void>;
  onLogIncome: () => void;
}

// Debt payments and savings transfers are recorded elsewhere, not as cash spending.
const CASH_CATEGORIES: Category[] = EXPENSE_CATEGORIES.filter((category) => category !== Category.Debt && category !== Category.Savings);
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', 'back'] as const;
const DAY_MS = 86_400_000;

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
};

export const CashEntry: React.FC<CashEntryProps> = ({ transactions, left, onSave, onLogIncome }) => {
  const recentExpenses = useMemo(() => {
    const cutoff = Date.now() - 120 * DAY_MS;
    return transactions.filter((transaction) =>
      transaction.type === 'expense' && CASH_CATEGORIES.includes(transaction.category) && new Date(transaction.date).getTime() >= cutoff);
  }, [transactions]);

  const orderedCategories = useMemo(() => {
    const counts = new Map<Category, number>();
    for (const transaction of recentExpenses) counts.set(transaction.category, (counts.get(transaction.category) ?? 0) + 1);
    return [...CASH_CATEGORIES].sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0));
  }, [recentExpenses]);

  const shortcuts = useMemo(() => {
    const groups = new Map<string, { description: string; category: Category; amounts: number[] }>();
    for (const transaction of recentExpenses) {
      const description = transaction.description.replace(/^\(Recurring\)\s*/i, '').trim();
      if (!description) continue;
      const key = `${transaction.category}|${description.toLocaleLowerCase()}`;
      const group = groups.get(key) ?? { description, category: transaction.category, amounts: [] };
      group.amounts.push(transaction.amount);
      groups.set(key, group);
    }
    return [...groups.values()]
      .filter((group) => group.amounts.length >= 2)
      .sort((a, b) => b.amounts.length - a.amounts.length)
      .slice(0, 4)
      .map((group) => ({ ...group, amount: median(group.amounts) }));
  }, [recentExpenses]);

  const [digits, setDigits] = useState('');
  const [category, setCategory] = useState<Category>(orderedCategories[0] ?? Category.Food);
  const [note, setNote] = useState('');
  const [date, setDate] = useState(todayLocalDate());
  const [showNote, setShowNote] = useState(false);
  // Focus the note only when asked for, so a shortcut fill doesn't pop up the phone keyboard.
  const [focusNote, setFocusNote] = useState(false);
  const [showDate, setShowDate] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const amount = Number(digits || 0);
  const isToday = date === todayLocalDate();
  const visibleCategories = showAll ? orderedCategories : [...new Set([...orderedCategories.slice(0, 4), category])];

  const press = useCallback((key: (typeof KEYS)[number]) => {
    setError(null);
    setDigits((current) => {
      if (key === 'back') return current.slice(0, -1);
      const next = (current + key).replace(/^0+/, '');
      return next.length > 9 ? current : next;
    });
  }, []);

  const save = useCallback(async () => {
    if (saving) return;
    if (amount <= 0) {
      setError('Enter an amount.');
      return;
    }
    setSaving(true);
    try {
      await onSave({ type: 'expense', amount, category, description: note.trim(), date: localDateInputToIso(date), created_at: new Date().toISOString() });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save.');
      setSaving(false);
    }
  }, [amount, category, date, note, onSave, saving]);

  // Typing works too on a computer, unless a text field has focus.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement | null)?.matches('input, textarea, select')) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (/^\d$/.test(event.key)) { event.preventDefault(); press(event.key as (typeof KEYS)[number]); }
      else if (event.key === 'Backspace') { event.preventDefault(); press('back'); }
      else if (event.key === 'Enter') { event.preventDefault(); void save(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [press, save]);

  return (
    <div className="space-y-4">
      <div className="text-center">
        <p className={`text-[38px] font-medium leading-tight tabular-nums ${amount > 0 ? 'text-ink' : 'text-ink-3'}`} aria-live="polite">{formatYen(amount)}</p>
        <p className="text-xs text-ink-3">
          {isToday ? 'Today' : formatWeekdayDate(date)}
          {left !== null && ` · leaves ${formatSignedYen(left - amount)}`}
        </p>
      </div>

      <div>
        <div className="flex flex-wrap gap-1.5">
          {visibleCategories.map((option) => (
            <button key={option} type="button" onClick={() => setCategory(option)} aria-pressed={category === option} className={category === option ? 'chip-on' : 'chip'}>
              <CategoryIcon category={option} size={14} /> {option}
            </button>
          ))}
          {!showAll && orderedCategories.length > visibleCategories.length && (
            <button type="button" onClick={() => setShowAll(true)} className="btn-ghost">More</button>
          )}
        </div>
      </div>

      {shortcuts.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs text-ink-3">Frequent</p>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {shortcuts.map((shortcut) => (
              <button
                key={`${shortcut.category}-${shortcut.description}`}
                type="button"
                onClick={() => { setDigits(String(shortcut.amount)); setCategory(shortcut.category); setNote(shortcut.description); setShowNote(true); setError(null); }}
                className="shrink-0 rounded-lg bg-subtle px-3 py-2 text-[13px] text-ink transition hover:bg-line"
              >
                {shortcut.description} <span className="text-ink-2">{formatYen(shortcut.amount)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {showNote ? (
          <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Lunch at work" aria-label="Note" className="field h-10 min-w-0 flex-1" maxLength={80} autoFocus={focusNote} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void save(); } }} />
        ) : (
          <button type="button" onClick={() => { setFocusNote(true); setShowNote(true); }} className="btn-ghost"><PenLine size={14} /> Add note</button>
        )}
        {showDate ? (
          <input type="date" value={date} max={todayLocalDate()} onChange={(event) => event.target.value && setDate(event.target.value)} aria-label="Date" className="field h-10 w-auto" />
        ) : (
          <button type="button" onClick={() => setShowDate(true)} className="btn-ghost"><CalendarDays size={14} /> Change date</button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        {KEYS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => press(key)}
            aria-label={key === 'back' ? 'Delete digit' : key}
            className="flex h-12 items-center justify-center rounded-lg bg-subtle text-lg text-ink transition hover:bg-line active:scale-[0.97]"
          >
            {key === 'back' ? <Delete size={20} /> : key}
          </button>
        ))}
      </div>

      {error && <p className="text-center text-xs text-bad">{error}</p>}
      <button type="button" onClick={() => void save()} disabled={saving} className="btn-primary h-12 w-full text-[15px]">
        {saving ? 'Saving…' : amount > 0 ? `Save ${formatYen(amount)}` : 'Save'}
      </button>
      <button type="button" onClick={onLogIncome} className="btn-ghost mx-auto flex">Log income instead</button>
    </div>
  );
};
