
import React, { useState, useMemo, Suspense, useEffect, useRef } from 'react';
import { Transaction, Category, Debt, Goal } from '../types';
import { CategoryIcon } from './ui/CategoryIcon';
import { Wallet, ShieldAlert, Landmark, TrendingUp, History, ArrowUpRight, ArrowDownRight, CalendarClock, AlertCircle, Target } from 'lucide-react';
import { AIInsights } from './AIInsights';
import { simulateDebtPayoff } from '../utils/debtPayoff';
const CashFlowChart = React.lazy(() => import('./charts/CashFlowChart'));
const CategoryChart = React.lazy(() => import('./charts/CategoryChart'));

interface DashboardProps {
  transactions: Transaction[];
  debts?: Debt[];
  goals?: Goal[];
}

type TimeRange = 'today' | 'week' | 'month' | 'all';

const formatJPY = (amount: number) => `¥${amount.toLocaleString()}`;
const formatDate = (date?: string | null) => {
  if (!date) return 'N/A';
  const dt = new Date(date);
  return isNaN(dt.getTime()) ? 'N/A' : dt.toLocaleDateString();
};

const CountUp: React.FC<{ value: number }> = ({ value }) => {
  const [display, setDisplay] = useState(0);
  const hasAnimated = useRef(false);
  useEffect(() => {
    if (hasAnimated.current) {
      setDisplay(value); // jump to the latest value after the first run
      return;
    }

    let frame: number;
    const duration = 1000;
    const start = performance.now();
    const animate = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      setDisplay(value * progress);
      if (progress < 1) {
        frame = requestAnimationFrame(animate);
      } else {
        hasAnimated.current = true;
      }
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <>{formatJPY(Math.round(display))}</>;
};

export const Dashboard: React.FC<DashboardProps> = ({ transactions, debts = [], goals = [] }) => {
  const [timeRange, setTimeRange] = useState<TimeRange>('month');
  const [payoffStrategy, setPayoffStrategy] = useState<'avalanche' | 'snowball'>('avalanche');
  const [extraDebtBudget, setExtraDebtBudget] = useState(0);
  // --- 1. Date Calculations Helpers ---
  const getStartOfWeek = (date: Date) => {
    const start = new Date(date);
    const day = start.getDay();
    const diff = day === 0 ? -6 : 1 - day; // Monday start
    start.setDate(start.getDate() + diff);
    start.setHours(0, 0, 0, 0);
    return start;
  };

  const isSameDay = (d1: Date, d2: Date) => 
    d1.getFullYear() === d2.getFullYear() && 
    d1.getMonth() === d2.getMonth() && 
    d1.getDate() === d2.getDate();

  const isThisWeek = (date: Date) => {
    const today = new Date();
    const startOfWeek = getStartOfWeek(today);
    return date >= startOfWeek;
  };

  const isThisMonth = (date: Date) => {
    const today = new Date();
    return date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear();
  };

  // --- 2. Filter Transactions for CHARTS ---
  const filteredTransactions = useMemo(() => {
    const now = new Date();
    return transactions.filter(t => {
      const tDate = new Date(t.date);
      if (timeRange === 'today') return isSameDay(tDate, now);
      if (timeRange === 'week') return isThisWeek(tDate);
      if (timeRange === 'month') return isThisMonth(tDate);
      return true;
    });
  }, [transactions, timeRange]);

  // --- 3. Calculate Current Month Cashflow (Independent of View) ---
  const currentMonthCashFlow = useMemo(() => {
     const now = new Date();
     const thisMonthTxs = transactions.filter(t => {
        const d = new Date(t.date);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
     });
     
     const inc = thisMonthTxs.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
     const exp = thisMonthTxs.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
     return Math.max(0, inc - exp);
  }, [transactions]);


  // --- 4. Key Metrics (View Dependent) ---
  const income = filteredTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
  const expenses = filteredTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
  const todayExpenses = transactions
    .filter(t => t.type === 'expense' && isSameDay(new Date(t.date), new Date()))
    .reduce((sum, t) => sum + t.amount, 0);

  // --- 5. Income vs Expense Monthly Trend Chart ---
  const trendChartData = useMemo(() => {
    const now = new Date();

    if (timeRange === 'today' || timeRange === 'week') {
      const startOfWeek = getStartOfWeek(now);
      const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

      return labels.map((label, index) => {
        const day = new Date(startOfWeek);
        day.setDate(startOfWeek.getDate() + index);

        const dayTotals = transactions
          .filter(t => isSameDay(new Date(t.date), day))
          .reduce(
            (acc, t) => {
              if (t.type === 'income') acc.income += t.amount;
              else acc.expense += t.amount;
              return acc;
            },
            { income: 0, expense: 0 }
          );

        return { name: label, income: dayTotals.income, expense: dayTotals.expense };
      });
    }

    const data: Record<string, { name: string; income: number; expense: number }> = {};

    // Initialize last 6 months
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.toLocaleString('default', { month: 'short' });
      data[key] = { name: key, income: 0, expense: 0 };
    }

    transactions.forEach(t => {
       const d = new Date(t.date);
       const key = d.toLocaleString('default', { month: 'short' });
       if (data[key]) {
         if (t.type === 'income') data[key].income += t.amount;
         else data[key].expense += t.amount;
       }
    });

    return Object.values(data);
  }, [transactions, timeRange]);

  // --- 6. Category Pie Data ---
  const categoryData = Object.values(Category).map(cat => {
    if (cat === Category.Debt || cat === Category.Savings) return null; 
    const amount = filteredTransactions
      .filter(e => e.category === cat && e.type === 'expense')
      .reduce((sum, e) => sum + e.amount, 0);
    return { name: cat, value: amount };
  }).filter((item): item is { name: Category; value: number } => item !== null && item.value > 0);

  // Sort for better grayscale gradient effect
  categoryData.sort((a, b) => b.value - a.value);

  // --- 7. Goals Snapshot ---
  const goalSnapshot = useMemo(() => {
    if (!goals.length) return null;

    const totalSaved = goals.reduce((sum, g) => sum + g.currentAmount, 0);
    const totalTarget = goals.reduce((sum, g) => sum + g.targetAmount, 0);

    const progressList = goals
      .map(g => ({
        id: g.id,
        name: g.name,
        current: g.currentAmount,
        target: g.targetAmount,
        percent: g.targetAmount ? Math.min(100, Math.round((g.currentAmount / g.targetAmount) * 100)) : 0,
      }))
      .sort((a, b) => b.percent - a.percent);

    return { totalSaved, totalTarget, topGoals: progressList.slice(0, 3) };
  }, [goals]);

  // --- 8. Debt Helpers ---
  const activeDebts = debts.filter(d => d.type === 'payable' && !d.isPaid);
  const totalDebt = activeDebts.reduce((sum, d) => sum + d.amount, 0);
  const totalMinDue = activeDebts.reduce(
    (sum, d) => sum + (d.minimumPayment ?? Math.max(d.amount * 0.02, 1000)),
    0
  );

  const nextDueDebt = useMemo(() => {
    const withDue = activeDebts.filter(d => d.dueDate);
    if (!withDue.length) return null;
    return withDue.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0];
  }, [activeDebts]);

  const topDebts = useMemo(
    () => [...activeDebts].sort((a, b) => b.amount - a.amount).slice(0, 3),
    [activeDebts]
  );

  const computeDebtPlan = (
    strategy: 'avalanche' | 'snowball',
    extraBudget: number
  ) => {
    if (activeDebts.length === 0) return null;

    const plan = simulateDebtPayoff(activeDebts, {
      strategy,
      extraPrincipalBudget: extraBudget,
      startDate: new Date(),
      minPaymentFallback: (d) => Math.max(d.amount * 0.02, 1000),
    });

    return {
      warning: plan.warning,
      date: plan.payoffDateLabel,
      months: plan.months,
      budget: plan.monthlyPrincipalBudget,
      interest: plan.totalInterestPaid,
    };
  };

  const baselinePlan = useMemo(
    () => computeDebtPlan(payoffStrategy, 0),
    [activeDebts, payoffStrategy]
  );

  const boostedPlan = useMemo(
    () => computeDebtPlan(payoffStrategy, extraDebtBudget),
    [activeDebts, payoffStrategy, extraDebtBudget]
  );

  const monthsFaster =
    boostedPlan &&
    baselinePlan &&
    boostedPlan.months !== null &&
    baselinePlan.months !== null &&
    baselinePlan.months > boostedPlan.months
      ? baselinePlan.months - boostedPlan.months
      : 0;

  const recentTransactions = transactions.slice(0, 5);

  return (
    <div className="space-y-6 pb-32">
      
      {/* Time Filter Tabs - Minimal */}
      <div className="flex p-1 bg-zinc-900 rounded-lg border border-zinc-800">
        {(['today', 'week', 'month', 'all'] as TimeRange[]).map((r) => (
          <button
            key={r}
            onClick={() => setTimeRange(r)}
            className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all ${
              timeRange === r ? 'bg-zinc-100 text-black shadow-sm' : 'text-zinc-600 hover:text-zinc-400'
            }`}
          >
            {r}
          </button>
        ))}
      </div>

      {/* Key Metrics Cards */}
      {timeRange === 'today' ? (
         <div className="bg-zinc-900/70 backdrop-blur-sm rounded-xl p-6 text-white border border-zinc-800/80 relative overflow-hidden">
           <div className="absolute top-0 right-0 p-4 opacity-10">
              <Wallet size={48} className="text-white" />
           </div>
           <div className="flex items-center gap-2 mb-2">
             <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Daily Spend</span>
           </div>
           <div className="text-4xl font-bold tracking-tight text-white tabular-nums"><CountUp value={todayExpenses} /></div>
         </div>
      ) : (
        <div className="bg-zinc-900/70 backdrop-blur-sm rounded-xl p-6 text-white border border-zinc-800/80 relative">
          <div className="flex items-center gap-2 mb-5">
            <Landmark size={14} className="text-zinc-500" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
              Overview ({timeRange})
            </span>
          </div>
          
          <div className="grid grid-cols-2 gap-6">
            <div>
               <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                  <ArrowUpRight size={12} className="text-zinc-200" /> Income
               </div>
               <p className="text-2xl font-bold text-white tabular-nums"><CountUp value={income} /></p>
            </div>
            <div>
               <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                  <ArrowDownRight size={12} className="text-zinc-600" /> Expense
               </div>
               <p className="text-2xl font-bold text-zinc-500 tabular-nums"><CountUp value={expenses} /></p>
            </div>
          </div>
        </div>
      )}

      {/* Goals Snapshot */}
      {goalSnapshot && (
        <div className="bg-zinc-900/70 backdrop-blur-sm rounded-xl p-5 text-white border border-zinc-800/80 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Target size={48} className="text-white" />
          </div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-2">
              <Target size={12} /> Goals Snapshot
            </h3>
            <span className="text-[10px] text-zinc-500 font-bold tabular-nums">
              {goalSnapshot.totalTarget ? Math.min(100, Math.round((goalSnapshot.totalSaved / goalSnapshot.totalTarget) * 100)) : 0}%
            </span>
          </div>
          <div className="flex gap-6 mb-4">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Saved</p>
              <p className="text-xl font-bold tabular-nums text-white">{formatJPY(goalSnapshot.totalSaved)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Targets</p>
              <p className="text-xl font-bold tabular-nums text-zinc-300">{formatJPY(goalSnapshot.totalTarget)}</p>
            </div>
          </div>
          <div className="space-y-3">
            {goalSnapshot.topGoals.map(goal => (
              <div key={goal.id}>
                <div className="flex justify-between text-xs text-zinc-400 mb-1">
                  <span className="font-semibold text-zinc-200 truncate">{goal.name}</span>
                  <span className="tabular-nums">{goal.percent}%</span>
                </div>
                <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-white rounded-full transition-all"
                    style={{ width: `${goal.percent}%` }}
                  />
                </div>
                <p className="text-[10px] text-zinc-500 mt-1 tabular-nums">
                  {formatJPY(goal.current)} / {formatJPY(goal.target)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Debt Projection - Minimal */}
      {totalDebt > 0 && (
        <div className="bg-zinc-900/70 backdrop-blur-sm border border-zinc-800/80 p-5 rounded-xl">
          <div className="flex justify-between items-center mb-3">
            <div>
              <h3 className="text-zinc-500 font-bold text-[10px] uppercase tracking-wider mb-1">Active Debt</h3>
              <span className="text-2xl font-bold text-zinc-200 tabular-nums">{formatJPY(totalDebt)}</span>
            </div>
            <div className="bg-zinc-800 p-3 rounded-full text-zinc-400">
              <ShieldAlert size={20} />
            </div>
          </div>
          <div className="flex gap-4 text-[11px] text-zinc-400 mb-3">
            <span className="flex items-center gap-1">
              <CalendarClock size={12} /> Next due: {nextDueDebt ? formatDate(nextDueDebt.dueDate) : 'N/A'}
            </span>
            <span className="flex items-center gap-1">
              <Wallet size={12} /> Min this month: {formatJPY(Math.round(totalMinDue))}
            </span>
          </div>
          <div className="space-y-2">
            {topDebts.map(d => (
              <div key={d.id} className="flex items-center justify-between text-sm text-zinc-200">
                <div className="flex items-center gap-2 truncate">
                  <span className="h-2 w-2 rounded-full bg-zinc-500" />
                  <span className="font-semibold truncate">{d.person}</span>
                </div>
                <div className="text-right text-[11px] text-zinc-400">
                  <div className="font-bold text-sm text-white tabular-nums">{formatJPY(d.amount)}</div>
                  <div>Due {formatDate(d.dueDate)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {baselinePlan && (
        <div className="bg-zinc-900/70 backdrop-blur-sm border border-zinc-800/80 p-5 rounded-xl">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-zinc-500 text-[10px] uppercase tracking-wider flex items-center gap-2">
              <CalendarClock size={12} /> Debt-Free Projection
            </h3>
            <div className="flex gap-1">
              {(['avalanche', 'snowball'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setPayoffStrategy(s)}
                  className={`px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-wide border transition ${
                    payoffStrategy === s
                      ? 'bg-white text-black border-white'
                      : 'border-zinc-800 text-zinc-400 hover:text-white'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          {baselinePlan.warning ? (
            <div className="flex items-center gap-2 text-amber-400 text-sm">
              <AlertCircle size={14} /> {baselinePlan.warning}
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] uppercase text-zinc-500 font-bold tracking-wide mb-1">Debt Free By</p>
                  <p className="text-lg font-bold text-white">{baselinePlan.date}</p>
                  <p className="text-[11px] text-zinc-500">~{baselinePlan.months} months at minimums</p>
                  <p className="text-[11px] text-zinc-500">Est. interest: {formatJPY(Math.round(baselinePlan.interest ?? 0))}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] uppercase text-zinc-500 font-bold tracking-wide mb-1">Monthly Budget</p>
                  <p className="text-lg font-bold text-white tabular-nums">{formatJPY(Math.round(baselinePlan.budget))}</p>
                </div>
              </div>

              <div className="mt-3 space-y-2 text-[11px] text-zinc-500">
                <div className="flex items-center gap-1 flex-nowrap">
                  <span>Extra toward debt:</span>
                  {[0, 5000, 10000].map(v => (
                    <button
                      key={v}
                      onClick={() => setExtraDebtBudget(v)}
                      className={`px-2.5 py-1 rounded-md border text-[10px] font-bold uppercase tracking-wide transition ${
                        extraDebtBudget === v
                          ? 'bg-white text-black border-white'
                          : 'border-zinc-800 text-zinc-400 hover:text-white'
                      }`}
                    >
                      {v === 0 ? 'Base' : `+${v / 1000}k`}
                    </button>
                  ))}
                </div>
                {extraDebtBudget > 0 && boostedPlan && !boostedPlan.warning && (
                  <div className="bg-zinc-950/70 border border-zinc-800 rounded-lg p-3 text-zinc-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[10px] uppercase text-zinc-500 font-bold tracking-wide mb-0.5">With Extra</p>
                        <p className="text-sm font-bold text-white">{boostedPlan.date}</p>
                        <p className="text-[11px] text-zinc-500">~{boostedPlan.months} months</p>
                        <p className="text-[11px] text-zinc-500">Est. interest: {formatJPY(Math.round(boostedPlan.interest ?? 0))}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] uppercase text-zinc-500 font-bold tracking-wide mb-0.5">Budget</p>
                        <p className="text-sm font-bold text-white tabular-nums">{formatJPY(Math.round(boostedPlan.budget))}</p>
                        {monthsFaster > 0 && (
                          <p className="text-[11px] text-emerald-400">Saves ~{monthsFaster} months</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                {extraDebtBudget > 0 && boostedPlan?.warning && (
                  <div className="flex items-center gap-2 text-amber-400 text-sm">
                    <AlertCircle size={14} /> {boostedPlan.warning}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Charts Grid */}
      <div className="grid grid-cols-1 gap-6">
        {/* Trend Chart */}
        <div className="bg-zinc-900/70 backdrop-blur-sm p-5 rounded-xl border border-zinc-800/80">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-zinc-500 text-[10px] uppercase tracking-wider flex items-center gap-2">
              <TrendingUp size={12} /> Cash Flow Trend
            </h3>
          </div>
          <Suspense fallback={<div className="text-[10px] text-zinc-600">Loading chart...</div>}>
            <CashFlowChart data={trendChartData} formatJPY={formatJPY} />
          </Suspense>
        </div>

        {/* Category Chart */}
        <div className="bg-zinc-900/70 backdrop-blur-sm p-5 rounded-xl border border-zinc-800/80">
          <h3 className="font-bold text-zinc-500 text-[10px] uppercase tracking-wider mb-4">Category Breakdown</h3>
          <Suspense fallback={<div className="text-[10px] text-zinc-600">Loading chart...</div>}>
            <CategoryChart data={categoryData} formatJPY={formatJPY} />
          </Suspense>
        </div>
      </div>

      {/* Recent Activity Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h3 className="font-bold text-zinc-500 text-[10px] uppercase tracking-wider flex items-center gap-2">
             <History size={12} /> Recent Entries
          </h3>
        </div>
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
          {recentTransactions.length > 0 ? recentTransactions.map(t => (
            <div key={t.id} className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800 last:border-0 active:bg-zinc-800 transition-colors">
               <div className="flex items-center gap-4 min-w-0">
                  <div className="w-9 h-9 rounded-md bg-zinc-950 flex items-center justify-center shrink-0 border border-zinc-800">
                     <CategoryIcon category={t.category} size={16} className={t.type === 'income' ? 'text-white' : 'text-zinc-500'} />
                  </div>
                  <div className="min-w-0">
                     <p className="text-sm font-bold text-zinc-200 leading-tight truncate">{t.description}</p>
                     <p className="text-[10px] text-zinc-600 uppercase tracking-wide leading-tight mt-0.5">{new Date(t.date).toLocaleDateString()}</p>
                  </div>
               </div>
               <span className={`font-bold text-sm whitespace-nowrap ml-3 tabular-nums ${t.type === 'income' ? 'text-white' : 'text-zinc-500'}`}>
                  {t.type === 'income' ? '+' : ''}{formatJPY(t.amount)}
               </span>
            </div>
          )) : (
             <div className="p-6 text-center text-zinc-600 text-xs">No recent transactions.</div>
          )}
        </div>
      </div>
      
      {/* <AIInsights 
        debts={debts} 
        monthlyFreeCashFlow={currentMonthCashFlow} 
      /> */}
    </div>
  );
};
