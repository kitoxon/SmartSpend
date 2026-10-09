import React from 'react';
import { ChevronRight } from 'lucide-react';
import { CyclePlan, cycleBreakdown } from '../utils/payCycle';
import { formatShortDate } from '../utils/jpCalendar';
import { formatYen } from '../utils/format';

interface CycleHistoryProps {
  plans: CyclePlan[]; // Newest first
  onOpenCycle: (key: string) => void;
}

// Fixed order and colors; what's left over is the unfilled track.
const PARTS = [
  { key: 'bills', label: 'Transfer bills', className: 'bg-series-1' },
  { key: 'cards', label: 'Cards', className: 'bg-series-2' },
  { key: 'cash', label: 'Cash', className: 'bg-series-3' },
  { key: 'savings', label: 'Savings', className: 'bg-series-4' },
] as const;

export const CycleHistory: React.FC<CycleHistoryProps> = ({ plans, onOpenCycle }) => {
  if (plans.length === 0) {
    return (
      <div className="card px-6 py-12 text-center">
        <p className="text-sm text-ink">No cycles yet</p>
        <p className="mt-1 text-[13px] text-ink-2">Each payday check-in adds a cycle here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 pb-28">
      <div className="space-y-1.5">
        <h2 className="text-base font-medium text-ink">Cycles</h2>
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-2">
          {PARTS.map((part) => <li key={part.key} className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${part.className}`} />{part.label}</li>)}
          <li className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full border border-line-strong bg-subtle" />Left</li>
        </ul>
      </div>

      <ul className="space-y-2">
        {plans.map((plan) => {
          const breakdown = cycleBreakdown(plan);
          const used = breakdown.bills + breakdown.cards + breakdown.cash + breakdown.savings;
          const isCurrent = plan.status === 'current';
          return (
            <li key={plan.cycle.key}>
              <button type="button" onClick={() => onOpenCycle(plan.cycle.key)} className="card w-full p-4 text-left transition hover:border-line-strong">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm text-ink">{formatShortDate(plan.cycle.start)} – {formatShortDate(plan.cycle.end)}{isCurrent && <span className="text-ink-3"> · now</span>}</span>
                  <span className="flex items-center gap-1 text-sm tabular-nums">
                    <span className={breakdown.left < 0 ? 'text-bad' : 'text-ink'}>
                      {breakdown.left < 0 ? `Over ${formatYen(breakdown.left)}` : `${isCurrent ? 'Left' : 'Left over'} ${formatYen(breakdown.left)}`}
                    </span>
                    <ChevronRight size={15} className="text-ink-3" />
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-ink-3">
                  {plan.salary > 0 ? `Salary ${formatYen(plan.salary)}` : `Started with ${formatYen(plan.carryover)}`}
                  {plan.salary > 0 && plan.carryover > 0 && ` + ${formatYen(plan.carryover)} carried over`}
                  {plan.otherIncome > 0 && ` + ${formatYen(plan.otherIncome)} other income`}
                </p>
                <div className="mt-3 flex h-3 gap-[2px] overflow-hidden rounded-[4px]" aria-hidden="true">
                  {PARTS.map((part) => breakdown[part.key] > 0 && (
                    <span key={part.key} className={part.className} style={{ flexGrow: breakdown[part.key], flexBasis: 0 }} />
                  ))}
                  {breakdown.left > 0 && <span className="bg-subtle" style={{ flexGrow: breakdown.left, flexBasis: 0 }} />}
                  {used === 0 && breakdown.left <= 0 && <span className="flex-1 bg-subtle" />}
                </div>
                <p className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-xs tabular-nums text-ink-2">
                  {PARTS.map((part) => <span key={part.key}>{part.label} {formatYen(breakdown[part.key])}</span>)}
                </p>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
