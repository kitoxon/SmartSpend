import React, { useState } from 'react';
import { Goal } from '../types';
import { Target, Trash2, TrendingUp } from 'lucide-react';
import { GOAL_ICON_OPTIONS, GoalIcon, normalizeGoalIcon } from './ui/GoalIcon';

interface GoalFormProps {
  onSave: (goal: Omit<Goal, 'id'>, existingId?: string) => void | Promise<void>;
  onCancel: () => void;
  goal?: Goal;
  onDelete?: () => void;
}

export const GoalForm: React.FC<GoalFormProps> = ({ onSave, onCancel, goal, onDelete }) => {
  const [name, setName] = useState(goal?.name ?? '');
  const [targetAmount, setTargetAmount] = useState(goal ? goal.targetAmount.toString() : '');
  const [currentAmount, setCurrentAmount] = useState(goal ? goal.currentAmount.toString() : '');
  const [monthlyContribution, setMonthlyContribution] = useState(goal?.monthlyContribution?.toString() ?? '');
  const [deadline, setDeadline] = useState(goal?.deadline ? goal.deadline.split('T')[0] : '');
  const [icon, setIcon] = useState(normalizeGoalIcon(goal?.icon));
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !targetAmount) return;
    const numericTarget = parseFloat(targetAmount);
    const numericCurrent = currentAmount ? parseFloat(currentAmount) : 0;
    const numericMonthly = monthlyContribution ? parseFloat(monthlyContribution) : 0;
    if (!Number.isFinite(numericTarget) || numericTarget <= 0) {
      setError('Target amount must be positive.');
      return;
    }
    if (!Number.isFinite(numericCurrent) || numericCurrent < 0 || !Number.isFinite(numericMonthly) || numericMonthly < 0) {
      setError('Saved amounts cannot be negative.');
      return;
    }
    setError(null);

    await onSave({
      name: name.trim(),
      targetAmount: numericTarget,
      currentAmount: numericCurrent,
      deadline,
      icon,
      monthlyContribution: numericMonthly,
      startDate: goal?.startDate ?? new Date().toISOString()
    }, goal?.id);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-ink-3 mb-1.5">Goal Name</label>
        <div className="relative">
          <Target className="absolute left-3 top-3.5 text-ink-2" size={18} />
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Europe Trip"
            className="w-full pl-10 h-12 bg-subtle border border-line rounded-lg focus:border-accent focus:ring-1 focus:ring-accent text-ink outline-none text-sm"
          />
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-ink-3">Icon</label>
        <div className="grid grid-cols-4 gap-2">
          {GOAL_ICON_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setIcon(option.id)}
              aria-label={`${option.label} goal icon`}
              aria-pressed={icon === option.id}
              className={`flex min-h-11 flex-col items-center justify-center gap-1 rounded-lg border text-xs font-medium transition ${icon === option.id ? 'border-line-strong bg-line text-ink' : 'border-line bg-subtle text-ink-3 hover:border-line-strong'}`}
            >
              <GoalIcon icon={option.id} size={15} /> {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-ink-3 mb-1.5">Target (¥)</label>
          <input
            type="number"
            min="1"
            step="1"
            required
            value={targetAmount}
            onChange={(e) => setTargetAmount(e.target.value)}
            placeholder="1000000"
            className="w-full h-12 px-3 bg-subtle border border-line rounded-lg focus:border-accent text-ink outline-none text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-3 mb-1.5">Saved (¥)</label>
          <input
            type="number"
            min="0"
            step="1"
            value={currentAmount}
            onChange={(e) => setCurrentAmount(e.target.value)}
            placeholder="0"
            className="w-full h-12 px-3 bg-subtle border border-line rounded-lg focus:border-accent text-ink outline-none text-sm"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-ink-3 mb-1.5">Monthly Save (¥)</label>
        <div className="relative">
           <TrendingUp className="absolute left-3 top-3.5 text-ink-2" size={18} />
           <input
            type="number"
            min="0"
            step="1"
            value={monthlyContribution}
            onChange={(e) => setMonthlyContribution(e.target.value)}
            placeholder="Projected"
            className="w-full pl-10 h-12 bg-subtle border border-line rounded-lg focus:border-accent text-ink outline-none text-sm"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-ink-3 mb-1.5">Deadline</label>
        <input
          type="date"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
          className="w-full h-12 px-3 bg-subtle border border-line rounded-lg focus:border-accent text-ink outline-none text-sm"
        />
      </div>

      {error && <p className="text-xs text-bad">{error}</p>}

      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onCancel} className="flex-1 h-12 bg-card hover:bg-subtle border border-line text-ink-2 font-medium text-xs rounded-lg transition-colors">Cancel</button>
        <button type="submit" className="flex-1 h-12 bg-ink hover:opacity-90 text-on-ink font-medium text-xs rounded-lg transition-colors">
          {goal ? 'Update' : 'Create'}
        </button>
      </div>
      {goal && onDelete && (
        <button type="button" onClick={onDelete} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg text-xs font-medium text-bad transition hover:bg-bad-soft hover:text-bad">
          <Trash2 size={14} /> Delete goal
        </button>
      )}
    </form>
  );
};
