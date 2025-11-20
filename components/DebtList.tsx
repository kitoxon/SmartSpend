import React from 'react';
import { Debt } from '../types';
import { CheckCircle, Trash2, Calendar, CreditCard, User, Landmark, Banknote, Percent, Shield, Sword } from 'lucide-react';

interface DebtListProps {
  debts: Debt[];
  onDelete: (id: string) => void;
  onToggleStatus: (id: string) => void; 
  onEdit?: (debt: Debt) => void;
}

export const DebtList: React.FC<DebtListProps> = ({ debts, onDelete, onToggleStatus, onEdit }) => {
  const sortedDebts = [...debts].sort((a, b) => {
    if (a.isPaid === b.isPaid) {
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    }
    return a.isPaid ? 1 : -1;
  });

  const totalDebt = debts
    .filter(d => !d.isPaid)
    .reduce((sum, d) => sum + d.amount, 0);

  const getCategoryIcon = (cat: string) => {
    switch(cat) {
        case 'Credit Card': return <CreditCard size={10} />;
        case 'Loan': return <Landmark size={10} />;
        case 'Bank': return <Landmark size={10} />;
        case 'Personal': return <User size={10} />;
        default: return <Banknote size={10} />;
    }
  };

  const formatJPY = (amount: number) => `¥${amount.toLocaleString()}`;

  const getPayoffProjection = (debt: Debt) => {
    const minPay = debt.minimumPayment ?? 0;
    if (minPay <= 0 || debt.amount <= 0) return null;

    const monthlyRate = (debt.interestRate ?? 0) / 100 / 12;
    let balance = debt.amount;
    let months = 0;
    const maxMonths = 600;

    // If payment does not cover interest, warn about negative amortization.
    if (monthlyRate > 0 && minPay <= balance * monthlyRate) {
      return { text: 'Increase payment (interest > min)' };
    }

    while (balance > 1 && months < maxMonths) {
      balance += balance * monthlyRate;
      balance -= minPay;
      months++;
    }

    if (months >= maxMonths) return { text: 'Increase payment (too long)' };

    const payoffDate = new Date();
    payoffDate.setMonth(payoffDate.getMonth() + months);
    return { text: `Paid off by ${payoffDate.toLocaleDateString()}` };
  };

  return (
    <div className="space-y-4 pb-24">
      {/* Summary Card - Minimal */}
      <div className="bg-zinc-800/50 rounded-lg p-5 text-zinc-100 border border-zinc-800 relative overflow-hidden">
        <h3 className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest mb-1">Total Liability</h3>
        <div className="text-3xl font-bold text-white tracking-tight">{formatJPY(totalDebt)}</div>
      </div>

      {/* List */}
      {sortedDebts.length === 0 ? (
        <div className="text-center py-20 text-zinc-600">
          <Shield size={32} className="mx-auto mb-3 opacity-20" />
          <p className="text-sm">No active debts recorded.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedDebts.map((debt) => {
            const projection = getPayoffProjection(debt);
            return (
            <div 
              key={debt.id} 
              className={`p-4 rounded-lg border transition-all flex flex-col gap-3 group relative overflow-hidden cursor-pointer ${
                debt.isPaid 
                  ? 'opacity-50 border-zinc-800 bg-zinc-900' 
                  : 'bg-zinc-800/40 border-zinc-800'
              }`}
              onClick={() => onEdit?.(debt)}
            >
              <div className="flex items-start justify-between w-full gap-3">
                 <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className={`mt-1 p-1.5 rounded-md shrink-0 ${debt.isPaid ? 'bg-zinc-800 text-zinc-600' : 'bg-zinc-800 text-zinc-400'}`}>
                        {debt.isPaid ? <CheckCircle size={16} /> : <Shield size={16} />}
                    </div>
                    
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <h4 className={`font-bold text-sm truncate ${debt.isPaid ? 'text-zinc-500 line-through' : 'text-zinc-200'}`}>
                          {debt.person}
                        </h4>
                      </div>
                      
                      <div className="flex flex-wrap gap-2 mt-1">
                        <span className="text-[9px] uppercase tracking-wide inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500 border border-zinc-700/50">
                            {getCategoryIcon(debt.debtCategory)} {debt.debtCategory}
                        </span>
                        {debt.interestRate && !debt.isPaid && (
                           <span className="text-[9px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded border border-zinc-700/50 flex items-center">
                             <Percent size={8} className="mr-0.5" /> {debt.interestRate}%
                           </span>
                        )}
                      </div>
                    </div>
                 </div>

                 <div className="text-right shrink-0">
                    <div className={`text-base font-bold mb-1 tabular-nums ${debt.isPaid ? 'text-zinc-600' : 'text-white'}`}>
                        {formatJPY(debt.amount)}
                    </div>
                    <p className="text-[10px] text-zinc-500">{new Date(debt.dueDate).toLocaleDateString()}</p>
                 </div>
              </div>

              {!debt.isPaid && (
                <div className="border-t border-zinc-800/50 pt-3 mt-1 flex items-center justify-between">
                   <button 
                        onClick={(e) => { e.stopPropagation(); onDelete(debt.id); }}
                        className="text-zinc-600 hover:text-red-400 text-xs flex items-center gap-1"
                      >
                        <Trash2 size={12} /> Delete
                   </button>
                  
                  <div className="flex items-center gap-3">
                     {debt.minimumPayment && (
                        <div className="flex flex-col text-[10px] text-zinc-500 tabular-nums">
                            <span>Min: {formatJPY(debt.minimumPayment)}</span>
                            {projection && (
                              <span className="flex items-center gap-1 text-zinc-400">
                                <Calendar size={10} /> {projection.text}
                              </span>
                            )}
                        </div>
                      )}
                      <button
                        onClick={() => onToggleStatus(debt.id)}
                        className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide px-3 py-1.5 rounded bg-zinc-100 text-zinc-950 hover:bg-white transition-all"
                      >
                        <Sword size={10} /> Pay
                      </button>
                  </div>
                </div>
              )}
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
