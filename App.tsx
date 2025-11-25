
import React, { useState, useEffect, Suspense } from 'react';
import { ViewState, Transaction, Debt, Goal, Category } from './types';
import { 
  getTransactions, saveTransaction, deleteTransaction, 
  getDebts, saveDebt, deleteDebt,
  getGoals, saveGoal, deleteGoal,
  processRecurringTransactions
} from './services/storageService';
import { MOCK_DEBTS_IF_EMPTY, MOCK_GOALS_IF_EMPTY } from './constants';
import { ExpenseForm } from './components/ExpenseForm';
import { DebtForm } from './components/DebtForm';
import { GoalForm } from './components/GoalForm';
import { Modal } from './components/ui/Modal';
import { LayoutDashboard, List as ListIcon, Plus, Wallet, ArrowRightLeft, Target, DollarSign, TrendingDown, TrendingUp, ShieldAlert, Landmark } from 'lucide-react';

const Dashboard = React.lazy(() => import('./components/Dashboard').then(m => ({ default: m.Dashboard })));
const ExpenseList = React.lazy(() => import('./components/ExpenseList').then(m => ({ default: m.ExpenseList })));
const DebtList = React.lazy(() => import('./components/DebtList').then(m => ({ default: m.DebtList })));
const GoalList = React.lazy(() => import('./components/GoalList').then(m => ({ default: m.GoalList })));

