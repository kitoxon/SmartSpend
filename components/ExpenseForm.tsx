
import React, { useState, useEffect } from 'react';
import { Category, Transaction, TransactionType, RecurringTransaction } from '../types';
import { INCOME_CATEGORIES, EXPENSE_CATEGORIES } from '../constants';
import { Repeat, TrendingDown, TrendingUp } from 'lucide-react';
import { saveRecurringTransaction } from '../services/storageService';
import { getNextRecurringDate, localDateInputToIso } from '../utils/date';

interface TransactionFormProps {
  onSave: (transaction: Omit<Transaction, 'id'>, existingId?: string) => void | Promise<void>;
  onCancel: () => void;
  transaction?: Transaction;
  prefill?: Partial<Pick<Transaction, 'type' | 'amount' | 'description' | 'category' | 'date'>>;
}

export const ExpenseForm: React.FC<TransactionFormProps> = ({ onSave, onCancel, transaction, prefill }) => {
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
  const [error, setError] = useState<string | null>(null);

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
    
    if (isRecurring) {
       const baseDate = new Date(transactionDate);
       const anchorDay = baseDate.getDate();
       const rule: RecurringTransaction = {
         id: crypto.randomUUID(),
         frequency,
         nextDue: getNextRecurringDate(baseDate, frequency, anchorDay).toISOString(),
         anchorDay,
         transactionTemplate: { amount: numericAmount, description: `(Recurring) ${description.trim()}`, category, type }
       };
       await saveRecurringTransaction(rule);
    }

    await onSave({ amount: numericAmount, description: description.trim(), category, date: transactionDate, type }, transaction?.id);
  };

  const categoriesToShow = type === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Type Toggles */}
      <div className="grid grid-cols-2 gap-2 p-1 bg-zinc-800 rounded-lg border border-zinc-700/50">
        <button
          type="button"
          onClick={() => handleTypeChange('expense')}
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
          onClick={() => handleTypeChange('income')}
          className={`flex items-center justify-center gap-2 py-2.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ${
            type === 'income' 
              ? 'bg-zinc-100 text-zinc-900 shadow-sm' 
              : 'text-zinc-500 hover:text-zinc-400'
          }`}
        >
          <TrendingUp size={14} /> Income
        </button>
      </div>

      {/* Amount */}
      <div>
        <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Amount (¥)</label>
        <input
          type="number"
          min="1"
          step="1"
          required
          value={amount}
          onChange={(e) => { setAmount(e.target.value); setError(null); }}
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
          onChange={(e) => setDescription(e.target.value)}
          placeholder={type === 'expense' ? "e.g., Dinner" : "e.g., Salary"}
          className="w-full h-12 px-3 bg-zinc-800 border border-zinc-700 rounded-lg focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 transition-all text-zinc-200 placeholder-zinc-600 outline-none text-sm"
        />
      </div>

      {/* Category */}
      <div>
        <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Category</label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as Category)}
          className="w-full h-12 px-3 bg-zinc-800 border border-zinc-700 rounded-lg focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 text-zinc-200 outline-none text-sm appearance-none"
        >
          {categoriesToShow.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Date & Recurring */}
      <div className="flex gap-3 items-end">
        <div className="flex-1">
            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Date</label>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full h-12 px-3 bg-zinc-800 border border-zinc-700 rounded-lg focus:border-zinc-500 text-zinc-200 outline-none text-sm"
            />
        </div>
        <div>
             <label className="block text-[10px] font-bold text-transparent uppercase tracking-wider mb-1.5 select-none">Repeat</label>
             <button 
               type="button"
               onClick={() => setIsRecurring(!isRecurring)}
               aria-pressed={isRecurring}
               aria-label="Toggle recurring transaction"
               className={`h-12 w-12 rounded-lg border flex items-center justify-center gap-2 transition-all ${isRecurring ? 'bg-zinc-100 border-zinc-200 text-zinc-900' : 'bg-zinc-800 border-zinc-700 text-zinc-500'}`}
             >
                <Repeat size={18} />
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
         </div>
      )}

      {error && <p className="text-[10px] text-red-400">{error}</p>}

      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onCancel} className="flex-1 h-12 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-400 font-bold text-xs uppercase tracking-wide rounded-lg transition-colors">Cancel</button>
        <button type="submit" className="flex-1 h-12 text-zinc-950 font-bold text-xs uppercase tracking-wide rounded-lg shadow-lg transition-all active:scale-95 bg-white hover:bg-zinc-200">Save</button>
      </div>
    </form>
  );
};
