import React, { useMemo, useState } from 'react';
import { Debt } from '../types';
import {
  Banknote,
  Calendar,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Landmark,
  Shield,
  User,
} from 'lucide-react';
import { simulateDebtPayoff } from '../utils/debtPayoff';
import { CreditCardIcon } from './ui/CreditCardIcon';

interface DebtListProps {
  debts: Debt[];
  cardNames: Record<string, string>;
  onToggleStatus: (id: string) => void;
  onEdit?: (debt: Debt) => void;
}

const formatJPY = (amount: number) => `¥${amount.toLocaleString('ja-JP')}`;

export const DebtList: React.FC<DebtListProps> = ({ debts, cardNames, onToggleStatus, onEdit }) => {
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
      case 'Credit Card': return <CreditCardIcon size={10} />;
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
      <section className="relative overflow-hidden rounded-xl border border-line bg-card p-4 text-ink">
        <h3 className="mb-1 text-[13px] text-ink-2">Total owed</h3>
        <div className="text-2xl font-medium text-ink tabular-nums">{formatJPY(totalDebt)}</div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
          {activeDebts.length > 0 && !payoffPlan.warning && payoffPlan.payoffDateLabel && (
            <span className="flex items-center gap-1.5"><Calendar size={12} /> Debt-free by {payoffPlan.payoffDateLabel}</span>
          )}
          {dueThisMonth > 0 && <span>Due this month <strong className="text-ink tabular-nums">{formatJPY(dueThisMonth)}</strong></span>}
        </div>
      </section>

      {activeDebts.length === 0 ? (
        <div className="card px-6 py-12 text-center">
          <Shield size={28} className="mx-auto mb-3 text-ink-3" />
          <p className="text-sm text-ink">No debts</p>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-2">If you split a card bill at check-in, the installments show up here.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {activeDebts.map((debt) => {
            const dueState = getDueState(debt.dueDate);
            const linkedCard = debt.cardId ? cardNames[debt.cardId] ?? 'card' : null;
            const urgencyClass = dueState?.tone === 'overdue' && !linkedCard ? 'border-bad/40 bg-bad-soft' : 'border-line bg-card';
            return (
              <article key={debt.id} className={`rounded-xl border p-3 transition ${urgencyClass}`}>
                <button type="button" onClick={() => onEdit?.(debt)} className="w-full text-left">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="truncate text-sm font-medium text-ink">{debt.person}</h4>
                        <span className="inline-flex items-center gap-1 rounded border border-line bg-subtle px-1.5 py-0.5 text-xs font-medium text-ink-2">
                          {getCategoryIcon(debt.debtCategory)} {debt.debtCategory}
                          {(debt.interestRate ?? 0) > 0 && <> · {debt.interestRate}%</>}
                        </span>
                        {dueState && !linkedCard && <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${dueState.tone === 'overdue' ? 'bg-bad-soft text-bad' : 'bg-subtle text-ink-2'}`}>
                          {dueState.label}
                        </span>}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-lg font-medium text-ink tabular-nums">{formatJPY(debt.amount)}</span>
                      <ChevronRight size={16} className="text-ink-3" aria-hidden="true" />
                    </div>
                  </div>
                </button>

                <div className="mt-2 flex items-center justify-between gap-3 border-t border-line pt-2">
                  <p className="min-w-0 truncate text-xs text-ink-3">
                    {debt.minimumPayment && <span>{formatJPY(debt.minimumPayment)} a month · </span>}
                    <span>{linkedCard ? 'Next' : 'Due'} {new Date(debt.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                  </p>
                  {linkedCard ? (
                    <span className="shrink-0 text-xs text-ink-3">Paid with the {linkedCard} bill</span>
                  ) : (
                    <button type="button" onClick={() => onToggleStatus(debt.id)} className="btn-primary min-h-9 shrink-0 px-4 text-[13px]">Pay</button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {paidDebts.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-line bg-card">
          <button type="button" onClick={() => setShowPaid((value) => !value)} className="flex min-h-12 w-full items-center justify-between px-4 text-left text-xs font-medium text-ink-3 transition hover:text-ink">
            <span className="flex items-center gap-2"><CheckCircle size={14} /> {paidDebts.length} paid off</span>
            <ChevronDown size={15} className={`transition-transform ${showPaid ? 'rotate-180' : ''}`} />
          </button>
          {showPaid && (
            <div className="border-t border-line">
              {paidDebts.map((debt) => (
                <button key={debt.id} type="button" onClick={() => onEdit?.(debt)} className="flex min-h-12 w-full items-center justify-between border-b border-line px-4 text-left last:border-0 hover:bg-subtle">
                  <span className="text-xs text-ink-3 line-through">{debt.person}</span>
                  <span className="flex items-center gap-2 text-xs font-medium text-ink-3">Paid <ChevronRight size={14} /></span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
};
