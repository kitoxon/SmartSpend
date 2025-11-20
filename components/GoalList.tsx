import React from 'react';
import { Goal } from '../types';
import { Target, Trophy, Plus, Trash2, AlertCircle, CalendarClock, CheckCircle2, Crown, Flag } from 'lucide-react';

interface GoalListProps {
  goals: Goal[];
  onDelete: (id: string) => void;
  onAddFundsClick: (id: string) => void;
}

export const GoalList: React.FC<GoalListProps> = ({ goals, onDelete, onAddFundsClick }) => {
  const formatJPY = (val: number) => `¥${val.toLocaleString()}`;

  if (goals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-zinc-600">
        <Target size={32} className="mb-2 opacity-20" />
        <p className="text-sm">No goals set.</p>
      </div>
    );
  }

  const getProjection = (goal: Goal) => {
    if (!goal.monthlyContribution || goal.monthlyContribution <= 0) return null;
    const remaining = Math.max(0, goal.targetAmount - goal.currentAmount);
    if (remaining === 0) return { date: new Date(), isOnTrack: true };

    const monthsNeeded = Math.ceil(remaining / goal.monthlyContribution);
    const today = new Date();
    const projectedDate = new Date(today.setMonth(today.getMonth() + monthsNeeded));
    
    let isOnTrack = true;
    if (goal.deadline) {
      isOnTrack = projectedDate <= new Date(goal.deadline);
    }
    return { date: projectedDate, isOnTrack };
  };

  return (
    <div className="space-y-4 pb-24">
      {goals.map((goal) => {
        const percentage = Math.min(100, Math.round((goal.currentAmount / goal.targetAmount) * 100));
        const projection = getProjection(goal);
        
        return (
          <div key={goal.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 shadow-sm relative overflow-hidden group">
            <div className="flex justify-between items-start mb-4 relative z-10">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-md border ${percentage >= 100 ? 'bg-zinc-100 border-zinc-200 text-zinc-900' : 'bg-zinc-800 border-zinc-700 text-zinc-400'}`}>
                  {percentage >= 100 ? <Trophy size={18} /> : <Flag size={18} />}
                </div>
                <div>
                  <h3 className="font-bold text-base text-zinc-100 tracking-tight">{goal.name}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    {goal.deadline && (
                      <span className="text-[10px] uppercase tracking-wide text-zinc-500 bg-zinc-800/50 px-1.5 py-0.5 rounded flex items-center gap-1 border border-zinc-700/50">
                         <CalendarClock size={10} /> {new Date(goal.deadline).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button onClick={() => onDelete(goal.id)} className="text-zinc-600 hover:text-zinc-400 p-1 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={14} /></button>
            </div>

            <div className="mb-2 relative z-10">
              <div className="flex justify-between text-sm mb-2 font-medium">
                <span className="text-white font-bold tabular-nums">{formatJPY(goal.currentAmount)}</span>
                <span className="text-zinc-500 tabular-nums">{formatJPY(goal.targetAmount)}</span>
              </div>
              <div className="h-2 w-full bg-zinc-800 rounded-full overflow-hidden">
                <div className={`h-full transition-all duration-500 ${percentage >= 100 ? 'bg-white' : 'bg-zinc-500'}`} style={{ width: `${percentage}%` }} />
              </div>
            </div>

            {/* Projection Status */}
            {projection && percentage < 100 && (
              <div className={`mt-3 p-2 rounded border text-[10px] flex items-center gap-2 ${
                projection.isOnTrack ? 'bg-zinc-800/30 border-zinc-800 text-zinc-400' : 'bg-zinc-800/30 border-zinc-800 text-zinc-500'
              }`}>
                {projection.isOnTrack ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
                <p>{projection.isOnTrack ? "On Track" : "At Risk"} • Finish by <span className="font-bold text-zinc-300">{projection.date.toLocaleString('default', { month: 'short', year: 'numeric' })}</span></p>
              </div>
            )}

            <div className="flex justify-between items-center mt-4 pt-3 border-t border-zinc-800 relative z-10">
              <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider">{percentage}% COMPLETE</span>
              <button onClick={() => onAddFundsClick(goal.id)} className="flex items-center gap-1 px-3 py-1.5 bg-zinc-100 hover:bg-white rounded text-[10px] font-bold text-zinc-950 border border-zinc-200 uppercase tracking-wide">
                <Plus size={10} /> Add Funds
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};