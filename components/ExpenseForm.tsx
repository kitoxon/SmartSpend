
import React, { useState, useEffect, useMemo } from 'react';
import { Category, Transaction, TransactionType, RecurringTransaction } from '../types';
import { CATEGORY_COLORS, INCOME_CATEGORIES, EXPENSE_CATEGORIES } from '../constants';
import { ChevronDown, Repeat, Sparkles, Trash2, TrendingDown, TrendingUp } from 'lucide-react';
import { saveRecurringTransaction } from '../services/storageService';
import { getNextRecurringDate, localDateInputToIso } from '../utils/date';

interface TransactionFormProps {
  onSave: (transaction: Omit<Transaction, 'id'>, existingId?: string) => void | Promise<void>;
  onCancel: () => void;
  transaction?: Transaction;
  prefill?: Partial<Pick<Transaction, 'type' | 'amount' | 'description' | 'category' | 'date'>>;
  existingTransactions?: Transaction[];
  onDelete?: () => void;
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
};

export const ExpenseForm: React.FC<TransactionFormProps> = ({ onSave, onCancel, transaction, prefill, existingTransactions = [], onDelete }) => {
  const todayLocal = new Date().toLocaleDateString('en-CA');
  const defaultCategory = (nextType: TransactionType) => nextType === 'income' ? Category.Salary : Category.Food;

  const prefillDate =
    prefill?.date ? (prefill.date.includes('T') ? prefill.date.split('T')[0] : prefill.date) : todayLocal;

  const initialType = transaction?.type ?? prefill?.type ?? 'expense';
  const [type, setType] = useState<TransactionType>(initialType);
  const [amount, setAmount] = useState(transaction ? transaction.amount.toString() : prefill?.amount?.toString() ?? '');
  const [description, setDescription] = useState(transaction?.description ?? prefill?.description ?? '');
  const [category, setCategory] = useState<Category>(transaction?.category ?? prefill?.category ?? defaultCategory(initialType));
  const [date, setDate] = useState(transaction ? transaction.date.split('T')[0] : prefillDate);
  const [isRecurring, setIsRecurring] = useState(false);
  const [frequency, setFrequency] = useState<'weekly' | 'monthly'>('monthly');
  const [requiresConfirmation, setRequiresConfirmation] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicateSignature, setDuplicateSignature] = useState<string | null>(null);
  const [showAllCategories, setShowAllCategories] = useState(false);

  useEffect(() => {
    if (transaction) {
      setType(transaction.type);
      setAmount(transaction.amount.toString());
      setDescription(transaction.description);
      setCategory(transaction.category);
      setDate(transaction.date.split('T')[0]);
    }
  }, [transaction]);

  useEffect(() => {
    if (transaction) return;
    if (!prefill) return;
    if (prefill.type) setType(prefill.type);
    if (prefill.amount !== undefined) setAmount(prefill.amount.toString());
    if (prefill.description) setDescription(prefill.description);
    if (prefill.category) setCategory(prefill.category);
    else if (prefill.type) setCategory(defaultCategory(prefill.type));
    if (prefill.date) setDate(prefillDate);
  }, [prefill, prefillDate, transaction]);

  const handleTypeChange = (nextType: TransactionType) => {
    setType(nextType);
    if (nextType === 'income') setRequiresConfirmation(false);
    setShowAllCategories(false);
    const allowed = nextType === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
    if (!allowed.includes(category)) setCategory(defaultCategory(nextType));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !description.trim()) return;
    const numericAmount = parseFloat(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError('Enter a positive amount.');
      return;
    }

    let transactionDate: string;
    try {
      transactionDate = localDateInputToIso(date);
    } catch {
      setError('Choose a valid date.');
      return;
    }
    setError(null);

    const signature = [type, category, numericAmount, description.trim().toLocaleLowerCase(), date].join('|');
    const possibleDuplicate = !transaction && existingTransactions.some((existing) =>
      existing.type === type &&
      existing.category === category &&
      existing.amount === numericAmount &&
      existing.description.trim().toLocaleLowerCase() === description.trim().toLocaleLowerCase() &&
      existing.date.split('T')[0] === date
    );
    if (possibleDuplicate && duplicateSignature !== signature) {
      setDuplicateSignature(signature);
      setError('Possible duplicate: an identical entry already exists today. Tap Save again to add it anyway.');
      return;
    }
    
    if (isRecurring) {
       const baseDate = new Date(transactionDate);
       const anchorDay = baseDate.getDate();
       const rule: RecurringTransaction = {
         id: crypto.randomUUID(),
         frequency,
         nextDue: getNextRecurringDate(baseDate, frequency, anchorDay).toISOString(),
         anchorDay,
         transactionTemplate: {
           amount: numericAmount,
           description: `(Recurring) ${description.trim()}`,
           category,
           type,
           requiresConfirmation: type === 'expense' && requiresConfirmation ? true : undefined,
         }
       };
       await saveRecurringTransaction(rule);
    }

    await onSave({ amount: numericAmount, description: description.trim(), category, date: transactionDate, type }, transaction?.id);
  };

  const categoriesToShow = type === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
  const suggestedEntries = useMemo(() => {
    const groups = new Map<string, { description: string; category: Category; amounts: number[]; count: number; latest: number }>();
    for (const existing of existingTransactions) {
      if (existing.type !== type) continue;
      const normalized = existing.description.replace(/^\(Recurring\)\s*/i, '').trim().toLocaleLowerCase();
      if (!normalized) continue;
      const key = `${existing.category}|${normalized}`;
      const timestamp = new Date(existing.date).getTime();
      const group = groups.get(key) ?? { description: existing.description.replace(/^\(Recurring\)\s*/i, '').trim(), category: existing.category, amounts: [], count: 0, latest: 0 };
      group.amounts.push(existing.amount);
      group.count++;
      group.latest = Math.max(group.latest, Number.isNaN(timestamp) ? 0 : timestamp);
      groups.set(key, group);
    }
    return [...groups.values()]
      .filter((entry) => entry.count >= 2)
      .sort((a, b) => b.count - a.count || b.latest - a.latest)
      .slice(0, 3)
      .map((entry) => ({ ...entry, amount: median(entry.amounts) }));
  }, [existingTransactions, type]);
  const orderedCategories = useMemo(() => {
    const counts = new Map<Category, number>();
    for (const existing of existingTransactions) {
      if (existing.type === type) counts.set(existing.category, (counts.get(existing.category) ?? 0) + 1);
    }
    return [...categoriesToShow].sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0));
  }, [existingTransactions, type]);
  const visibleCategories = showAllCategories
    ? orderedCategories
    : (() => {
        const top = orderedCategories.slice(0, 4);
        if (!top.includes(category)) top[top.length - 1] = category;
        return [...new Set(top)];
      })();
  const saveAmount = Number(amount);

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Type Toggles */}
      <div className="grid grid-cols-2 gap-2 p-1 bg-zinc-800 rounded-lg border border-zinc-700/50">
        <button
          type="button"
            onClick={() => { handleTypeChange('expense'); setDuplicateSignature(null); }}
          className={`flex items-center justify-center gap-2 py-2.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ${
            type === 'expense' 
              ? 'bg-zinc-700 text-white shadow-sm' 
              : 'text-zinc-500 hover:text-zinc-400'
          }`}
        >
          <TrendingDown size={14} /> Expense
        </button>
        <button
          type="button"
            onClick={() => { handleTypeChange('income'); setDuplicateSignature(null); }}
          className={`flex items-center justify-center gap-2 py-2.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ${
            type === 'income' 
              ? 'bg-zinc-100 text-zinc-900 shadow-sm' 
              : 'text-zinc-500 hover:text-zinc-400'
          }`}
        >
          <TrendingUp size={14} /> Income
        </button>
      </div>

      {!transaction && suggestedEntries.length > 0 && (
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500"><Sparkles size={12} /> Frequent entries</div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {suggestedEntries.map((entry) => (
              <button
                key={`${entry.category}-${entry.description}`}
                type="button"
                onClick={() => {
                  setAmount(entry.amount.toString());
                  setDescription(entry.description);
                  setCategory(entry.category);
                  setError(null);
                  setDuplicateSignature(null);
                }}
                className="min-w-[120px] rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-left transition hover:border-zinc-500"
              >
                <span className="block truncate text-xs font-bold text-zinc-200">{entry.description}</span>
                <span className="mt-0.5 block text-[10px] text-zinc-500">¥{entry.amount.toLocaleString()} · {entry.category}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Amount */}
      <div>
        <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Amount (¥)</label>
        <input
          type="number"
          min="1"
          step="1"
          inputMode="numeric"
          required
          autoFocus={!transaction}
          value={amount}
          onChange={(e) => { setAmount(e.target.value); setError(null); setDuplicateSignature(null); }}
          placeholder="0"
          className={`w-full h-14 px-4 bg-zinc-800 border border-zinc-700 rounded-lg focus:ring-1 transition-all text-2xl font-bold placeholder-zinc-600 outline-none ${
            type === 'income' ? 'focus:border-zinc-200 focus:ring-zinc-200 text-white' : 'focus:border-zinc-500 focus:ring-zinc-500 text-white'
          }`}
        />
      </div>

      {/* Description */}
      <div className="relative">
        <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Description</label>
        <input
          type="text"
          required
          value={description}
          onChange={(e) => { setDescription(e.target.value); setDuplicateSignature(null); }}
          placeholder={type === 'expense' ? "e.g., Dinner" : "e.g., Salary"}
          className="w-full h-12 px-3 bg-zinc-800 border border-zinc-700 rounded-lg focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 transition-all text-zinc-200 placeholder-zinc-600 outline-none text-sm"
        />
      </div>

      {/* Category */}
      <div>
        <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Category</label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {visibleCategories.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => { setCategory(option); setDuplicateSignature(null); }}
              className={`min-h-11 rounded-lg border px-2 py-2 text-xs font-semibold transition ${category === option ? 'border-zinc-400 bg-zinc-700 text-white' : 'border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-zinc-600'}`}
            >
              <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[option] }} />
              {option}
            </button>
          ))}
        </div>
        {orderedCategories.length > 4 && (
          <button type="button" onClick={() => setShowAllCategories((value) => !value)} className="mt-2 flex min-h-9 items-center gap-1 text-xs font-semibold text-zinc-500 hover:text-zinc-300">
            {showAllCategories ? 'Show frequent only' : `More categories (${orderedCategories.length - visibleCategories.length})`} <ChevronDown size={13} className={`transition-transform ${showAllCategories ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>

      {/* Date & Recurring */}
      <div className="flex gap-3 items-end">
        <div className="flex-1">
            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Date</label>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => { setDate(e.target.value); setDuplicateSignature(null); }}
              className="w-full h-12 px-3 bg-zinc-800 border border-zinc-700 rounded-lg focus:border-zinc-500 text-zinc-200 outline-none text-sm"
            />
        </div>
        <div>
             <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Repeat</label>
             <button 
               type="button"
               onClick={() => setIsRecurring(!isRecurring)}
               aria-pressed={isRecurring}
               aria-label="Toggle recurring transaction"
               className={`h-12 rounded-lg border px-3 flex items-center justify-center gap-2 transition-all ${isRecurring ? 'bg-zinc-100 border-zinc-200 text-zinc-900' : 'bg-zinc-800 border-zinc-700 text-zinc-500'}`}
             >
                <Repeat size={16} /><span className="text-xs font-semibold">Repeat</span>
             </button>
        </div>
      </div>

      {isRecurring && (
         <div className="bg-zinc-900 p-3 rounded-lg border border-zinc-800 animate-fade-in">
            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2">Repeat Frequency</label>
            <div className="flex gap-2">
               <button type="button" onClick={() => setFrequency('weekly')} className={`flex-1 py-2 rounded text-[10px] font-bold uppercase tracking-wide ${frequency === 'weekly' ? 'bg-zinc-700 text-white border border-zinc-600' : 'bg-zinc-950 text-zinc-600 border border-zinc-800'}`}>Weekly</button>
               <button type="button" onClick={() => setFrequency('monthly')} className={`flex-1 py-2 rounded text-[10px] font-bold uppercase tracking-wide ${frequency === 'monthly' ? 'bg-zinc-700 text-white border border-zinc-600' : 'bg-zinc-950 text-zinc-600 border border-zinc-800'}`}>Monthly</button>
            </div>
            {type === 'expense' && (
              <div className="mt-3 border-t border-zinc-800 pt-3">
                <label className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-zinc-500">Future bills</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setRequiresConfirmation(false)}
                    aria-pressed={!requiresConfirmation}
                    className={`rounded-lg border px-3 py-2.5 text-left transition ${!requiresConfirmation ? 'border-zinc-500 bg-zinc-700 text-white' : 'border-zinc-800 bg-zinc-950 text-zinc-500'}`}
                  >
                    <span className="block text-[10px] font-bold uppercase tracking-wide">Auto-add</span>
                    <span className="mt-1 block text-[10px] opacity-70">Exact amount</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRequiresConfirmation(true)}
                    aria-pressed={requiresConfirmation}
                    className={`rounded-lg border px-3 py-2.5 text-left transition ${requiresConfirmation ? 'border-zinc-400 bg-zinc-100 text-zinc-950' : 'border-zinc-800 bg-zinc-950 text-zinc-500'}`}
                  >
                    <span className="block text-[10px] font-bold uppercase tracking-wide">Confirm first</span>
                    <span className="mt-1 block text-[10px] opacity-70">Amount varies</span>
                  </button>
                </div>
                <p className="mt-2 text-[10px] leading-relaxed text-zinc-600">
                  {requiresConfirmation
                    ? 'The estimate reserves money in your forecast, then waits on Home for the real amount and date.'
                    : 'Future entries will be recorded automatically on their estimated date.'}
                </p>
              </div>
            )}
         </div>
      )}

      {error && <p className="text-[10px] text-red-400">{error}</p>}

      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onCancel} className="flex-1 h-12 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-400 font-bold text-xs uppercase tracking-wide rounded-lg transition-colors">Cancel</button>
        <button type="submit" className="flex-1 h-12 text-zinc-950 font-bold text-xs uppercase tracking-wide rounded-lg shadow-lg transition-all active:scale-95 bg-white hover:bg-zinc-200">
          {transaction ? 'Update' : 'Save'}{Number.isFinite(saveAmount) && saveAmount > 0 ? ` · ¥${saveAmount.toLocaleString()}` : ''}
        </button>
      </div>
      {transaction && onDelete && (
        <button type="button" onClick={onDelete} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg text-xs font-semibold text-rose-400 transition hover:bg-rose-500/10 hover:text-rose-300">
          <Trash2 size={14} /> Delete transaction
        </button>
      )}
    </form>
  );
};
