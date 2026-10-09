import React, { useState } from 'react';
import { Debt, DebtType, DebtCategory } from '../types';
import { localDateInputToIso } from '../utils/date';
import { Trash2 } from 'lucide-react';

interface DebtFormProps {
  onSave: (debt: Omit<Debt, 'id' | 'isPaid'>, existingId?: string) => void | Promise<void>;
  onCancel: () => void;
  debt?: Debt;
  onDelete?: () => void;
}

export const DebtForm: React.FC<DebtFormProps> = ({ onSave, onCancel, debt, onDelete }) => {
  const [amount, setAmount] = useState(debt ? debt.amount.toString() : '');
  const [person, setPerson] = useState(debt?.person ?? '');
  const [description] = useState(debt?.description ?? '');
  const [dueDate, setDueDate] = useState(debt ? debt.dueDate.split('T')[0] : new Date().toISOString().split('T')[0]);
  const type: DebtType = 'payable';
  const [category, setCategory] = useState<DebtCategory>(debt?.debtCategory ?? 'Credit Card');
  const [interestRate, setInterestRate] = useState(debt?.interestRate?.toString() ?? '');
  const [minimumPayment, setMinimumPayment] = useState(debt?.minimumPayment?.toString() ?? '');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !person.trim()) return;
    const numericAmount = parseFloat(amount);
    const numericInterest = interestRate ? parseFloat(interestRate) : undefined;
    const numericMinimum = minimumPayment ? parseFloat(minimumPayment) : undefined;
    if (!Number.isFinite(numericAmount) || numericAmount < 0 || (!debt && numericAmount === 0)) {
      setError('Enter a positive balance.');
      return;
    }
    if (numericInterest !== undefined && (!Number.isFinite(numericInterest) || numericInterest < 0 || numericInterest > 100)) {
      setError('Interest must be between 0% and 100%.');
      return;
    }
    if (numericMinimum !== undefined && (!Number.isFinite(numericMinimum) || numericMinimum <= 0)) {
      setError('Minimum payment must be positive.');
      return;
    }

    let dueDateIso: string;
    try {
      dueDateIso = localDateInputToIso(dueDate);
    } catch {
      setError('Choose a valid due date.');
      return;
    }
    setError(null);

    await onSave({
      amount: numericAmount,
      person: person.trim(),
      description,
      dueDate: dueDateIso,
      type,
      debtCategory: category,
      interestRate: numericInterest,
      minimumPayment: numericMinimum,
    }, debt?.id);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-ink-3 mb-1.5">Balance (¥)</label>
        <input
          type="number"
          min={debt ? '0' : '1'}
          step="1"
          inputMode="numeric"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="300000"
          className="w-full h-14 px-4 bg-subtle border border-line rounded-lg focus:border-accent focus:ring-1 focus:ring-accent text-2xl font-medium text-ink outline-none"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-ink-3 mb-1.5">Creditor Name</label>
        <input
          type="text"
          required
          value={person}
          onChange={(e) => setPerson(e.target.value)}
          placeholder="e.g. Bank Name"
          className="w-full h-12 px-3 bg-subtle border border-line rounded-lg focus:border-accent focus:ring-1 focus:ring-accent text-ink outline-none text-sm"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-ink-3 mb-1.5">Interest (%)</label>
          <input
            type="number"
            min="0"
            max="100"
            value={interestRate}
            onChange={(e) => setInterestRate(e.target.value)}
            placeholder="15.0"
            step="0.1"
            className="w-full h-12 px-3 bg-subtle border border-line rounded-lg focus:border-accent text-ink outline-none text-sm"
          />
        </div>
        <div>
           <label className="block text-xs font-medium text-ink-3 mb-1.5">Min Pay (¥)</label>
          <input
            type="number"
            min="1"
            step="1"
            value={minimumPayment}
            onChange={(e) => setMinimumPayment(e.target.value)}
            placeholder="¥"
            className="w-full h-12 px-3 bg-subtle border border-line rounded-lg focus:border-accent text-ink outline-none text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
            <label className="block text-xs font-medium text-ink-3 mb-1.5">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as DebtCategory)}
              className="w-full h-12 px-3 bg-subtle border border-line rounded-lg focus:border-accent text-ink outline-none text-sm appearance-none"
            >
               <option value="Credit Card">Credit Card</option>
               <option value="Loan">Loan</option>
               <option value="Bank">Bank</option>
               <option value="Personal">Personal</option>
               <option value="Other">Other</option>
            </select>
        </div>
        <div>
           <label className="block text-xs font-medium text-ink-3 mb-1.5">Due Date</label>
            <input
              type="date"
              required
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full h-12 px-3 bg-subtle border border-line rounded-lg focus:border-accent text-ink outline-none text-sm"
            />
        </div>
      </div>

      {error && <p className="text-xs text-bad">{error}</p>}

      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onCancel} className="flex-1 h-12 bg-card hover:bg-subtle border border-line text-ink-2 font-medium text-xs rounded-lg transition-colors">Cancel</button>
        <button type="submit" className="flex-1 h-12 bg-ink hover:opacity-90 text-on-ink font-medium text-xs rounded-lg transition-colors">
          {debt ? 'Update Debt' : 'Add Debt'}
        </button>
      </div>
      {debt && onDelete && (
        <button type="button" onClick={onDelete} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg text-xs font-medium text-bad transition hover:bg-bad-soft hover:text-bad">
          <Trash2 size={14} /> Delete debt
        </button>
      )}
    </form>
  );
};
