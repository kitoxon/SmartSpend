import React, { useState } from 'react';
import { Goal } from '../types';
import { Target, TrendingUp, Crown } from 'lucide-react';

interface GoalFormProps {
  onSave: (goal: Omit<Goal, 'id'>, existingId?: string) => void;
  onCancel: () => void;
  goal?: Goal;
}

export const GoalForm: React.FC<GoalFormProps> = ({ onSave, onCancel, goal }) => {
  const [name, setName] = useState(goal?.name ?? '');
  const [targetAmount, setTargetAmount] = useState(goal ? goal.targetAmount.toString() : '');
  const [currentAmount, setCurrentAmount] = useState(goal ? goal.currentAmount.toString() : '');
  const [monthlyContribution, setMonthlyContribution] = useState(goal?.monthlyContribution?.toString() ?? '');
  const [deadline, setDeadline] = useState(goal?.deadline ? goal.deadline.split('T')[0] : '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !targetAmount) return;

    onSave({
      name,
      targetAmount: parseFloat(targetAmount),
      currentAmount: parseFloat(currentAmount) || 0,
      deadline,
      icon: goal?.icon ?? '🎯',
      monthlyContribution: parseFloat(monthlyContribution) || 0,
      startDate: goal?.startDate ?? new Date().toISOString()
    }, goal?.id);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Goal Name</label>
        <div className="relative">
          <Target className="absolute left-3 top-3.5 text-zinc-400" size={18} />
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Europe Trip"
            className="w-full pl-10 h-12 bg-zinc-800 border border-zinc-700 rounded-lg focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 text-zinc-200 outline-none text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Target (¥)</label>
          <input
            type="number"
            required
            value={targetAmount}
            onChange={(e) => setTargetAmount(e.target.value)}
            placeholder="1000000"
            className="w-full h-12 px-3 bg-zinc-800 border border-zinc-700 rounded-lg focus:border-zinc-500 text-zinc-200 outline-none text-sm"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Saved (¥)</label>
          <input
            type="number"
            value={currentAmount}
            onChange={(e) => setCurrentAmount(e.target.value)}
            placeholder="0"
            className="w-full h-12 px-3 bg-zinc-800 border border-zinc-700 rounded-lg focus:border-zinc-500 text-zinc-200 outline-none text-sm"
          />
        </div>
      </div>

      <div>
        <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Monthly Save (¥)</label>
        <div className="relative">
           <TrendingUp className="absolute left-3 top-3.5 text-zinc-400" size={18} />
           <input
            type="number"
            value={monthlyContribution}
            onChange={(e) => setMonthlyContribution(e.target.value)}
            placeholder="Projected"
            className="w-full pl-10 h-12 bg-zinc-800 border border-zinc-700 rounded-lg focus:border-zinc-500 text-zinc-200 outline-none text-sm"
          />
        </div>
      </div>

      <div>
        <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Deadline</label>
        <input
          type="date"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
          className="w-full h-12 px-3 bg-zinc-800 border border-zinc-700 rounded-lg focus:border-zinc-500 text-zinc-200 outline-none text-sm"
        />
      </div>

      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onCancel} className="flex-1 h-12 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-400 font-bold text-xs uppercase tracking-wide rounded-lg transition-colors">Cancel</button>
        <button type="submit" className="flex-1 h-12 bg-white hover:bg-zinc-200 text-zinc-950 font-bold text-xs uppercase tracking-wide rounded-lg shadow-lg transition-colors">
          {goal ? 'Update' : 'Create'}
        </button>
      </div>
    </form>
  );
};
