import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Delete, PenLine } from 'lucide-react';
import { Category, Transaction } from '../types';
import { EXPENSE_CATEGORIES } from '../constants';
import { formatWeekdayDate, todayLocalDate } from '../utils/jpCalendar';
import { formatSignedYen, formatYen } from '../utils/format';
import { localDateInputToIso } from '../utils/date';
import { isBalanceAdjustment } from '../utils/transactions';
import { minuteOfDay, summarizeNotes, usualPrice } from '../utils/quickEntry';
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
const MAX_NOTE_SUGGESTIONS = 8;

const MAX_SHORTCUTS = 4;

const sameNote = (a: string, b: string) => a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();

export const CashEntry: React.FC<CashEntryProps> = ({ transactions, left, onSave, onLogIncome }) => {
  const recentExpenses = useMemo(() => {
    const cutoff = Date.now() - 120 * DAY_MS;
    return transactions.filter((transaction) =>
      transaction.type === 'expense' && CASH_CATEGORIES.includes(transaction.category) && !isBalanceAdjustment(transaction)
      && new Date(transaction.date).getTime() >= cutoff);
  }, [transactions]);

  const orderedCategories = useMemo(() => {
    const counts = new Map<Category, number>();
    for (const transaction of recentExpenses) counts.set(transaction.category, (counts.get(transaction.category) ?? 0) + 1);
    return [...CASH_CATEGORIES].sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0));
  }, [recentExpenses]);

  // The pad opens fresh each time, so the time it opened is "now" for ordering suggestions.
  const [openedAt] = useState(() => minuteOfDay(new Date()));
  const noteUses = useMemo(() => summarizeNotes(recentExpenses, openedAt), [recentExpenses, openedAt]);

  // Fill in the amount too, but only for things that cost the same each time (a morning
  // coffee). Lunch at a different price each day stays a note suggestion.
  const shortcuts = useMemo(() => noteUses.flatMap((use) => {
    const amount = usualPrice(use.amounts);
    return amount === null ? [] : [{ description: use.note, category: use.category, amount }];
  }).slice(0, MAX_SHORTCUTS), [noteUses]);

  // Notes used before in each category, so a note is usually a tap away instead of the phone keyboard.
  const notesByCategory = useMemo(() => {
    const notes = new Map<Category, string[]>();
    for (const use of noteUses) {
      const list = notes.get(use.category) ?? [];
      if (list.length < MAX_NOTE_SUGGESTIONS) notes.set(use.category, [...list, use.note]);
    }
    return notes;
  }, [noteUses]);

  const [digits, setDigits] = useState('');
  const [category, setCategory] = useState<Category>(orderedCategories[0] ?? Category.Food);
  const [note, setNote] = useState('');
  const [date, setDate] = useState(todayLocalDate());
  const [writingNote, setWritingNote] = useState(false);
  const [showDate, setShowDate] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const amount = Number(digits || 0);
  const isToday = date === todayLocalDate();
  const visibleCategories = showAll ? orderedCategories : [...new Set([...orderedCategories.slice(0, 4), category])];
  const noteSuggestions = notesByCategory.get(category) ?? [];
  // The text field shows when writing, or for a note that isn't one of the suggestions, so a note is never hidden.
  const showNoteField = writingNote || (note.trim() !== '' && !noteSuggestions.some((suggestion) => sameNote(suggestion, note)));

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
          <div className="scrollbar-none flex gap-1.5 overflow-x-auto">
            {shortcuts.map((shortcut) => (
              <button
                key={`${shortcut.category}-${shortcut.description}`}
                type="button"
                onClick={() => { setDigits(String(shortcut.amount)); setCategory(shortcut.category); setNote(shortcut.description); setWritingNote(false); setError(null); }}
                className="shrink-0 rounded-lg bg-subtle px-3 py-2 text-[13px] text-ink transition hover:bg-line"
              >
                {shortcut.description} <span className="text-ink-2">{formatYen(shortcut.amount)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <div className="scrollbar-none flex gap-1.5 overflow-x-auto" role="group" aria-label="Note">
          {!showNoteField && (
            <button type="button" onClick={() => setWritingNote(true)} className="chip shrink-0">
              <PenLine size={14} /> {noteSuggestions.length ? 'Write' : 'Add note'}
            </button>
          )}
          {noteSuggestions.map((suggestion) => {
            const chosen = sameNote(suggestion, note);
            return (
              <button
                key={suggestion}
                type="button"
                onClick={() => { setNote(chosen ? '' : suggestion); setWritingNote(false); setError(null); }}
                aria-pressed={chosen}
                className={`shrink-0 ${chosen ? 'chip-on' : 'chip'}`}
              >
                {suggestion}
              </button>
            );
          })}
        </div>
        {showNoteField && (
          // Focused only when opened with Write, so tapping a shortcut doesn't pop up the keyboard.
          <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Lunch at work" aria-label="Note" className="field h-10" maxLength={80} autoFocus={writingNote} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void save(); } }} />
        )}
      </div>

      <div className="flex flex-wrap gap-2">
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
