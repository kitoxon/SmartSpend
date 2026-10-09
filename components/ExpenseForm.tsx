import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Trash2 } from 'lucide-react';
import { Category, Transaction, TransactionType } from '../types';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../constants';
import { localDateInputToIso } from '../utils/date';
import { fromDate, todayLocalDate } from '../utils/jpCalendar';
import { CategoryIcon } from './ui/CategoryIcon';
import { AmountInput } from './ui/AmountInput';

interface TransactionFormProps {
  onSave: (transaction: Omit<Transaction, 'id'>, existingId?: string) => void | Promise<void>;
  onCancel: () => void;
  transaction?: Transaction;
  prefill?: Partial<Pick<Transaction, 'type' | 'amount' | 'description' | 'category' | 'date'>>;
  existingTransactions?: Transaction[];
  onDelete?: () => void;
}

const defaultCategory = (type: TransactionType) => (type === 'income' ? Category.Freelance : Category.Food);

export const ExpenseForm: React.FC<TransactionFormProps> = ({ onSave, onCancel, transaction, prefill, existingTransactions = [], onDelete }) => {
  const initialType = transaction?.type ?? prefill?.type ?? 'expense';
  const [type, setType] = useState<TransactionType>(initialType);
  const [amount, setAmount] = useState(transaction ? String(transaction.amount) : prefill?.amount !== undefined ? String(prefill.amount) : '');
  const [description, setDescription] = useState(transaction?.description ?? prefill?.description ?? '');
  const [category, setCategory] = useState<Category>(transaction?.category ?? prefill?.category ?? defaultCategory(initialType));
  const [date, setDate] = useState(transaction ? fromDate(new Date(transaction.date)) : prefill?.date?.slice(0, 10) ?? todayLocalDate());
  const [error, setError] = useState<string | null>(null);
  const [duplicateSignature, setDuplicateSignature] = useState<string | null>(null);
  const [showAllCategories, setShowAllCategories] = useState(false);

  useEffect(() => {
    if (!transaction) return;
    setType(transaction.type);
    setAmount(String(transaction.amount));
    setDescription(transaction.description);
    setCategory(transaction.category);
    setDate(fromDate(new Date(transaction.date)));
  }, [transaction]);

  const categories = type === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
  const orderedCategories = useMemo(() => {
    const counts = new Map<Category, number>();
    for (const existing of existingTransactions) {
      if (existing.type === type) counts.set(existing.category, (counts.get(existing.category) ?? 0) + 1);
    }
    return [...categories].sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0));
  }, [categories, existingTransactions, type]);
  const visibleCategories = showAllCategories ? orderedCategories : [...new Set([...orderedCategories.slice(0, 5), category])];

  const changeType = (nextType: TransactionType) => {
    setType(nextType);
    setDuplicateSignature(null);
    setShowAllCategories(false);
    const allowed = nextType === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
    if (!allowed.includes(category)) setCategory(defaultCategory(nextType));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError('Enter a positive amount.');
      return;
    }
    let isoDate: string;
    try {
      isoDate = localDateInputToIso(date);
    } catch {
      setError('Choose a valid date.');
      return;
    }

    const trimmed = description.trim();
    const signature = [type, category, numericAmount, trimmed.toLocaleLowerCase(), date].join('|');
    const possibleDuplicate = !transaction && existingTransactions.some((existing) =>
      existing.type === type
      && existing.category === category
      && existing.amount === numericAmount
      && existing.description.trim().toLocaleLowerCase() === trimmed.toLocaleLowerCase()
      && fromDate(new Date(existing.date)) === date);
    if (possibleDuplicate && duplicateSignature !== signature) {
      setDuplicateSignature(signature);
      setError('An identical entry already exists on this day. Save again to add it anyway.');
      return;
    }
    setError(null);
    await onSave({ amount: numericAmount, description: trimmed, category, date: isoDate, type }, transaction?.id);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-subtle p-1">
        {(['expense', 'income'] as TransactionType[]).map((option) => (
          <button key={option} type="button" onClick={() => changeType(option)} aria-pressed={type === option} className={`rounded-md py-2 text-sm transition ${type === option ? 'bg-card text-ink' : 'text-ink-2'}`}>
            {option === 'expense' ? 'Spending' : 'Income'}
          </button>
        ))}
      </div>

      <div>
        <label htmlFor="tx-amount" className="field-label">Amount</label>
        <AmountInput id="tx-amount" value={amount} onChange={(value) => { setAmount(value); setError(null); setDuplicateSignature(null); }} size="lg" placeholder="0" autoFocus={!transaction} />
      </div>

      <div>
        <label htmlFor="tx-note" className="field-label">Note <span className="text-ink-3">· optional</span></label>
        <input id="tx-note" type="text" value={description} onChange={(event) => { setDescription(event.target.value); setDuplicateSignature(null); }} placeholder={type === 'expense' ? 'Lunch at work' : 'Bonus'} className="field" maxLength={80} />
      </div>

      <div>
        <p className="field-label">Category</p>
        <div className="flex flex-wrap gap-1.5">
          {visibleCategories.map((option) => (
            <button key={option} type="button" onClick={() => { setCategory(option); setDuplicateSignature(null); }} aria-pressed={category === option} className={category === option ? 'chip-on' : 'chip'}>
              <CategoryIcon category={option} size={14} /> {option}
            </button>
          ))}
          {(orderedCategories.length > visibleCategories.length || showAllCategories) && (
            <button type="button" onClick={() => setShowAllCategories((value) => !value)} className="btn-ghost">
              {showAllCategories ? 'Fewer' : 'More'} <ChevronDown size={13} className={showAllCategories ? 'rotate-180' : ''} />
            </button>
          )}
        </div>
      </div>

      <div>
        <label htmlFor="tx-date" className="field-label">Date</label>
        <input id="tx-date" type="date" required value={date} onChange={(event) => { setDate(event.target.value); setDuplicateSignature(null); }} className="field" />
      </div>

      {error && <p className="text-xs text-bad">{error}</p>}

      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onCancel} className="btn flex-1">Cancel</button>
        <button type="submit" className="btn-primary flex-1">{transaction ? 'Save changes' : 'Save'}</button>
      </div>
      {transaction && onDelete && (
        <button type="button" onClick={onDelete} className="btn-ghost mx-auto flex text-bad hover:bg-bad-soft hover:text-bad">
          <Trash2 size={14} /> Delete
        </button>
      )}
    </form>
  );
};
