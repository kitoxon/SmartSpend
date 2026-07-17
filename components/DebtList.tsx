import React, { useMemo, useState } from 'react';
import { Debt } from '../types';
import {
  Banknote,
  Calendar,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  CreditCard,
  Landmark,
  Shield,
  User,
} from 'lucide-react';
import { simulateDebtPayoff } from '../utils/debtPayoff';

interface DebtListProps {
  debts: Debt[];
  onToggleStatus: (id: string) => void;
  onEdit?: (debt: Debt) => void;
}

const formatJPY = (amount: number) => `¥${amount.toLocaleString()}`;

export const DebtList: React.FC<DebtListProps> = ({ debts, onToggleStatus, onEdit }) => {
  const [showPaid, setShowPaid] = useState(false);
  const activeDebts = useMemo(
    () => debts
      .filter((debt) => debt.type === 'payable' && !debt.isPaid && debt.amount > 0)
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()),
    [debts],
  );
  const paidDebts = useMemo(
    () => debts
      .filter((debt) => debt.isPaid || debt.amount <= 0)
      .sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime()),
    [debts],
  );
  const totalDebt = activeDebts.reduce((sum, debt) => sum + debt.amount, 0);

  const projectionStartDate = useMemo(() => {
    const now = new Date();
    const validDueDates = activeDebts
      .map((debt) => new Date(debt.dueDate))
      .filter((date) => !Number.isNaN(date.getTime()))
      .sort((a, b) => a.getTime() - b.getTime());
    const earliest = validDueDates[0];
    return earliest && earliest.getTime() > now.getTime() ? earliest : now;
  }, [activeDebts]);

  const payoffPlan = useMemo(() => simulateDebtPayoff(activeDebts, {
    strategy: 'dueDate',
    startDate: projectionStartDate,
  }), [activeDebts, projectionStartDate]);

  const dueThisMonth = useMemo(() => {
    const now = new Date();
    return activeDebts.reduce((sum, debt) => {
      const due = new Date(debt.dueDate);
      if (Number.isNaN(due.getTime())) return sum;
      const isDue = due <= now || (due.getFullYear() === now.getFullYear() && due.getMonth() === now.getMonth());
      return isDue ? sum + Math.min(debt.amount, debt.minimumPayment ?? debt.amount) : sum;
    }, 0);
  }, [activeDebts]);

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'Credit Card': return <CreditCard size={10} />;
      case 'Loan':
      case 'Bank': return <Landmark size={10} />;
      case 'Personal': return <User size={10} />;
      default: return <Banknote size={10} />;
    }
  };

  const getDueState = (dueDate: string) => {
    const due = new Date(dueDate);
    if (Number.isNaN(due.getTime())) return null;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
    const days = Math.round((dueDay.getTime() - today.getTime()) / 86_400_000);
    if (days < 0) return { label: `Overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'}`, tone: 'overdue' as const };
    if (days === 0) return { label: 'Due today', tone: 'soon' as const };
    if (days <= 10) return { label: `Due in ${days} days`, tone: 'soon' as const };
    return null;
  };

  return (
    <div className="space-y-4 pb-24">
      <section className="relative overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/70 p-4 text-zinc-100">
        <h3 className="mb-1 text-[10px] font-bold uppercase tracking-widest text-zinc-500">Total liability</h3>
        <div className="text-2xl font-bold tracking-tight text-white tabular-nums">{formatJPY(totalDebt)}</div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-zinc-400">
          {activeDebts.length > 0 && !payoffPlan.warning && payoffPlan.payoffDateLabel && (
            <span className="flex items-center gap-1.5"><Calendar size={12} /> Debt-free by {payoffPlan.payoffDateLabel}</span>
          )}
          {dueThisMonth > 0 && <span>Due this month <strong className="text-zinc-200 tabular-nums">{formatJPY(dueThisMonth)}</strong></span>}
        </div>
      </section>

      {activeDebts.length === 0 ? (
        <div className="py-20 text-center text-zinc-600">
          <Shield size={32} className="mx-auto mb-3 opacity-20" />
          <p className="text-sm">No active debts recorded.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {activeDebts.map((debt) => {
            const dueState = getDueState(debt.dueDate);
            const urgencyClass = dueState?.tone === 'overdue'
              ? 'border-rose-500/40 bg-rose-500/[0.06]'
              : dueState?.tone === 'soon'
                ? 'border-zinc-700 bg-zinc-900/70'
                : 'border-zinc-800 bg-zinc-900/60';
            return (
              <article key={debt.id} className={`rounded-xl border p-3 transition ${urgencyClass}`}>
                <button type="button" onClick={() => onEdit?.(debt)} className="w-full text-left">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="truncate text-sm font-bold text-white">{debt.person}</h4>
                        <span className="inline-flex items-center gap-1 rounded border border-zinc-700/60 bg-zinc-800 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-zinc-400">
                          {getCategoryIcon(debt.debtCategory)} {debt.debtCategory}
                          {(debt.interestRate ?? 0) > 0 && <> · {debt.interestRate}%</>}
                        </span>
                        {dueState && <span className={`inline-flex rounded-full px-2 py-0.5 text-[9px] font-bold ${dueState.tone === 'overdue' ? 'bg-rose-500/15 text-rose-300' : 'bg-zinc-800 text-zinc-300'}`}>
                          {dueState.label}
                        </span>}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-lg font-bold text-white tabular-nums">{formatJPY(debt.amount)}</span>
                      <ChevronRight size={16} className="text-zinc-600" aria-hidden="true" />
                    </div>
                  </div>
                </button>

                <div className="mt-2 flex items-center justify-between gap-3 border-t border-white/5 pt-2">
                  <p className="min-w-0 truncate text-[10px] text-zinc-500">
                    {debt.minimumPayment && <span>Min {formatJPY(debt.minimumPayment)}</span>}
                    {debt.minimumPayment && <span> · </span>}
                    <span>Due {new Date(debt.dueDate).toLocaleDateString()}</span>
                  </p>
                  <button
                    type="button"
                    onClick={() => onToggleStatus(debt.id)}
                    className="min-h-9 shrink-0 rounded-lg bg-white px-4 text-[10px] font-bold uppercase tracking-wide text-black transition hover:bg-zinc-200 active:scale-[0.98]"
                  >
                    Pay
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {paidDebts.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/40">
          <button type="button" onClick={() => setShowPaid((value) => !value)} className="flex min-h-12 w-full items-center justify-between px-4 text-left text-xs font-semibold text-zinc-500 transition hover:text-zinc-300">
            <span className="flex items-center gap-2"><CheckCircle size={14} /> {paidDebts.length} paid off</span>
            <ChevronDown size={15} className={`transition-transform ${showPaid ? 'rotate-180' : ''}`} />
          </button>
          {showPaid && (
            <div className="border-t border-zinc-800">
              {paidDebts.map((debt) => (
                <button key={debt.id} type="button" onClick={() => onEdit?.(debt)} className="flex min-h-12 w-full items-center justify-between border-b border-zinc-800 px-4 text-left last:border-0 hover:bg-zinc-900">
                  <span className="text-xs text-zinc-500 line-through">{debt.person}</span>
                  <span className="flex items-center gap-2 text-xs font-semibold text-zinc-600">Paid <ChevronRight size={14} /></span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
};
