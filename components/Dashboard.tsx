
import React, { useState, useMemo, Suspense } from 'react';
import { Transaction, Category, Debt } from '../types';
import { CategoryIcon } from './ui/CategoryIcon';
import { Wallet, ShieldAlert, Landmark, TrendingUp, History, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { AIInsights } from './AIInsights';
const CashFlowChart = React.lazy(() => import('./charts/CashFlowChart'));
const CategoryChart = React.lazy(() => import('./charts/CategoryChart'));

interface DashboardProps {
  transactions: Transaction[];
  debts?: Debt[];
}

type TimeRange = 'today' | 'week' | 'month' | 'all';

export const Dashboard: React.FC<DashboardProps> = ({ transactions, debts = [] }) => {
  const [timeRange, setTimeRange] = useState<TimeRange>('month');

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

  const recentTransactions = transactions.slice(0, 5);
  const activeDebts = debts.filter(d => d.type === 'payable' && !d.isPaid);
  const totalDebt = activeDebts.reduce((sum, d) => sum + d.amount, 0);
  
  const formatJPY = (amount: number) => `¥${amount.toLocaleString()}`;

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
         <div className="bg-zinc-900 rounded-xl p-6 text-white border border-zinc-800 relative overflow-hidden">
           <div className="absolute top-0 right-0 p-4 opacity-10">
              <Wallet size={48} className="text-white" />
           </div>
           <div className="flex items-center gap-2 mb-2">
             <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Daily Spend</span>
           </div>
           <div className="text-4xl font-bold tracking-tight text-white tabular-nums">{formatJPY(todayExpenses)}</div>
         </div>
      ) : (
        <div className="bg-zinc-900 rounded-xl p-6 text-white border border-zinc-800 relative">
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
               <p className="text-2xl font-bold text-white tabular-nums">{formatJPY(income)}</p>
            </div>
            <div>
               <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                  <ArrowDownRight size={12} className="text-zinc-600" /> Expense
               </div>
               <p className="text-2xl font-bold text-zinc-500 tabular-nums">{formatJPY(expenses)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Debt Projection - Minimal */}
      {totalDebt > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-xl flex justify-between items-center">
             <div>
               <h3 className="text-zinc-500 font-bold text-[10px] uppercase tracking-wider mb-1">Active Debt</h3>
               <span className="text-2xl font-bold text-zinc-200 tabular-nums">{formatJPY(totalDebt)}</span>
             </div>
             <div className="bg-zinc-800 p-3 rounded-full text-zinc-400">
               <ShieldAlert size={20} />
             </div>
        </div>
      )}

      {/* Charts Grid */}
      <div className="grid grid-cols-1 gap-6">
        {/* Trend Chart */}
        <div className="bg-zinc-900 p-5 rounded-xl border border-zinc-800">
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
        <div className="bg-zinc-900 p-5 rounded-xl border border-zinc-800">
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
      
      <AIInsights 
        debts={debts} 
        monthlyFreeCashFlow={currentMonthCashFlow} 
      />
    </div>
  );
};
