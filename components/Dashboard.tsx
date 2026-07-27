import React, { Suspense, useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Lightbulb,
  ReceiptText,
  Sparkles,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { Category, Debt, Goal, RecurringTransaction, Transaction } from '../types';
import { getNextRecurringDate } from '../utils/date';
import { spendingAmountFor } from '../utils/transactions';
import { GoalIcon } from './ui/GoalIcon';

const CashFlowChart = React.lazy(() => import('./charts/CashFlowChart'));

type TransactionPrefill = Partial<Pick<Transaction, 'type' | 'amount' | 'description' | 'category' | 'date'>>;

interface DashboardProps {
  transactions: Transaction[];
  debts?: Debt[];
  goals?: Goal[];
  recurringRules?: RecurringTransaction[];
  onQuickAdd: (prefill: TransactionPrefill) => void;
  onOpenTransactions: () => void;
  onOpenDebts: () => void;
  onPayDebt: (id: string) => void;
  onOpenGoals: () => void;
  onAddGoalFunds: (id: string) => void;
  onConfirmExpectedBill: (id: string) => void;
  onPostponeExpectedBill: (id: string) => void;
}

const formatJPY = (amount: number) => `¥${Math.round(Math.abs(amount)).toLocaleString()}`;
const monthStart = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);
const monthEnd = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
const monthKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}`;
const shiftMonth = (date: Date, delta: number) => new Date(date.getFullYear(), date.getMonth() + delta, 1);
const isSameMonth = (date: Date, month: Date) =>
  date.getFullYear() === month.getFullYear() && date.getMonth() === month.getMonth();

const median = (values: number[]) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

const totalsFor = (transactions: Transaction[]) => transactions.reduce(
  (totals, transaction) => {
    if (transaction.type === 'income') totals.income += transaction.amount;
    if (transaction.type === 'expense') totals.expenses += spendingAmountFor(transaction);
    return totals;
  },
  { income: 0, expenses: 0 },
);

const signedJPY = (amount: number) => amount < 0 ? `−${formatJPY(amount)}` : formatJPY(amount);
const normalizedDescription = (description: string) => description
  .replace(/^\(Recurring\)\s*/i, '')
  .trim()
  .toLocaleLowerCase();

export const Dashboard: React.FC<DashboardProps> = ({
  transactions,
  debts = [],
  goals = [],
  recurringRules = [],
  onQuickAdd,
  onOpenTransactions,
  onOpenDebts,
  onPayDebt,
  onOpenGoals,
  onAddGoalFunds,
  onConfirmExpectedBill,
  onPostponeExpectedBill,
}) => {
  const currentMonth = monthStart(new Date());
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [showForecastDetails, setShowForecastDetails] = useState(false);
  const [showAllExpectedBills, setShowAllExpectedBills] = useState(false);
  const isCurrentMonth = monthKey(selectedMonth) === monthKey(currentMonth);
  const selectedEnd = monthEnd(selectedMonth);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const selectedTransactions = useMemo(
    () => transactions.filter((transaction) => {
      const date = new Date(transaction.date);
      return !Number.isNaN(date.getTime()) && isSameMonth(date, selectedMonth);
    }),
    [selectedMonth, transactions],
  );
  const previousMonth = shiftMonth(selectedMonth, -1);
  const previousTransactions = useMemo(
    () => transactions.filter((transaction) => {
      const date = new Date(transaction.date);
      return !Number.isNaN(date.getTime()) && isSameMonth(date, previousMonth);
    }),
    [previousMonth, transactions],
  );

  const { income, expenses } = totalsFor(selectedTransactions);
  const previousTotals = totalsFor(previousTransactions);
  const balance = income - expenses;
  const statusTone = balance < 0 ? 'negative' : balance === 0 ? 'neutral' : 'positive';

  const scheduled = useMemo(() => {
    const totals = { income: 0, expenses: 0, count: 0 };
    for (const rule of recurringRules) {
      let due = new Date(rule.nextDue);
      if (Number.isNaN(due.getTime())) continue;
      let safety = 0;
      while (due <= selectedEnd && safety < 8) {
        if (due >= selectedMonth) {
          if (rule.transactionTemplate.type === 'income') totals.income += rule.transactionTemplate.amount;
          else totals.expenses += spendingAmountFor(rule.transactionTemplate);
          totals.count++;
        }
        due = getNextRecurringDate(due, rule.frequency, rule.anchorDay ?? due.getDate());
        safety++;
      }
    }
    return totals;
  }, [recurringRules, selectedEnd, selectedMonth]);

  const historicalExpenseMedian = useMemo(() => {
    const monthlyTotals = [1, 2, 3]
      .map((offset) => {
        const month = shiftMonth(selectedMonth, -offset);
        return totalsFor(transactions.filter((transaction) => {
          const date = new Date(transaction.date);
          return !Number.isNaN(date.getTime()) && isSameMonth(date, month);
        })).expenses;
      })
      .filter((total) => total > 0);
    return Math.round(median(monthlyTotals));
  }, [selectedMonth, transactions]);

  const activeDebts = useMemo(() => debts
    .filter((debt) => !debt.isPaid && debt.amount > 0)
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()), [debts]);
  const nextDebt = activeDebts[0] ?? null;
  const debtDueThisMonth = activeDebts.reduce((sum, debt) => {
    const due = new Date(debt.dueDate);
    if (Number.isNaN(due.getTime())) return sum;
    const belongsToSelectedMonth = isSameMonth(due, selectedMonth);
    const isOverdueInCurrentMonth = isCurrentMonth && due < selectedMonth;
    if (!belongsToSelectedMonth && !isOverdueInCurrentMonth) return sum;
    return sum + Math.min(debt.amount, debt.minimumPayment ?? debt.amount);
  }, 0);

  // Do not multiply an early one-off purchase across every remaining day.
  // Use recent normal spending as a floor, then add only known future entries.
  const expectedExpenses = isCurrentMonth
    ? Math.max(expenses + scheduled.expenses, historicalExpenseMedian)
    : expenses;
  const expectedIncome = isCurrentMonth ? income + scheduled.income : income;
  const expectedMonthEnd = expectedIncome - expectedExpenses - debtDueThisMonth;
  const safeToSpend = isCurrentMonth
    ? income - expenses - scheduled.expenses - debtDueThisMonth
    : balance;
  const reserved = isCurrentMonth ? scheduled.expenses + debtDueThisMonth : 0;
  const spentShare = income > 0 ? Math.min(100, (expenses / income) * 100) : expenses > 0 ? 100 : 0;
  const reservedShare = income > 0 ? Math.min(100 - spentShare, (reserved / income) * 100) : 0;

  const expectedBills = useMemo(() => recurringRules
    .filter((rule) => {
      if (!rule.transactionTemplate.requiresConfirmation || rule.transactionTemplate.type !== 'expense') return false;
      const due = new Date(rule.nextDue);
      return !Number.isNaN(due.getTime()) && due <= todayEnd;
    })
    .sort((a, b) => new Date(a.nextDue).getTime() - new Date(b.nextDue).getTime()), [recurringRules, todayEnd]);
  const visibleExpectedBills = showAllExpectedBills ? expectedBills : expectedBills.slice(0, 3);

  const expenseChange = previousTotals.expenses > 0
    ? Math.round(((expenses - previousTotals.expenses) / previousTotals.expenses) * 100)
    : null;
  const comparisonText = expenseChange === null
    ? previousTotals.expenses === 0 && expenses > 0
      ? 'No spending recorded in the previous month'
      : 'No previous-month comparison yet'
    : expenseChange === 0
      ? 'Spending is the same as last month'
      : `${Math.abs(expenseChange)}% ${expenseChange > 0 ? 'more' : 'less'} spending than last month`;

  const trendChartData = useMemo(() => {
    const months = Array.from({ length: 6 }, (_, index) => shiftMonth(selectedMonth, index - 5));
    return months.map((month) => {
      const totals = totalsFor(transactions.filter((transaction) => {
        const date = new Date(transaction.date);
        return !Number.isNaN(date.getTime()) && isSameMonth(date, month);
      }));
      return {
        name: `${month.toLocaleDateString(undefined, { month: 'short' })}${isSameMonth(month, selectedMonth) ? ' •' : ''}`,
        income: totals.income,
        expense: totals.expenses,
      };
    });
  }, [selectedMonth, transactions]);

  const quickEntries = useMemo(() => {
    const cutoff = Date.now() - 180 * 24 * 60 * 60 * 1000;
    const groups = new Map<string, { description: string; category: Category; amounts: number[]; count: number; latest: number }>();
    for (const transaction of transactions) {
      const timestamp = new Date(transaction.date).getTime();
      if (transaction.type !== 'expense' || timestamp < cutoff) continue;
      if (transaction.category === Category.Debt || transaction.category === Category.Savings) continue;
      const normalized = normalizedDescription(transaction.description);
      if (!normalized) continue;
      const key = `${transaction.category}|${normalized}`;
      const current = groups.get(key) ?? {
        description: transaction.description.replace(/^\(Recurring\)\s*/i, '').trim(),
        category: transaction.category,
        amounts: [],
        count: 0,
        latest: 0,
      };
      current.amounts.push(transaction.amount);
      current.count++;
      current.latest = Math.max(current.latest, timestamp);
      groups.set(key, current);
    }
    return [...groups.values()]
      .filter((entry) => entry.count >= 2)
      .sort((a, b) => (b.count * 10 + b.latest / 1e13) - (a.count * 10 + a.latest / 1e13))
      .slice(0, 3)
      .map((entry) => ({ ...entry, amount: Math.round(median(entry.amounts)) }));
  }, [transactions]);
  const homeGoals = useMemo(() => goals
    .filter((goal) => goal.currentAmount < goal.targetAmount)
    .sort((a, b) => {
      const aDeadline = a.deadline ? new Date(a.deadline).getTime() : Number.POSITIVE_INFINITY;
      const bDeadline = b.deadline ? new Date(b.deadline).getTime() : Number.POSITIVE_INFINITY;
      return aDeadline - bDeadline;
    })
    .slice(0, 2), [goals]);

  const monthlyInsights = useMemo(() => {
    const insights: string[] = [];
    if (balance < 0) insights.push(`Spending is ${formatJPY(balance)} above recorded income.`);

    const categoryTotals = new Map<Category, number>();
    const previousCategoryTotals = new Map<Category, number>();
    for (const transaction of selectedTransactions) {
      if (transaction.type === 'expense') categoryTotals.set(transaction.category, (categoryTotals.get(transaction.category) ?? 0) + spendingAmountFor(transaction));
    }
    for (const transaction of previousTransactions) {
      if (transaction.type === 'expense') previousCategoryTotals.set(transaction.category, (previousCategoryTotals.get(transaction.category) ?? 0) + spendingAmountFor(transaction));
    }
    const increases = [...categoryTotals.entries()]
      .map(([category, amount]) => ({ category, increase: amount - (previousCategoryTotals.get(category) ?? 0) }))
      .filter((item) => item.increase > 0)
      .sort((a, b) => b.increase - a.increase);
    if (increases[0]) insights.push(`${increases[0].category} increased most: +${formatJPY(increases[0].increase)} versus last month.`);

    const largestExpense = selectedTransactions
      .filter((transaction) => spendingAmountFor(transaction) > 0)
      .sort((a, b) => spendingAmountFor(b) - spendingAmountFor(a))[0];
    const largestExpenseAmount = largestExpense ? spendingAmountFor(largestExpense) : 0;
    if (largestExpense && expenses > 0 && largestExpenseAmount / expenses >= 0.25) {
      insights.push(`${largestExpense.description} is ${Math.round((largestExpenseAmount / expenses) * 100)}% of this month’s spending.`);
    }
    if (scheduled.expenses + debtDueThisMonth > 0) {
      insights.push(`${formatJPY(scheduled.expenses + debtDueThisMonth)} is reserved for scheduled expenses and debt payments.`);
    }
    return insights.slice(0, 3);
  }, [balance, debtDueThisMonth, expenses, previousTransactions, scheduled.expenses, selectedTransactions]);

  const monthLabel = selectedMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const statusLabel = balance < 0 ? 'Over by' : balance > 0 ? 'Remaining' : 'Balanced';
  const statusAmount = balance === 0 ? '¥0' : formatJPY(balance);

  return (
    <div className="space-y-5 pb-32">
      <section className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/70 p-2">
        <button type="button" onClick={() => setSelectedMonth((month) => shiftMonth(month, -1))} className="flex h-11 w-11 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-zinc-800 hover:text-white" aria-label="Previous month">
          <ChevronLeft size={20} />
        </button>
        <div className="flex min-w-0 items-center gap-2 px-2 text-center">
          <div className="min-w-0"><span className="block truncate text-base font-bold text-white">{monthLabel}</span><span className="block text-[11px] font-medium text-zinc-500">{isCurrentMonth ? 'Current month' : 'Past month'}</span></div>
          {!isCurrentMonth && <button type="button" onClick={() => setSelectedMonth(currentMonth)} className="min-h-9 rounded-full border border-zinc-700 bg-zinc-800 px-3 text-[10px] font-bold text-zinc-300 hover:text-white">Today</button>}
        </div>
        <button type="button" onClick={() => setSelectedMonth((month) => shiftMonth(month, 1))} disabled={isCurrentMonth} className="flex h-11 w-11 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-zinc-800 hover:text-white disabled:cursor-not-allowed disabled:text-zinc-800" aria-label="Next month">
          <ChevronRight size={20} />
        </button>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(300px,0.75fr)] lg:items-start">
        <div className="contents lg:block lg:space-y-5">
          <section className={`order-1 relative overflow-hidden rounded-2xl border p-6 sm:p-7 ${
            statusTone === 'negative'
              ? 'border-rose-500/30 bg-gradient-to-br from-rose-500/15 via-zinc-900/90 to-zinc-950'
              : statusTone === 'positive'
                ? 'border-emerald-500/25 bg-gradient-to-br from-emerald-500/10 via-zinc-900/90 to-zinc-950'
                : 'border-zinc-800 bg-zinc-900/80'
          }`}>
            <p className="mb-2 text-xs font-semibold text-zinc-400">{statusLabel}</p>
            <div className={`text-4xl font-extrabold tracking-tight tabular-nums sm:text-5xl ${statusTone === 'negative' ? 'text-rose-300' : statusTone === 'positive' ? 'text-emerald-300' : 'text-white'}`}>{statusAmount}</div>
            <p className="mt-2 text-sm text-zinc-400">
              {balance < 0 ? 'Expenses are higher than recorded income this month.' : balance > 0 ? 'Available from this month’s recorded income.' : selectedTransactions.length ? 'Income and expenses are currently even.' : 'Add income or an expense to start this month.'}
            </p>
            <div className="mt-6 grid grid-cols-3 gap-3 border-t border-white/10 pt-5">
              <div><div className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-zinc-500"><ArrowUpRight size={13} /> Income</div><p className="text-base font-bold text-white tabular-nums sm:text-lg">{formatJPY(income)}</p></div>
              <div><div className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-zinc-500"><ArrowDownRight size={13} /> Spent</div><p className="text-base font-bold text-zinc-200 tabular-nums sm:text-lg">{formatJPY(expenses)}</p></div>
              <div><div className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-zinc-500"><Wallet size={13} /> Reserved</div><p className="text-base font-bold text-zinc-200 tabular-nums sm:text-lg">{formatJPY(reserved)}</p></div>
            </div>
            <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-zinc-800"><div className={`h-full transition-all duration-500 ${expenses > income && income > 0 ? 'bg-rose-400' : 'bg-emerald-400'}`} style={{ width: `${spentShare}%` }} /><div className="h-full bg-zinc-500 transition-all duration-500" style={{ width: `${reservedShare}%` }} /></div>
            {isCurrentMonth && (
              <div className="mt-4 flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                <div><p className="text-[11px] font-semibold text-zinc-500">Safe after upcoming bills</p><p className="mt-0.5 text-[10px] text-zinc-600">Remaining minus {formatJPY(reserved)} reserved</p></div>
                <strong className={`shrink-0 text-lg tabular-nums ${safeToSpend < 0 ? 'text-rose-300' : 'text-emerald-300'}`}>{signedJPY(safeToSpend)}</strong>
              </div>
            )}
          </section>

          {isCurrentMonth && (
            <section className="order-2 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
              <div className="flex items-start gap-3">
                <CircleAlert size={17} className={`mt-0.5 shrink-0 ${expectedMonthEnd < 0 ? 'text-rose-300' : 'text-zinc-500'}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-relaxed text-zinc-300">Forecast: <strong className={`tabular-nums ${expectedMonthEnd < 0 ? 'text-rose-300' : 'text-zinc-100'}`}>{expectedMonthEnd < 0 ? `${formatJPY(expectedMonthEnd)} short` : `${formatJPY(expectedMonthEnd)} left`}</strong> at the end of {monthLabel}.</p>
                  {showForecastDetails && <p className="mt-2 text-[10px] leading-relaxed text-zinc-500">Uses the median of up to three previous months, recorded income, and known recurring expenses and debt payments. It does not multiply one unusual day across the month.</p>}
                </div>
                <button type="button" onClick={() => setShowForecastDetails((value) => !value)} className="min-h-9 shrink-0 rounded-lg px-2 text-[10px] font-bold text-zinc-400 hover:bg-white/5 hover:text-white">{showForecastDetails ? 'Hide' : 'Why?'}</button>
              </div>
            </section>
          )}

          {isCurrentMonth && expectedBills.length > 0 && (
            <section className="order-3 rounded-xl border border-zinc-700 bg-zinc-900/80 p-4">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <h2 className="flex items-center gap-2 text-xs font-bold text-zinc-200"><ReceiptText size={14} /> Bills to confirm <span className="rounded-full bg-zinc-800 px-1.5 py-0.5 text-[9px] text-zinc-400">{expectedBills.length}</span></h2>
                  <p className="mt-1 text-[10px] text-zinc-600">Estimates are reserved, but are not expenses yet.</p>
                </div>
              </div>
              <div className="space-y-2">
                {visibleExpectedBills.map((rule) => {
                  const due = new Date(rule.nextDue);
                  const dueStart = new Date(due.getFullYear(), due.getMonth(), due.getDate());
                  const todayStart = new Date();
                  todayStart.setHours(0, 0, 0, 0);
                  const overdueDays = Math.max(0, Math.floor((todayStart.getTime() - dueStart.getTime()) / 86_400_000));
                  const description = rule.transactionTemplate.description.replace(/^\(Recurring\)\s*/i, '');
                  return (
                    <article key={rule.id} className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                      <div className="flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-bold text-zinc-200">{description}</p>
                          <p className="mt-1 text-[10px] text-zinc-600">
                            Estimated {formatJPY(rule.transactionTemplate.amount)} · {overdueDays > 0 ? `${overdueDays}d overdue` : 'Expected today'}
                          </p>
                        </div>
                        <button type="button" onClick={() => onPostponeExpectedBill(rule.id)} className="min-h-9 shrink-0 rounded-lg px-2 text-[10px] font-semibold text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300">Not yet</button>
                        <button type="button" onClick={() => onConfirmExpectedBill(rule.id)} className="min-h-9 shrink-0 rounded-lg bg-white px-3 text-[10px] font-bold uppercase tracking-wide text-black hover:bg-zinc-200">Confirm</button>
                      </div>
                    </article>
                  );
                })}
              </div>
              {expectedBills.length > 3 && (
                <button type="button" onClick={() => setShowAllExpectedBills((value) => !value)} className="mt-2 min-h-9 w-full text-[10px] font-semibold text-zinc-500 hover:text-zinc-300">
                  {showAllExpectedBills ? 'Show less' : `Show ${expectedBills.length - 3} more`}
                </button>
              )}
            </section>
          )}

          {quickEntries.length > 0 && (
            <section className="order-4 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
              <div className="mb-3 flex items-center gap-2 text-xs font-bold text-zinc-300"><Sparkles size={14} /> Quick entries</div>
              <div className="grid gap-2 sm:grid-cols-3">
                {quickEntries.map((entry) => (
                  <button key={`${entry.category}-${entry.description}`} type="button" onClick={() => onQuickAdd({ type: 'expense', amount: entry.amount, description: entry.description, category: entry.category, date: new Date().toLocaleDateString('en-CA') })} className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-3 text-left transition hover:border-zinc-700 hover:bg-zinc-900">
                    <div className="min-w-0"><p className="truncate text-xs font-bold text-zinc-200">{entry.description}</p><p className="mt-0.5 text-[10px] text-zinc-600">{entry.category} · {entry.count} times</p></div>
                    <span className="shrink-0 text-xs font-bold text-zinc-400 tabular-nums">{formatJPY(entry.amount)}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {homeGoals.length > 0 && (
            <section className="order-5 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
              <div className="mb-3 flex items-center justify-between gap-3"><h2 className="text-xs font-bold text-zinc-300">Goals</h2><button type="button" onClick={onOpenGoals} className="flex min-h-9 items-center gap-1 px-1 text-[10px] font-semibold text-zinc-500 hover:text-white">View all <ArrowRight size={12} /></button></div>
              <div className="grid gap-2 sm:grid-cols-2">
                {homeGoals.map((goal) => {
                  const percentage = Math.min(100, Math.round((goal.currentAmount / goal.targetAmount) * 100));
                  return (
                    <article key={goal.id} className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                      <button type="button" onClick={onOpenGoals} className="flex w-full items-center gap-2 text-left"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-zinc-400"><GoalIcon icon={goal.icon} size={15} /></span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold text-zinc-200">{goal.name}</span><span className="block text-[10px] text-zinc-600">{formatJPY(goal.currentAmount)} of {formatJPY(goal.targetAmount)}</span></span><strong className="text-xs text-zinc-400 tabular-nums">{percentage === 0 ? 'Start' : `${percentage}%`}</strong></button>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800"><div className="h-full rounded-full bg-emerald-400" style={{ width: `${percentage}%` }} /></div>
                      <div className="mt-2 flex items-center justify-between gap-2"><span className="truncate text-[10px] text-zinc-600">{goal.monthlyContribution ? `${formatJPY(goal.monthlyContribution)}/month` : 'Ready when you are'}</span><button type="button" onClick={() => onAddGoalFunds(goal.id)} className="min-h-9 shrink-0 rounded-lg bg-white px-3 text-[10px] font-bold uppercase tracking-wide text-black hover:bg-zinc-200">Fund</button></div>
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          <section className="order-8 rounded-xl border border-zinc-800 bg-zinc-900/70 p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div><h2 className="flex items-center gap-2 text-sm font-bold text-zinc-200"><TrendingUp size={16} /> Six-month cash flow</h2><div className="mt-1 flex flex-wrap items-center gap-3 text-[10px] text-zinc-500"><span>Ending in {monthLabel}</span><span className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-white" /> Income</span><span className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-zinc-500" /> Spending</span></div></div>
              <button type="button" onClick={onOpenTransactions} className="flex items-center gap-1 text-xs font-semibold text-zinc-400 hover:text-white">Transactions <ArrowRight size={13} /></button>
            </div>
            <Suspense fallback={<div className="h-40 animate-pulse rounded-lg bg-zinc-800/60" />}><CashFlowChart data={trendChartData} formatJPY={(value) => formatJPY(value)} /></Suspense>
          </section>
        </div>

        <aside className="contents lg:block lg:space-y-5">
          {monthlyInsights.length > 0 && (
            <section className="order-6 rounded-xl border border-zinc-800 bg-zinc-900/70 p-5">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-zinc-200"><Lightbulb size={16} /> This month explained</h2>
              <div className="space-y-3">{monthlyInsights.map((insight) => <p key={insight} className="border-l-2 border-zinc-700 pl-3 text-xs leading-relaxed text-zinc-400">{insight}</p>)}</div>
              <p className={`mt-4 rounded-lg px-3 py-2.5 text-xs ${expenseChange !== null && expenseChange > 0 ? 'bg-rose-500/10 text-rose-300' : 'bg-zinc-950 text-zinc-400'}`}>{comparisonText}</p>
            </section>
          )}

          {nextDebt && (
            <section className="order-7 rounded-xl border border-zinc-800 bg-zinc-900/70 p-5">
              <button type="button" onClick={onOpenDebts} className="flex w-full items-start justify-between gap-4 text-left"><div><p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Next debt payment</p><p className="mt-1 text-2xl font-bold text-white tabular-nums">{formatJPY(Math.min(nextDebt.amount, nextDebt.minimumPayment ?? nextDebt.amount))}</p></div><ArrowRight size={18} className="mt-1 text-zinc-600" /></button>
              <div className="mt-4 flex items-center justify-between gap-3 border-t border-zinc-800 pt-4"><span className="flex items-center gap-1.5 text-xs text-zinc-500"><CalendarClock size={13} /> {nextDebt.person} · {new Date(nextDebt.dueDate).toLocaleDateString()}</span><button type="button" onClick={() => onPayDebt(nextDebt.id)} className="min-h-10 rounded-lg bg-white px-5 text-[11px] font-bold uppercase tracking-wide text-black hover:bg-zinc-200">Pay</button></div>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
};