const App: React.FC = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [currentView, setCurrentView] = useState<ViewState>('dashboard');
  const [isLoading, setIsLoading] = useState(true);
  
  // Modal states
  const [isCommandMenuOpen, setIsCommandMenuOpen] = useState(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [isDebtModalOpen, setIsDebtModalOpen] = useState(false);
  const [isGoalModalOpen, setIsGoalModalOpen] = useState(false);
  const [isAddFundsModalOpen, setIsAddFundsModalOpen] = useState(false);
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [fundAmountToAdd, setFundAmountToAdd] = useState('');
  const [isPayDebtModalOpen, setIsPayDebtModalOpen] = useState(false);
  const [selectedDebtId, setSelectedDebtId] = useState<string | null>(null);
  const [debtPaymentAmount, setDebtPaymentAmount] = useState('');
  const [pendingDelete, setPendingDelete] = useState<{ type: 'transaction' | 'debt' | 'goal'; id: string } | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [editingDebt, setEditingDebt] = useState<Debt | null>(null);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);

  useEffect(() => {
    const loadData = async () => {
      await processRecurringTransactions();
      const [txs, dbs, gls] = await Promise.all([getTransactions(), getDebts(), getGoals()]);
      setTransactions(txs);
      
      if (dbs.length === 0) {
         const validMocks = MOCK_DEBTS_IF_EMPTY.filter(d => d.type === 'payable');
         setDebts(validMocks);
      } else {
         setDebts(dbs);
      }

      if (gls.length === 0) {
          setGoals(MOCK_GOALS_IF_EMPTY);
      } else {
          setGoals(gls);
      }

      setIsLoading(false);
    };
    loadData();
  }, []);

  const handleSaveTransaction = async (newTxData: Omit<Transaction, 'id'>, existingId?: string) => {
    if (existingId) {
      const updatedTx: Transaction = { ...newTxData, id: existingId, created_at: editingTransaction?.created_at ?? new Date().toISOString() };
      setTransactions(prev => prev.map(tx => tx.id === existingId ? updatedTx : tx));
      await saveTransaction(updatedTx);
    } else {
      const newTx: Transaction = { ...newTxData, id: crypto.randomUUID(), created_at: new Date().toISOString() };
      setTransactions(prev => [newTx, ...prev]);
      await saveTransaction(newTx);
    }
    setEditingTransaction(null);
    setIsExpenseModalOpen(false);
  };

  const handleDeleteTransaction = (id: string) => {
    setPendingDelete({ type: 'transaction', id });
  };

  const handleSaveDebt = async (newDebtData: Omit<Debt, 'id' | 'isPaid'>, existingId?: string) => {
    if (existingId) {
      const updated: Debt = { ...newDebtData, id: existingId, isPaid: false };
      setDebts(prev => prev.map(d => d.id === existingId ? updated : d));
      await saveDebt(updated);
    } else {
      const newDebt: Debt = { ...newDebtData, id: crypto.randomUUID(), isPaid: false };
      setDebts(prev => [newDebt, ...prev]);
      await saveDebt(newDebt);
    }
    setEditingDebt(null);
    setIsDebtModalOpen(false);
  };

  const handleDeleteDebt = (id: string) => {
    setPendingDelete({ type: 'debt', id });
  };

  const handleOpenPayDebt = (id: string) => {
     const debt = debts.find(d => d.id === id);
     if (debt) {
        setSelectedDebtId(id);
        setDebtPaymentAmount(debt.minimumPayment ? debt.minimumPayment.toString() : debt.amount.toString());
        setIsPayDebtModalOpen(true);
     }
  };

  const handleSubmitDebtPayment = async (e: React.FormEvent) => {
     e.preventDefault();
     if (!selectedDebtId || !debtPaymentAmount) return;

     const amount = parseFloat(debtPaymentAmount);
     if (isNaN(amount) || amount <= 0) return;

     const debt = debts.find(d => d.id === selectedDebtId);
     if (debt) {
        const newBalance = Math.max(0, debt.amount - amount);
        const isPaidOff = newBalance === 0;
        const currentDue = new Date(debt.dueDate || new Date().toISOString());
        const nextDue = new Date(currentDue);
        nextDue.setMonth(nextDue.getMonth() + 1);

        const updatedDebt = { ...debt, amount: newBalance, isPaid: isPaidOff, dueDate: nextDue.toISOString() };
        setDebts(prev => prev.map(d => d.id === selectedDebtId ? updatedDebt : d));
        await saveDebt(updatedDebt);

        if (debt.type === 'payable') {
          const newTx: Transaction = {
             id: crypto.randomUUID(),
             amount: amount,
             category: Category.Debt,
             date: new Date().toISOString(),
             description: `Debt Payment: ${debt.person}`,
             type: 'expense'
          };
          setTransactions(prev => [newTx, ...prev]);
          await saveTransaction(newTx);
        }
     }

     setIsPayDebtModalOpen(false);
     setSelectedDebtId(null);
  };

  const handleSaveGoal = async (newGoalData: Omit<Goal, 'id'>, existingId?: string) => {
    if (existingId) {
      const updatedGoal: Goal = { ...newGoalData, id: existingId };
      setGoals(prev => prev.map(g => g.id === existingId ? updatedGoal : g));
      await saveGoal(updatedGoal);
    } else {
      const newGoal: Goal = { ...newGoalData, id: crypto.randomUUID() };
      setGoals(prev => [newGoal, ...prev]);
      await saveGoal(newGoal);
    }
    setEditingGoal(null);
    setIsGoalModalOpen(false);
  };

  const handleDeleteGoal = (id: string) => {
    setPendingDelete({ type: 'goal', id });
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const { type, id } = pendingDelete;

    if (type === 'transaction') {
      setTransactions(prev => prev.filter(e => e.id !== id));
      await deleteTransaction(id);
    } else if (type === 'debt') {
      setDebts(prev => prev.filter(d => d.id !== id));
      await deleteDebt(id);
    } else if (type === 'goal') {
      setGoals(prev => prev.filter(g => g.id !== id));
      await deleteGoal(id);
    }

    setPendingDelete(null);
  };

  const handleOpenAddFunds = (id: string) => {
    setSelectedGoalId(id);
    setFundAmountToAdd('');
    setIsAddFundsModalOpen(true);
  };

  const handleSubmitFunds = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedGoalId && fundAmountToAdd) {
      const amount = parseFloat(fundAmountToAdd);
      if (isNaN(amount) || amount <= 0) return;

      const goal = goals.find(g => g.id === selectedGoalId);
      if (goal) {
        const updatedGoal = { ...goal, currentAmount: goal.currentAmount + amount };
        setGoals(prev => prev.map(g => g.id === selectedGoalId ? updatedGoal : g));
        await saveGoal(updatedGoal);

        const newTx: Transaction = {
          id: crypto.randomUUID(),
          amount: amount,
          category: Category.Savings,
          date: new Date().toISOString(),
          description: `Goal Deposit: ${goal.name}`,
          type: 'expense'
        };
        setTransactions(prev => [newTx, ...prev]);
        await saveTransaction(newTx);
      }
      
      setIsAddFundsModalOpen(false);
      setSelectedGoalId(null);
    }
  };

  const handleFabClick = () => {
    if (currentView === 'dashboard') {
      setIsCommandMenuOpen(true);
    } else if (currentView === 'debts') {
      setIsDebtModalOpen(true);
    } else if (currentView === 'goals') {
      setIsGoalModalOpen(true);
    } else {
      setEditingTransaction(null);
      setIsExpenseModalOpen(true);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex justify-center font-sans">
        <div className="w-full max-w-md px-4 py-6 space-y-4 min-h-screen">
          <div className="h-10 w-32 bg-zinc-800/70 rounded-full animate-pulse-slow" />
          <div className="bg-zinc-900/60 border border-zinc-800/70 rounded-xl p-5 space-y-4 backdrop-blur-sm">
            <div className="h-4 w-24 bg-zinc-800/70 rounded animate-pulse-slow" />
            <div className="flex gap-3">
              <div className="h-8 w-24 bg-zinc-800/70 rounded animate-pulse-slow" />
              <div className="h-8 w-24 bg-zinc-800/70 rounded animate-pulse-slow" />
            </div>
          </div>
          <div className="bg-zinc-900/60 border border-zinc-800/70 rounded-xl p-5 space-y-3 backdrop-blur-sm">
            <div className="h-4 w-32 bg-zinc-800/70 rounded animate-pulse-slow" />
            <div className="h-40 w-full bg-zinc-800/50 rounded-lg animate-pulse-slow" />
          </div>
          <div className="bg-zinc-900/60 border border-zinc-800/70 rounded-xl p-5 space-y-3 backdrop-blur-sm">
            <div className="h-4 w-28 bg-zinc-800/70 rounded animate-pulse-slow" />
            <div className="h-40 w-full bg-zinc-800/50 rounded-lg animate-pulse-slow" />
          </div>
          <div className="bg-zinc-900/60 border border-zinc-800/70 rounded-xl p-5 space-y-3 backdrop-blur-sm">
            <div className="h-4 w-28 bg-zinc-800/70 rounded animate-pulse-slow" />
            <div className="h-40 w-full bg-zinc-800/50 rounded-lg animate-pulse-slow" />
          </div>
        </div>
        <style>{`
          @keyframes pulse-slow { 
            0% { opacity: 0.6; } 
            50% { opacity: 1; } 
            100% { opacity: 0.6; } 
          }
          .animate-pulse-slow { animation: pulse-slow 1.5s ease-in-out infinite; }
        `}</style>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen max-w-md mx-auto shadow-2xl shadow-zinc-900 relative overflow-hidden text-zinc-200 border-x border-zinc-900 font-sans"
      style={{
        backgroundColor: '#000',
        backgroundImage:
          'radial-gradient(circle at 50% 20%, rgba(63, 63, 70, 0.35), rgba(0,0,0,0.5) 45%, #000 75%)'
      }}
    >
      {/* Header - Minimal & Translucent */}
      <header className="bg-black/70 backdrop-blur-md px-5 py-4 sticky top-0 z-20 border-b border-zinc-900/80 flex items-center justify-between">
        <div className="flex items-center gap-2.5 text-zinc-100">
          <div className="p-1.5 rounded-md bg-zinc-100 text-black">
             <Landmark className="w-3.5 h-3.5" strokeWidth={3} />
          </div>
          <h1 className="text-sm font-bold tracking-wide text-white">SmartSpend</h1>
        </div>
      </header>

      <main className="p-4 min-h-[calc(100vh-140px)] relative z-10">
        <Suspense fallback={<div className="text-sm text-zinc-500">Loading...</div>}>
          {currentView === 'dashboard' && <Dashboard transactions={transactions} debts={debts} />}
        {currentView === 'list' && <ExpenseList expenses={transactions} onDelete={handleDeleteTransaction} onEdit={(tx) => { setEditingTransaction(tx); setIsExpenseModalOpen(true); }} />}
        {currentView === 'debts' && <DebtList debts={debts} onDelete={handleDeleteDebt} onToggleStatus={handleOpenPayDebt} onEdit={(d) => { setEditingDebt(d); setIsDebtModalOpen(true); }} />}
        {currentView === 'goals' && <GoalList goals={goals} onDelete={handleDeleteGoal} onAddFundsClick={handleOpenAddFunds} onEdit={(g) => { setEditingGoal(g); setIsGoalModalOpen(true); }} />}
        </Suspense>
      </main>

      {/* FAB - anchored to app container width */}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 flex justify-center z-30">
        <div className="w-full max-w-md px-4 flex justify-end">
          <button
            onClick={handleFabClick}
            className="pointer-events-auto bg-white text-black h-12 w-12 rounded-full shadow-xl shadow-zinc-900/50 transition-all active:scale-90 hover:scale-105 flex items-center justify-center border border-zinc-200"
          >
            <Plus size={24} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {/* Bottom Nav - Black with White Active State */}
      <nav className="fixed bottom-0 w-full max-w-md bg-black/90 border-t border-zinc-900 px-2 py-1 z-20 grid grid-cols-4 pb-safe backdrop-blur-lg">
        <button onClick={() => setCurrentView('dashboard')} className={`flex flex-col items-center justify-center p-2 rounded-lg transition-all active:bg-zinc-900 ${currentView === 'dashboard' ? 'text-white' : 'text-zinc-600'}`}>
          <LayoutDashboard size={20} strokeWidth={currentView === 'dashboard' ? 2.5 : 2} />
          <span className="text-[10px] mt-1 font-medium tracking-wide">Home</span>
        </button>
        <button onClick={() => setCurrentView('list')} className={`flex flex-col items-center justify-center p-2 rounded-lg transition-all active:bg-zinc-900 ${currentView === 'list' ? 'text-white' : 'text-zinc-600'}`}>
          <ListIcon size={20} strokeWidth={currentView === 'list' ? 2.5 : 2} />
          <span className="text-[10px] mt-1 font-medium tracking-wide">List</span>
        </button>
        <button onClick={() => setCurrentView('debts')} className={`flex flex-col items-center justify-center p-2 rounded-lg transition-all active:bg-zinc-900 ${currentView === 'debts' ? 'text-white' : 'text-zinc-600'}`}>
          <ArrowRightLeft size={20} strokeWidth={currentView === 'debts' ? 2.5 : 2} />
          <span className="text-[10px] mt-1 font-medium tracking-wide">Debt</span>
        </button>
        <button onClick={() => setCurrentView('goals')} className={`flex flex-col items-center justify-center p-2 rounded-lg transition-all active:bg-zinc-900 ${currentView === 'goals' ? 'text-white' : 'text-zinc-600'}`}>
          <Target size={20} strokeWidth={currentView === 'goals' ? 2.5 : 2} />
          <span className="text-[10px] mt-1 font-medium tracking-wide">Goal</span>
        </button>
      </nav>

      {/* Command Menu Modal */}
      <Modal isOpen={isCommandMenuOpen} onClose={() => setIsCommandMenuOpen(false)} title="Quick Actions">
        <div className="grid grid-cols-2 gap-3 pt-2">
           <button onClick={() => { setIsCommandMenuOpen(false); setEditingTransaction(null); setIsExpenseModalOpen(true); }} className="flex flex-col items-center justify-center p-4 bg-zinc-900 border border-zinc-800 rounded-xl hover:bg-zinc-800 transition-all active:scale-95 group">
              <div className="bg-zinc-100 p-2.5 rounded-full text-black mb-2 group-hover:bg-white transition-colors"><TrendingDown size={18} /></div>
              <span className="font-bold text-xs text-zinc-200 uppercase tracking-wide">Expense</span>
           </button>
           <button onClick={() => { setIsCommandMenuOpen(false); setEditingTransaction(null); setIsExpenseModalOpen(true); }} className="flex flex-col items-center justify-center p-4 bg-zinc-900 border border-zinc-800 rounded-xl hover:bg-zinc-800 transition-all active:scale-95 group">
              <div className="bg-zinc-100 p-2.5 rounded-full text-black mb-2 group-hover:bg-white transition-colors"><TrendingUp size={18} /></div>
              <span className="font-bold text-xs text-zinc-200 uppercase tracking-wide">Income</span>
           </button>
           <button onClick={() => { setIsCommandMenuOpen(false); setIsDebtModalOpen(true); }} className="flex flex-col items-center justify-center p-4 bg-zinc-900 border border-zinc-800 rounded-xl hover:bg-zinc-800 transition-all active:scale-95 group">
              <div className="bg-zinc-800 p-2.5 rounded-full text-zinc-400 mb-2 group-hover:text-white transition-colors"><ShieldAlert size={18} /></div>
              <span className="font-bold text-xs text-zinc-400 uppercase tracking-wide">Debt</span>
           </button>
           <button onClick={() => { setIsCommandMenuOpen(false); setIsGoalModalOpen(true); }} className="flex flex-col items-center justify-center p-4 bg-zinc-900 border border-zinc-800 rounded-xl hover:bg-zinc-800 transition-all active:scale-95 group">
              <div className="bg-zinc-800 p-2.5 rounded-full text-zinc-400 mb-2 group-hover:text-white transition-colors"><Target size={18} /></div>
              <span className="font-bold text-xs text-zinc-400 uppercase tracking-wide">Goal</span>
           </button>
        </div>
      </Modal>

      <Modal isOpen={isExpenseModalOpen} onClose={() => { setIsExpenseModalOpen(false); setEditingTransaction(null); }} title={editingTransaction ? "Edit Transaction" : "Log Transaction"}>
        <ExpenseForm transaction={editingTransaction ?? undefined} onSave={handleSaveTransaction} onCancel={() => { setIsExpenseModalOpen(false); setEditingTransaction(null); }} />
      </Modal>
      <Modal isOpen={isDebtModalOpen} onClose={() => { setIsDebtModalOpen(false); setEditingDebt(null); }} title={editingDebt ? "Edit Debt" : "Add Debt"}>
        <DebtForm debt={editingDebt ?? undefined} onSave={handleSaveDebt} onCancel={() => { setIsDebtModalOpen(false); setEditingDebt(null); }} />
      </Modal>
      <Modal isOpen={isGoalModalOpen} onClose={() => { setIsGoalModalOpen(false); setEditingGoal(null); }} title={editingGoal ? "Edit Goal" : "New Goal"}>
        <GoalForm goal={editingGoal ?? undefined} onSave={handleSaveGoal} onCancel={() => { setIsGoalModalOpen(false); setEditingGoal(null); }} />
      </Modal>
      
      <Modal isOpen={isAddFundsModalOpen} onClose={() => setIsAddFundsModalOpen(false)} title="Add Funds">
        <form onSubmit={handleSubmitFunds} className="space-y-4">
          <div>
            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Amount (¥)</label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-3.5 text-zinc-400" size={18} />
              <input type="number" required autoFocus value={fundAmountToAdd} onChange={(e) => setFundAmountToAdd(e.target.value)} className="w-full pl-10 h-12 bg-zinc-900 border border-zinc-800 rounded-lg text-white text-lg font-bold focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600 outline-none" />
            </div>
          </div>
          <button type="submit" className="w-full h-12 bg-white hover:bg-zinc-200 text-black font-bold rounded-lg text-xs uppercase tracking-wider">Confirm</button>
        </form>
      </Modal>

      <Modal isOpen={isPayDebtModalOpen} onClose={() => setIsPayDebtModalOpen(false)} title="Pay Debt">
        <form onSubmit={handleSubmitDebtPayment} className="space-y-4">
          <div>
            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Amount (¥)</label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-3.5 text-zinc-400" size={18} />
              <input type="number" required autoFocus value={debtPaymentAmount} onChange={(e) => setDebtPaymentAmount(e.target.value)} className="w-full pl-10 h-12 bg-zinc-900 border border-zinc-800 rounded-lg text-white text-lg font-bold focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600 outline-none" />
            </div>
          </div>
          <button type="submit" className="w-full h-12 bg-white hover:bg-zinc-200 text-black font-bold rounded-lg text-xs uppercase tracking-wider shadow-lg">Confirm Payment</button>
        </form>
      </Modal>

      {/* Delete Confirm */}
      <Modal
        isOpen={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        title="Confirm Delete"
      >
        <div className="space-y-4">
          <p className="text-sm text-zinc-300">
            {pendingDelete?.type === 'transaction' && 'Delete this transaction?'}
            {pendingDelete?.type === 'debt' && 'Delete this debt?'}
            {pendingDelete?.type === 'goal' && 'Delete this goal?'}
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setPendingDelete(null)}
              className="flex-1 h-11 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 font-bold text-xs uppercase tracking-wide rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmDelete}
              className="flex-1 h-11 bg-red-500 hover:bg-red-400 text-white font-bold text-xs uppercase tracking-wide rounded-lg shadow-lg transition-colors"
            >
              Delete
            </button>
          </div>
        </div>
      </Modal>

      <style>{`
        .pb-safe { padding-bottom: env(safe-area-inset-bottom, 20px); }
        @keyframes slide-up { from { transform: translateY(10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .animate-slide-up { animation: slide-up 0.2s ease-out forwards; }
        .animate-fade-in { animation: fadeIn 0.2s ease-in; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
    </div>
  );
};

export default App;
