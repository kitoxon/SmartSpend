import React, { useEffect, useState } from 'react';
import { Debt, DebtForecast } from '../types';
import { ArrowRight, Wallet, TrendingUp, Landmark, Calculator, CheckCircle2, CalendarClock, AlertCircle } from 'lucide-react';

interface AIInsightsProps {
  debts: Debt[];
  monthlyFreeCashFlow: number;
}

// Debt payoff-only widget (Avalanche).
export const AIInsights: React.FC<AIInsightsProps> = ({ debts, monthlyFreeCashFlow }) => {
  const [debtForecast, setDebtForecast] = useState<DebtForecast | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [customBudget, setCustomBudget] = useState<string>('');

  useEffect(() => {
    if (!customBudget && monthlyFreeCashFlow > 0) {
      setCustomBudget(monthlyFreeCashFlow.toString());
    }
  }, [monthlyFreeCashFlow, customBudget]);

  const calculateDebtPayoff = () => {
    const budget = parseFloat(customBudget);
    if (isNaN(budget) || budget <= 0) {
      setError('Please enter a valid monthly budget.');
      return;
    }
    setError(null);

    const activeDebts = debts
      .filter((d) => d.type === 'payable' && !d.isPaid)
      .map((d) => ({
        ...d,
        currentBalance: d.amount,
        rate: d.interestRate ?? 15.0,
        minPay: d.minimumPayment ?? Math.max(d.amount * 0.02, 1000),
      }));

    if (activeDebts.length === 0) {
      setDebtForecast({
        estimatedDebtFreeDate: 'Debt Free',
        monthlyPaymentRecommendation: 0,
        strategy: 'None',
        actionPlan: ['You have no active debts!'],
      });
      return;
    }

    activeDebts.sort((a, b) => b.rate - a.rate);

    let months = 0;
    let totalInterestAccrued = 0;
    const maxMonths = 600;

    while (months < maxMonths) {
      if (activeDebts.every((d) => d.currentBalance <= 1)) break;

      months++;
      let monthlyBudgetAvailable = budget;

      activeDebts.forEach((d) => {
        if (d.currentBalance > 1) {
          const interest = d.currentBalance * (d.rate / 100 / 12);
          d.currentBalance += interest;
          totalInterestAccrued += interest;
        }
      });

      activeDebts.forEach((d) => {
        if (d.currentBalance > 1) {
          const pay = Math.min(d.minPay, d.currentBalance);
          d.currentBalance -= pay;
          monthlyBudgetAvailable -= pay;
        }
      });

      if (monthlyBudgetAvailable > 0) {
        for (const d of activeDebts) {
          if (d.currentBalance > 1) {
            const pay = Math.min(monthlyBudgetAvailable, d.currentBalance);
            d.currentBalance -= pay;
            monthlyBudgetAvailable -= pay;
            if (monthlyBudgetAvailable <= 0) break;
          }
        }
      }
    }

    const futureDate = new Date();
    futureDate.setMonth(futureDate.getMonth() + months);

    setDebtForecast({
      estimatedDebtFreeDate:
        months >= maxMonths ? 'Over 50 Years' : futureDate.toLocaleDateString('default', { month: 'long', year: 'numeric' }),
      monthlyPaymentRecommendation: budget,
      strategy: 'Avalanche (Highest Interest First)',
      interestWarning: `Total Interest Cost: ¥${Math.round(totalInterestAccrued).toLocaleString()}`,
      actionPlan: [
        `Focus extra payments on: ${activeDebts[0].person} (${activeDebts[0].rate}%)`,
        `Time to debt free: ${months} months`,
        `Keep monthly budget steady at ¥${budget.toLocaleString()}`,
      ],
    });
  };

  return (
    <div className="space-y-6">
      {!debtForecast && (
        <div className="bg-zinc-900 p-6 rounded-2xl border border-zinc-800 animate-fade-in">
          <div className="flex items-center gap-2 mb-4 text-zinc-400">
            <Calculator size={20} />
            <h3 className="font-bold text-zinc-200 text-sm uppercase tracking-wide">Payoff Calculator</h3>
          </div>

          <div className="space-y-5">
            <div>
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2">Monthly Budget (¥)</label>
              <input
                type="number"
                value={customBudget}
                onChange={(e) => setCustomBudget(e.target.value)}
                placeholder="50000"
                className="w-full bg-zinc-950 border border-zinc-800 text-white p-3.5 rounded-lg focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600 font-bold outline-none"
              />
              {monthlyFreeCashFlow > 0 && (
                <p className="text-[10px] text-zinc-600 mt-2 flex items-center gap-1">
                  <Wallet size={10} /> Current Free Cash Flow: ¥{monthlyFreeCashFlow.toLocaleString()}
                </p>
              )}
            </div>
            <button
              onClick={calculateDebtPayoff}
              className="w-full bg-white hover:bg-zinc-200 text-black font-bold text-xs uppercase tracking-wide py-3.5 rounded-lg shadow transition-all"
            >
              Calculate Plan
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-danger bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-xs text-red-200">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {debtForecast && (
        <div className="bg-zinc-900 rounded-2xl p-6 border border-zinc-800 space-y-4 animate-fade-in">
          <div className="flex items-center gap-2 text-zinc-400">
            <CheckCircle2 size={20} />
            <h3 className="font-bold text-zinc-200 text-sm uppercase tracking-wide">Your Payoff Plan</h3>
          </div>

          <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase text-zinc-500 font-bold tracking-wide mb-1">Debt Free By</p>
              <p className="text-xl font-bold text-zinc-50">{debtForecast.estimatedDebtFreeDate}</p>
            </div>
            <CalendarClock className="text-zinc-600" size={22} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4">
              <p className="text-[10px] uppercase text-zinc-500 font-bold tracking-wide mb-1">Monthly Budget</p>
              <p className="text-lg font-bold text-zinc-50">¥{Math.round(debtForecast.monthlyPaymentRecommendation).toLocaleString()}</p>
              <p className="text-[11px] text-zinc-600 mt-1 flex items-center gap-1">
                <Wallet size={12} /> Stay consistent monthly
              </p>
            </div>
            <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4">
              <p className="text-[10px] uppercase text-zinc-500 font-bold tracking-wide mb-1">Strategy</p>
              <p className="text-lg font-bold text-zinc-50">{debtForecast.strategy}</p>
              {debtForecast.interestWarning && (
                <p className="text-[11px] text-amber-400 mt-1 flex items-center gap-1">
                  <AlertCircle size={12} /> {debtForecast.interestWarning}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-[10px] uppercase text-zinc-500 font-bold tracking-wide">Action Plan</p>
            <div className="space-y-2">
              {debtForecast.actionPlan.map((step, idx) => (
                <div key={idx} className="flex items-center gap-3 bg-zinc-950 border border-zinc-800 rounded-lg p-3">
                  <span className="w-8 h-8 rounded-md bg-zinc-900 flex items-center justify-center text-xs font-bold text-zinc-400">{idx + 1}</span>
                  <div className="flex-1">
                    <p className="text-sm text-zinc-100">{step}</p>
                  </div>
                  <ArrowRight size={16} className="text-zinc-700" />
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4">
              <div className="flex items-center gap-2 text-zinc-400 mb-1">
                <TrendingUp size={14} /> <span className="text-[11px] uppercase font-bold tracking-wide">Avalanche</span>
              </div>
              <p className="text-xs text-zinc-500">Highest interest first to reduce total interest paid.</p>
            </div>
            <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4">
              <div className="flex items-center gap-2 text-zinc-400 mb-1">
                <Landmark size={14} /> <span className="text-[11px] uppercase font-bold tracking-wide">Stay the course</span>
              </div>
              <p className="text-xs text-zinc-500">Keep payments steady; adjust when balances drop.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
