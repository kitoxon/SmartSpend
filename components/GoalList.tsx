import React from 'react';
import { Goal } from '../types';
import { CalendarClock, ChevronRight, Plus, Target, Trophy } from 'lucide-react';
import { GoalIcon } from './ui/GoalIcon';

interface GoalListProps {
  goals: Goal[];
  onAddFundsClick: (id: string) => void;
  onEdit: (goal: Goal) => void;
}

const formatJPY = (value: number) => `¥${value.toLocaleString()}`;

export const GoalList: React.FC<GoalListProps> = ({ goals, onAddFundsClick, onEdit }) => {
  if (goals.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center text-zinc-600">
        <Target size={32} className="mb-2 opacity-20" />
        <p className="text-sm">No goals set.</p>
      </div>
    );
  }

  const projectionFor = (goal: Goal) => {
    if (!goal.monthlyContribution || goal.monthlyContribution <= 0) return null;
    const remaining = Math.max(0, goal.targetAmount - goal.currentAmount);
    const monthsNeeded = Math.ceil(remaining / goal.monthlyContribution);
    const date = new Date();
    date.setMonth(date.getMonth() + monthsNeeded);
    const isOnTrack = !goal.deadline || date <= new Date(goal.deadline);
    return { date, isOnTrack };
  };

  return (
    <div className="space-y-3 pb-24">
      {goals.map((goal) => {
        const percentage = Math.min(100, Math.round((goal.currentAmount / goal.targetAmount) * 100));
        const projection = projectionFor(goal);
        const planText = percentage >= 100
          ? 'Goal reached'
          : goal.monthlyContribution && goal.monthlyContribution > 0
            ? `${formatJPY(goal.monthlyContribution)}/month${projection ? ` · ${projection.isOnTrack ? 'Finish' : 'Behind plan'} ${projection.date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}` : ''}`
            : percentage === 0
              ? 'Not started · add a monthly plan'
              : `${percentage}% complete`;

        return (
          <article key={goal.id} className="rounded-xl border border-zinc-800 bg-zinc-900/65 p-3.5">
            <button type="button" onClick={() => onEdit(goal)} className="flex w-full items-center gap-3 text-left">
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${percentage >= 100 ? 'border-zinc-200 bg-white text-black' : 'border-zinc-700 bg-zinc-800 text-zinc-400'}`}>
                {percentage >= 100 ? <Trophy size={16} /> : <GoalIcon icon={goal.icon} size={16} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-zinc-100">{goal.name}</span>
                {goal.deadline && <span className="mt-0.5 flex items-center gap-1 text-[10px] text-zinc-500"><CalendarClock size={10} /> {new Date(goal.deadline).toLocaleDateString()}</span>}
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-sm font-bold text-white tabular-nums">{formatJPY(goal.currentAmount)}</span>
                <span className="block text-[10px] text-zinc-600">of {formatJPY(goal.targetAmount)}</span>
              </span>
              <ChevronRight size={15} className="shrink-0 text-zinc-700" />
            </button>

            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-zinc-800"><div className={`h-full rounded-full ${percentage >= 100 ? 'bg-white' : 'bg-emerald-400'}`} style={{ width: `${percentage}%` }} /></div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <p className={`min-w-0 truncate text-[10px] ${projection && !projection.isOnTrack ? 'text-rose-300' : 'text-zinc-500'}`}>{planText}</p>
              {percentage < 100 && (
                <button type="button" onClick={() => onAddFundsClick(goal.id)} className="flex min-h-9 shrink-0 items-center gap-1 rounded-lg bg-white px-3 text-[10px] font-bold uppercase tracking-wide text-black hover:bg-zinc-200">
                  <Plus size={11} /> Add funds
                </button>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
};
