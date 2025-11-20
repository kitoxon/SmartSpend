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
  const [customBudget, setCustomBudget] = useState<string>('');
  const [strategy, setStrategy] = useState<'avalanche' | 'snowball'>('avalanche');
  const [inputWarning, setInputWarning] = useState<string | null>(null);

  useEffect(() => {
    const cached = localStorage.getItem('smartspend_payoff_budget');
    if (cached && !customBudget) setCustomBudget(cached);
    const cachedStrategy = localStorage.getItem('smartspend_payoff_strategy');
    if (cachedStrategy === 'snowball' || cachedStrategy === 'avalanche') {
      setStrategy(cachedStrategy);
    }
    if (!customBudget && monthlyFreeCashFlow > 0) {
      setCustomBudget(monthlyFreeCashFlow.toString());
    }
  }, [monthlyFreeCashFlow, customBudget]);

  const calculateDebtPayoff = () => {
    const budget = parseFloat(customBudget);
    if (isNaN(budget) || budget <= 0) {
      setInputWarning('Please enter a valid monthly budget.');
      return;
    }
    setInputWarning(null);

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

    const totalMin = activeDebts.reduce((sum, d) => sum + d.minPay, 0);
    if (budget < totalMin) {
      setInputWarning(`Budget must cover minimums (need ¥${Math.round(totalMin).toLocaleString()}).`);
      return;
    }

    if (strategy === 'avalanche') {
      activeDebts.sort((a, b) => b.rate - a.rate);
    } else {
      activeDebts.sort((a, b) => a.currentBalance - b.currentBalance);
    }

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

    localStorage.setItem('smartspend_payoff_budget', customBudget);
    localStorage.setItem('smartspend_payoff_strategy', strategy);

    setDebtForecast({
      estimatedDebtFreeDate:
        months >= maxMonths ? 'Over 50 Years' : futureDate.toLocaleDateString('default', { month: 'long', year: 'numeric' }),
      monthlyPaymentRecommendation: budget,
      strategy: strategy === 'avalanche' ? 'Avalanche (Highest Interest First)' : 'Snowball (Smallest Balance First)',
      interestWarning: `Total Interest Cost: ¥${Math.round(totalInterestAccrued).toLocaleString()}`,
      actionPlan: [
        strategy === 'avalanche'
          ? `Focus extra payments on: ${activeDebts[0].person} (${activeDebts[0].rate}%)`
          : `Focus first on smallest balance: ${activeDebts[0].person} (${formatCurrency(activeDebts[0].currentBalance)})`,
        `Time to debt free: ${months} months`,
        `Keep monthly budget steady at ¥${budget.toLocaleString()}`,
      ],
    });
  };

  const formatCurrency = (value: number) => `¥${Math.round(value).toLocaleString()}`;

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
              {inputWarning && (
                <p className="text-[10px] text-red-400 mt-2 leading-tight flex items-start gap-1.5">
                  <AlertCircle size={12} className="mt-0.5" /> {inputWarning}
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setStrategy('avalanche')}
                className={`h-11 rounded-lg border text-[10px] font-bold uppercase tracking-wide transition-all ${
                  strategy === 'avalanche' ? 'bg-white text-black border-zinc-200' : 'bg-zinc-950 text-zinc-500 border-zinc-800'
                }`}
              >
                Avalanche
              </button>
              <button
                type="button"
                onClick={() => setStrategy('snowball')}
                className={`h-11 rounded-lg border text-[10px] font-bold uppercase tracking-wide transition-all ${
                  strategy === 'snowball' ? 'bg-white text-black border-zinc-200' : 'bg-zinc-950 text-zinc-500 border-zinc-800'
                }`}
              >
                Snowball
              </button>
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
                <Landmark size={14} /> <span className="text-[11px] uppercase font-bold tracking-wide">Snowball</span>
              </div>
              <p className="text-xs text-zinc-500">Smallest balance first to build momentum.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
