
import React, { useState, useEffect } from 'react';
import { Expense, SpendingInsight, Debt, DebtForecast } from '../types';
import { analyzeSpendingHabits } from '../services/geminiService';
import { Sparkles, ArrowRight, Lightbulb, AlertCircle, Wallet, Loader2, TrendingUp, Landmark, Calculator, CheckCircle2, CalendarClock } from 'lucide-react';

interface AIInsightsProps {
  expenses: Expense[];
  debts: Debt[];
  monthlyFreeCashFlow: number;
}

export const AIInsights: React.FC<AIInsightsProps> = ({ expenses, debts, monthlyFreeCashFlow }) => {
  const [insight, setInsight] = useState<SpendingInsight | null>(null);
  const [debtForecast, setDebtForecast] = useState<DebtForecast | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'spending' | 'debt'>('spending');
  const [error, setError] = useState<string | null>(null);

  // Calculator State
  const [customBudget, setCustomBudget] = useState<string>('');

  useEffect(() => {
    if (!customBudget && monthlyFreeCashFlow > 0) {
      setCustomBudget(monthlyFreeCashFlow.toString());
    }
  }, [monthlyFreeCashFlow]);

  // Deterministic Debt Calculator (Avalanche Method)
  const calculateDebtPayoff = () => {
    const budget = parseFloat(customBudget);
    if (isNaN(budget) || budget <= 0) {
      setError("Please enter a valid monthly budget.");
      return;
    }
    setError(null);

    const activeDebts = debts
      .filter(d => d.type === 'payable' && !d.isPaid)
      .map(d => ({
        ...d,
        currentBalance: d.amount,
        rate: d.interestRate ?? 15.0, // Default to 15% if missing
        minPay: d.minimumPayment ?? Math.max(d.amount * 0.02, 1000) // Default min pay logic
      }));

    if (activeDebts.length === 0) {
       setDebtForecast({
         estimatedDebtFreeDate: "Debt Free",
         monthlyPaymentRecommendation: 0,
         strategy: "None",
         actionPlan: ["You have no active debts!"]
       });
       return;
    }

    // Sort by Highest Interest Rate (Avalanche)
    activeDebts.sort((a, b) => b.rate - a.rate);

    let months = 0;
    let totalInterestAccrued = 0;
    const maxMonths = 600; // 50 years cap

    while (months < maxMonths) {
      // Check if all paid
      if (activeDebts.every(d => d.currentBalance <= 1)) break;

      months++;
      let monthlyBudgetAvailable = budget;

      // 1. Accrue Interest
      activeDebts.forEach(d => {
        if (d.currentBalance > 1) {
          const interest = d.currentBalance * (d.rate / 100 / 12);
          d.currentBalance += interest;
          totalInterestAccrued += interest;
        }
      });

      // 2. Pay Minimums
      activeDebts.forEach(d => {
        if (d.currentBalance > 1) {
          // Pay min, but not more than balance or available budget (though real life you must pay min)
          let pay = Math.min(d.minPay, d.currentBalance);
          // In simulation, we assume user PAYS min even if budget is tight, but let's limit to budget for strictness
          // If budget < min totals, balances will grow.
          
          d.currentBalance -= pay;
          monthlyBudgetAvailable -= pay;
        }
      });

      // 3. Pay Extra to Highest Interest (Avalanche)
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
      estimatedDebtFreeDate: months >= maxMonths ? "Over 50 Years" : futureDate.toLocaleDateString('default', { month: 'long', year: 'numeric' }),
      monthlyPaymentRecommendation: budget,
      strategy: "Avalanche (Highest Interest First)",
      interestWarning: `Total Interest Cost: ¥${Math.round(totalInterestAccrued).toLocaleString()}`,
      actionPlan: [
        `Focus extra payments on: ${activeDebts[0].person} (${activeDebts[0].rate}%)`,
        `Time to debt free: ${months} months`,
        `Keep monthly budget steady at ¥${budget.toLocaleString()}`
      ]
    });
  };

  const handleGenerateSpending = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await analyzeSpendingHabits(expenses);
      setInsight(result);
    } catch (e) {
      setError("Analysis failed. Check connection.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Tab Switcher */}
      <div className="flex p-1 bg-zinc-900 rounded-xl mb-4 border border-zinc-800">
        <button 
          onClick={() => setTab('spending')}
          className={`flex-1 py-3 text-[10px] uppercase tracking-wider font-bold rounded-lg transition-all ${tab === 'spending' ? 'bg-zinc-100 text-black shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
        >
          AI Spending Analysis
        </button>
        <button 
          onClick={() => setTab('debt')}
          className={`flex-1 py-3 text-[10px] uppercase tracking-wider font-bold rounded-lg transition-all ${tab === 'debt' ? 'bg-zinc-100 text-black shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
        >
          Payoff Calculator
        </button>
      </div>

      {/* Default Hero State */}
      {!insight && !debtForecast && tab === 'spending' && (
        <div className="bg-zinc-900 rounded-2xl p-8 text-center border border-zinc-800 animate-fade-in">
          <Sparkles className="w-10 h-10 mx-auto mb-4 text-zinc-600" strokeWidth={1} />
          <h2 className="text-lg font-bold text-zinc-200 mb-2">Spending Intelligence</h2>
          <p className="text-zinc-500 text-sm mb-6 leading-relaxed">
             Use AI to detect patterns and find savings in your transaction history.
          </p>
          <button
            onClick={handleGenerateSpending}
            disabled={loading}
            className="bg-white hover:bg-zinc-200 text-black font-bold text-xs uppercase tracking-wide py-3 px-6 rounded-lg shadow-lg transition-all flex items-center mx-auto gap-2"
          >
            {loading ? <Loader2 className="animate-spin" size={16} /> : <><Sparkles size={16} /> Analyze Now</>}
          </button>
        </div>
      )}
      
      {/* Calculator Input State */}
      {!debtForecast && tab === 'debt' && (
         <div className="bg-zinc-900 p-6 rounded-2xl border border-zinc-800 animate-fade-in">
            <div className="flex items-center gap-2 mb-4 text-zinc-400">
              <Calculator size={20} />
              <h3 className="font-bold text-zinc-200 text-sm uppercase tracking-wide">Payoff Simulator</h3>
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

      {error && <p className="text-red-400 text-xs bg-red-950/20 p-3 rounded border border-red-900/50 flex items-center gap-2"><AlertCircle size={14}/> {error}</p>}

      {/* Spending Insights Results */}
      {tab === 'spending' && insight && (
        <div className="space-y-5 animate-slide-up">
          <div className="bg-zinc-900 p-5 rounded-xl border border-zinc-800">
            <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Sparkles className="text-zinc-400" size={14} /> Summary
            </h3>
            <p className="text-zinc-300 text-sm leading-relaxed">{insight.summary}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-zinc-900 p-4 rounded-xl border border-zinc-800">
               <div className="flex items-center gap-1.5 mb-2 text-zinc-500 text-[10px] font-bold uppercase tracking-wider">
                 <TrendingUp size={12} /> Top Category
               </div>
               <div className="text-lg font-bold text-white truncate">{insight.topCategory}</div>
            </div>

             <div className="bg-zinc-900 p-4 rounded-xl border border-zinc-800">
               <div className="flex items-center gap-1.5 mb-2 text-zinc-500 text-[10px] font-bold uppercase tracking-wider">
                 <CalendarClock size={12} /> Proj. Spend
               </div>
               <div className="text-lg font-bold text-white">¥{insight.projectedEndOfMonth.toLocaleString()}</div>
            </div>
          </div>

          <div className="bg-zinc-950 p-5 rounded-xl border border-zinc-800">
            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-2">
              <Lightbulb className="text-zinc-500" size={14} /> Suggestion
            </h3>
            <p className="text-zinc-300 text-sm">{insight.savingsTip}</p>
          </div>
          
          <button onClick={() => setInsight(null)} className="w-full py-4 text-xs text-zinc-600 hover:text-zinc-400 font-bold uppercase tracking-wide transition-colors">Clear Analysis</button>
        </div>
      )}

      {/* Debt Calculator Results */}
      {tab === 'debt' && debtForecast && (
        <div className="space-y-5 animate-slide-up">
           <div className="bg-zinc-900 p-6 rounded-xl border border-zinc-800 text-center relative overflow-hidden">
             <div className="absolute top-0 left-0 w-full h-1 bg-zinc-800"></div>
             <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-wider mb-2">Estimated Freedom Date</p>
             <h2 className="text-3xl font-bold text-white mb-1">{debtForecast.estimatedDebtFreeDate}</h2>
             <p className="text-xs text-zinc-600">Based on ¥{debtForecast.monthlyPaymentRecommendation.toLocaleString()}/mo budget</p>
           </div>

           <div className="bg-zinc-900 p-5 rounded-xl border border-zinc-800">
             <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-2">
                   <Landmark size={14} /> Plan Details
                </h3>
                <span className="text-[10px] bg-zinc-950 text-zinc-400 px-2 py-1 rounded border border-zinc-800">Avalanche</span>
             </div>
             
             {debtForecast.interestWarning && (
               <div className="bg-zinc-950 p-3 rounded-lg text-xs text-zinc-400 border border-zinc-800 flex gap-2 mb-4">
                  <AlertCircle size={14} className="shrink-0 text-zinc-500" />
                  {debtForecast.interestWarning}
               </div>
             )}

             <div className="space-y-3">
                <h4 className="text-[10px] font-bold text-zinc-600 uppercase tracking-wide">Next Steps</h4>
                {debtForecast.actionPlan?.map((step, index) => (
                  <div key={index} className="flex items-start gap-3">
                    <div className="mt-0.5 text-zinc-500">
                      <CheckCircle2 size={14} />
                    </div>
                    <p className="text-sm text-zinc-300">{step}</p>
                  </div>
                ))}
             </div>
           </div>
           
           <button onClick={() => setDebtForecast(null)} className="w-full py-4 text-xs text-zinc-600 hover:text-zinc-400 font-bold uppercase tracking-wide transition-colors">Recalculate</button>
        </div>
      )}
    </div>
  );
};
