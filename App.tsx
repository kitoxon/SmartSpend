
import React, { useState, useEffect, useRef, Suspense, useCallback } from 'react';
import type { Session } from '@supabase/supabase-js';
import { ViewState, Transaction, Debt, Goal, Category, RecurringTransaction } from './types';
import { 
  getTransactions, saveTransaction, deleteTransaction, 
  getDebts, saveDebt, deleteDebt,
  getGoals, saveGoal, deleteGoal,
  getRecurringTransactions, saveRecurringTransaction, deleteRecurringTransaction,
  processRecurringTransactions, syncPendingChanges,
  subscribeToSyncState, getSyncSnapshot, clearLocalFinancialData,
  SyncSnapshot,
} from './services/storageService';
import { buildHabitPatterns, findDueHabitReminder, HabitReminderCandidate, HabitReminderState } from './services/habitService';
import { getHabitPatterns, getHabitReminderState, saveHabitPatterns, saveHabitReminderState } from './services/habitStorageService';
import { ExpenseForm } from './components/ExpenseForm';
import { DebtForm } from './components/DebtForm';
import { GoalForm } from './components/GoalForm';
import { AuthScreen } from './components/AuthScreen';
import { SettingsPanel } from './components/SettingsPanel';
import { Modal } from './components/ui/Modal';
import { addMonthsClamped, localDateInputToIso } from './utils/date';
import { supabase } from './services/supabaseClient';
import { LayoutDashboard, List as ListIcon, Plus, ArrowRightLeft, Target, DollarSign, Landmark, Settings, Cloud, CloudOff, RefreshCw, MoreHorizontal, Download, ChevronRight } from 'lucide-react';

const Dashboard = React.lazy(() => import('./components/Dashboard').then(m => ({ default: m.Dashboard })));
const ExpenseList = React.lazy(() => import('./components/ExpenseList').then(m => ({ default: m.ExpenseList })));
const DebtList = React.lazy(() => import('./components/DebtList').then(m => ({ default: m.DebtList })));
const GoalList = React.lazy(() => import('./components/GoalList').then(m => ({ default: m.GoalList })));

const App: React.FC = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [recurringRules, setRecurringRules] = useState<RecurringTransaction[]>([]);
  const [currentView, setCurrentView] = useState<ViewState>('dashboard');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(!supabase);
  const [session, setSession] = useState<Session | null>(null);
  const [syncState, setSyncState] = useState<SyncSnapshot>(getSyncSnapshot());

  const [habitReminder, setHabitReminder] = useState<HabitReminderCandidate | null>(null);
  const [habitStateById, setHabitStateById] = useState<Record<string, HabitReminderState>>({});
  const [habitPatterns, setHabitPatternsState] = useState<ReturnType<typeof buildHabitPatterns>>([]);
  const [remindersEnabled, setRemindersEnabled] = useState(true);
  const [expensePrefill, setExpensePrefill] = useState<Partial<Pick<Transaction, 'type' | 'amount' | 'description' | 'category' | 'date'>> | null>(null);
  const [quickAddNotice, setQuickAddNotice] = useState<Transaction | null>(null);
  const habitsInitialized = useRef(false);
  const dataLoadInFlight = useRef<Promise<void> | null>(null);
  const quickAddTimer = useRef<number | null>(null);
  
  // Modal states
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [isDebtModalOpen, setIsDebtModalOpen] = useState(false);
  const [isGoalModalOpen, setIsGoalModalOpen] = useState(false);
  const [isAddFundsModalOpen, setIsAddFundsModalOpen] = useState(false);
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [fundAmountToAdd, setFundAmountToAdd] = useState('');
  const [isPayDebtModalOpen, setIsPayDebtModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [selectedDebtId, setSelectedDebtId] = useState<string | null>(null);
  const [debtPaymentAmount, setDebtPaymentAmount] = useState('');
  const [debtPaymentError, setDebtPaymentError] = useState<string | null>(null);
  const [fundError, setFundError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ type: 'transaction' | 'debt' | 'goal' | 'recurring'; id: string } | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [editingDebt, setEditingDebt] = useState<Debt | null>(null);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);

  const todayLocal = () => new Date().toLocaleDateString('en-CA');
  const addDaysLocal = (isoDate: string, days: number) => {
    const dt = new Date(isoDate);
    if (isNaN(dt.getTime())) return isoDate;
    dt.setDate(dt.getDate() + days);
    return dt.toLocaleDateString('en-CA');
  };

  const reminderSettingKey = `smartspend_habit_reminders_enabled_v1:${session?.user.id ?? 'local'}`;

  useEffect(() => {
    setRemindersEnabled(localStorage.getItem(reminderSettingKey) !== 'false');
  }, [reminderSettingKey]);

  const openTransactionModal = (
    prefill: Partial<Pick<Transaction, 'type' | 'amount' | 'description' | 'category' | 'date'>> | null = null
  ) => {
    setEditingTransaction(null);
    setExpensePrefill(prefill);
    setIsExpenseModalOpen(true);
  };

  const closeTransactionModal = () => {
    setIsExpenseModalOpen(false);
    setEditingTransaction(null);
    setExpensePrefill(null);
  };

  useEffect(() => () => {
    if (quickAddTimer.current !== null) window.clearTimeout(quickAddTimer.current);
  }, []);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (!event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return;
      if (isExpenseModalOpen || isDebtModalOpen || isGoalModalOpen || isPayDebtModalOpen || isAddFundsModalOpen) return;
      if (event.key.toLocaleLowerCase() === 'e') {
        event.preventDefault();
        openTransactionModal({ type: 'expense' });
      }
      if (event.key.toLocaleLowerCase() === 'i') {
        event.preventDefault();
        openTransactionModal({ type: 'income' });
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [isAddFundsModalOpen, isDebtModalOpen, isExpenseModalOpen, isGoalModalOpen, isPayDebtModalOpen]);

  useEffect(() => {
    if (!supabase) return;
    let mounted = true;
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;
      if (error) setLoadError(error.message);
      setSession(data.session);
      setAuthReady(true);
    });
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthReady(true);
    });
    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const loadData = useCallback((showLoading = true) => {
    if (!authReady || (supabase && !session)) return Promise.resolve();
    if (dataLoadInFlight.current) return dataLoadInFlight.current;

    const task = (async () => {
      if (showLoading) setIsLoading(true);
      setLoadError(null);
      try {
        await syncPendingChanges();
        await processRecurringTransactions();
        const [txs, dbs, gls, rules] = await Promise.all([
          getTransactions(),
          getDebts(),
          getGoals(),
          getRecurringTransactions(),
        ]);
        setTransactions(txs);
        setDebts(dbs);
        setGoals(gls);
        setRecurringRules(rules);
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : 'Could not load your data');
      } finally {
        setIsLoading(false);
      }
    })();

    dataLoadInFlight.current = task.finally(() => {
      dataLoadInFlight.current = null;
    });
    return dataLoadInFlight.current;
  }, [authReady, session?.user.id]);

  useEffect(() => {
    habitsInitialized.current = false;
    void loadData(true);
  }, [loadData]);

  useEffect(() => subscribeToSyncState(setSyncState), []);

  useEffect(() => {
    const syncOnReconnect = () => void loadData(false);
    const syncOnFocus = () => {
      if (document.visibilityState === 'visible') void loadData(false);
    };
    window.addEventListener('online', syncOnReconnect);
    window.addEventListener('focus', syncOnFocus);
    document.addEventListener('visibilitychange', syncOnFocus);
    return () => {
      window.removeEventListener('online', syncOnReconnect);
      window.removeEventListener('focus', syncOnFocus);
      document.removeEventListener('visibilitychange', syncOnFocus);
    };
  }, [loadData]);

  // Habits bootstrap (Supabase-first, local fallback)
  useEffect(() => {
    if (isLoading || habitsInitialized.current) return;
    const init = async () => {
      const [storedPatterns, storedState] = await Promise.all([getHabitPatterns(), getHabitReminderState()]);

      const computed = buildHabitPatterns(transactions);
      const merged = computed.map((p) => {
        const existing = storedPatterns.find((sp) => sp.habitId === p.habitId);
        return existing ? { ...p, active: existing.active } : p;
      });

      setHabitPatternsState(merged);
      setHabitStateById(storedState);

      // Best-effort persist of computed patterns (keeps Supabase in sync).
      await saveHabitPatterns(merged);
      habitsInitialized.current = true;
    };
    void init();
  }, [isLoading, transactions]);

  // Recompute patterns when transactions change (preserve active toggles).
  useEffect(() => {
    if (!habitsInitialized.current) return;
    const computed = buildHabitPatterns(transactions);
    setHabitPatternsState((prev) => {
      const merged = computed.map((p) => {
        const existing = prev.find((sp) => sp.habitId === p.habitId);
        return existing ? { ...p, active: existing.active } : p;
      });
      void saveHabitPatterns(merged);
      return merged;
    });
  }, [transactions]);

  // In-app reminders (reliable) – run on open / foreground.
  useEffect(() => {
    if (isLoading) return;
    if (!remindersEnabled) return;

    const maybeShow = async () => {
      if (habitReminder) return;
      if (!habitPatterns.length) return;
      if (isMoreMenuOpen || isExpenseModalOpen || isDebtModalOpen || isGoalModalOpen || isAddFundsModalOpen || isPayDebtModalOpen) return;

      const today = todayLocal();
      // One reminder per day across all inferred habits. Reminder state is
      // synced through Supabase, unlike the former device-only daily counter.
      if (Object.keys(habitStateById).some((habitId) => habitStateById[habitId]?.lastRemindedDate === today)) return;

      const candidate = findDueHabitReminder(habitPatterns, transactions, habitStateById);
      if (!candidate) return;

      // Mark it when shown so changing focus or reloading cannot immediately
      // show the same reminder again.
      const existing = habitStateById[candidate.habitId] ?? {
        habitId: candidate.habitId,
        lastRemindedDate: null,
        snoozedUntil: null,
        dismissCountRecent: 0,
      };
      const nextState = {
        ...habitStateById,
        [candidate.habitId]: { ...existing, lastRemindedDate: today },
      };
      setHabitStateById(nextState);
      void saveHabitReminderState(nextState);
      setHabitReminder(candidate);
    };

    const onVis = () => {
      if (document.visibilityState === 'visible') void maybeShow();
    };
    const onFocus = () => void maybeShow();

    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onFocus);
    void maybeShow();

    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onFocus);
    };
  }, [
    habitPatterns,
    habitReminder,
    habitStateById,
    isAddFundsModalOpen,
    isMoreMenuOpen,
    isDebtModalOpen,
    isExpenseModalOpen,
    isGoalModalOpen,
    isLoading,
    isPayDebtModalOpen,
    remindersEnabled,
    transactions,
  ]);

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
    setRecurringRules(await getRecurringTransactions());
    setEditingTransaction(null);
    setExpensePrefill(null);
    setIsExpenseModalOpen(false);
  };

  const handleQuickAdd = async (prefill: Partial<Pick<Transaction, 'type' | 'amount' | 'description' | 'category' | 'date'>>) => {
    if (!prefill.amount || !prefill.description || !prefill.category) return;
    let date = new Date().toISOString();
    if (prefill.date) {
      try {
        date = prefill.date.includes('T') ? prefill.date : localDateInputToIso(prefill.date);
      } catch {
        date = new Date().toISOString();
      }
    }
    const transaction: Transaction = {
      id: crypto.randomUUID(),
      type: prefill.type ?? 'expense',
      amount: prefill.amount,
      description: prefill.description,
      category: prefill.category,
      date,
      created_at: new Date().toISOString(),
    };
    setTransactions((previous) => [transaction, ...previous]);
    try {
      await saveTransaction(transaction);
      setQuickAddNotice(transaction);
      if (quickAddTimer.current !== null) window.clearTimeout(quickAddTimer.current);
      quickAddTimer.current = window.setTimeout(() => {
        setQuickAddNotice(null);
        quickAddTimer.current = null;
      }, 5000);
    } catch (error) {
      setTransactions((previous) => previous.filter((item) => item.id !== transaction.id));
      setLoadError(error instanceof Error ? error.message : 'Could not add the quick entry.');
    }
  };

  const handleUndoQuickAdd = async () => {
    const transaction = quickAddNotice;
    if (!transaction) return;
    setQuickAddNotice(null);
    if (quickAddTimer.current !== null) window.clearTimeout(quickAddTimer.current);
    quickAddTimer.current = null;
    setTransactions((previous) => previous.filter((item) => item.id !== transaction.id));
    try {
      await deleteTransaction(transaction.id);
    } catch (error) {
      setTransactions((previous) => [transaction, ...previous]);
      setLoadError(error instanceof Error ? error.message : 'Could not undo the quick entry.');
    }
  };

  const handleDeleteTransaction = (id: string) => {
    setPendingDelete({ type: 'transaction', id });
  };

  const handleSaveDebt = async (newDebtData: Omit<Debt, 'id' | 'isPaid'>, existingId?: string) => {
    if (existingId) {
      const updated: Debt = { ...newDebtData, id: existingId, isPaid: newDebtData.amount <= 0 };
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
        setDebtPaymentAmount(Math.min(debt.minimumPayment ?? debt.amount, debt.amount).toString());
        setDebtPaymentError(null);
        setIsPayDebtModalOpen(true);
     }
  };

  const handleSubmitDebtPayment = async (e: React.FormEvent) => {
     e.preventDefault();
     if (!selectedDebtId || !debtPaymentAmount) return;

     const amount = parseFloat(debtPaymentAmount);
     if (!Number.isFinite(amount) || amount <= 0) {
       setDebtPaymentError('Enter a positive payment amount.');
       return;
     }

     const debt = debts.find(d => d.id === selectedDebtId);
     if (debt) {
        if (amount > debt.amount) {
          setDebtPaymentError(`Payment cannot exceed the ¥${debt.amount.toLocaleString()} balance.`);
          return;
        }
        const principalPayment = Math.min(amount, debt.amount);
        const monthlyRate = (debt.interestRate ?? 0) / 100 / 12;
        const interestDue = monthlyRate > 0 ? Math.round(debt.amount * monthlyRate) : 0;
        const newBalance = Math.max(0, debt.amount - principalPayment);
        const isPaidOff = newBalance === 0;
        const currentDue = new Date(debt.dueDate || new Date().toISOString());
        const nextDue = addMonthsClamped(currentDue, 1, currentDue.getDate());

        const updatedDebt = { ...debt, amount: newBalance, isPaid: isPaidOff, dueDate: nextDue.toISOString() };
        setDebts(prev => prev.map(d => d.id === selectedDebtId ? updatedDebt : d));
        await saveDebt(updatedDebt);

        // Principal repays purchases or borrowed money already represented by
        // the debt balance; recording it as another expense double-counts it.
        // Interest is the only new cost created by this payment.
        if (debt.type === 'payable' && interestDue > 0) {
          const newTx: Transaction = {
             id: crypto.randomUUID(),
             amount: interestDue,
             category: Category.Debt,
             date: new Date().toISOString(),
             description: `Interest: ${debt.person}`,
             type: 'expense'
          };
          setTransactions(prev => [newTx, ...prev]);
          await saveTransaction(newTx);
        }
     }

     setIsPayDebtModalOpen(false);
     setSelectedDebtId(null);
     setDebtPaymentError(null);
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
    } else if (type === 'recurring') {
      setRecurringRules(prev => prev.filter(rule => rule.id !== id));
      await deleteRecurringTransaction(id);
    }

    setPendingDelete(null);
  };

  const handleOpenAddFunds = (id: string) => {
    setSelectedGoalId(id);
    setFundAmountToAdd('');
    setFundError(null);
    setIsAddFundsModalOpen(true);
  };

  const handleSubmitFunds = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedGoalId && fundAmountToAdd) {
      const amount = parseFloat(fundAmountToAdd);
      if (!Number.isFinite(amount) || amount <= 0) {
        setFundError('Enter a positive amount.');
        return;
      }

      const goal = goals.find(g => g.id === selectedGoalId);
      if (goal) {
        const updatedGoal = { ...goal, currentAmount: goal.currentAmount + amount };
        setGoals(prev => prev.map(g => g.id === selectedGoalId ? updatedGoal : g));
        await saveGoal(updatedGoal);
      }
      
      setIsAddFundsModalOpen(false);
      setSelectedGoalId(null);
      setFundError(null);
    }
  };

  const handleSignOut = async () => {
    if (!supabase || !session) return;
    clearLocalFinancialData(session.user.id);
    await supabase.auth.signOut();
    setIsSettingsModalOpen(false);
    setTransactions([]);
    setDebts([]);
    setGoals([]);
    setRecurringRules([]);
  };

  const handleExport = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      transactions,
      debts,
      goals,
      recurringTransactions: recurringRules,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `smartspend-backup-${todayLocal()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (file: File): Promise<string> => {
    const raw = await file.text();
    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      throw new Error('This is not a valid SmartSpend JSON backup.');
    }
    if (!payload || typeof payload !== 'object') throw new Error('Backup content is missing.');
    const backup = payload as Record<string, unknown>;
    const importedTransactions = Array.isArray(backup.transactions) ? backup.transactions as Transaction[] : [];
    const importedDebts = Array.isArray(backup.debts) ? backup.debts as Debt[] : [];
    const importedGoals = Array.isArray(backup.goals) ? backup.goals as Goal[] : [];
    const importedRecurring = Array.isArray(backup.recurringTransactions) ? backup.recurringTransactions as RecurringTransaction[] : [];
    const allRows = [...importedTransactions, ...importedDebts, ...importedGoals, ...importedRecurring];
    if (allRows.length === 0) throw new Error('No SmartSpend records were found in this backup.');
    if (allRows.some((row) => !row || typeof row !== 'object' || typeof row.id !== 'string' || !row.id)) {
      throw new Error('Some backup records are invalid or missing an ID.');
    }

    for (const transaction of importedTransactions) await saveTransaction(transaction);
    for (const debt of importedDebts) await saveDebt(debt);
    for (const goal of importedGoals) await saveGoal(goal);
    for (const recurring of importedRecurring) await saveRecurringTransaction(recurring);
    await loadData(false);
    return `Merged ${allRows.length} record${allRows.length === 1 ? '' : 's'} from the backup.`;
  };

  const handleToggleReminders = () => {
    const next = !remindersEnabled;
    setRemindersEnabled(next);
    localStorage.setItem(reminderSettingKey, String(next));
    if (!next) setHabitReminder(null);
  };

  const handleToggleHabit = (habitId: string) => {
    setHabitPatternsState((previous) => {
      const updated = previous.map((pattern) => pattern.habitId === habitId ? { ...pattern, active: !pattern.active } : pattern);
      void saveHabitPatterns(updated);
      return updated;
    });
  };

  const handleFabClick = () => {
    if (currentView === 'debts') {
      setIsDebtModalOpen(true);
    } else if (currentView === 'goals') {
      setIsGoalModalOpen(true);
    } else {
      openTransactionModal({ type: 'expense' });
    }
  };

  const selectedDebt = selectedDebtId ? debts.find((debt) => debt.id === selectedDebtId) ?? null : null;
  const paymentPrincipalPreview = Math.min(Math.max(parseFloat(debtPaymentAmount) || 0, 0), selectedDebt?.amount ?? 0);
  const paymentInterestPreview = selectedDebt
    ? Math.round(selectedDebt.amount * ((selectedDebt.interestRate ?? 0) / 100 / 12))
    : 0;

  if (authReady && supabase && !session) return <AuthScreen />;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex justify-center font-sans">
        <div className="w-full max-w-5xl px-4 sm:px-6 py-6 space-y-4 min-h-screen">
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
      className="min-h-screen max-w-5xl mx-auto shadow-2xl shadow-zinc-900 relative overflow-hidden text-zinc-200 border-x border-zinc-900 font-sans"
      style={{
        backgroundColor: '#000',
        backgroundImage:
          'radial-gradient(circle at 50% 20%, rgba(63, 63, 70, 0.35), rgba(0,0,0,0.5) 45%, #000 75%)'
      }}
    >
      {/* Header - Minimal & Translucent */}
      <header className="bg-black/70 backdrop-blur-md px-5 py-3.5 sticky top-0 z-20 border-b border-zinc-900/80 flex items-center justify-between">
        <div className="flex items-center gap-2.5 text-zinc-100">
          <div className="p-1.5 rounded-md bg-zinc-100 text-black">
             <Landmark className="w-3.5 h-3.5" strokeWidth={3} />
          </div>
          <h1 className="text-sm font-bold tracking-wide text-white">SmartSpend</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleFabClick}
            aria-label={currentView === 'debts' ? 'Add debt' : currentView === 'goals' ? 'Add goal' : 'Add transaction'}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-700 bg-zinc-100 text-black transition hover:bg-white active:scale-95"
          >
            <Plus size={18} strokeWidth={2.5} />
          </button>
          <button
            onClick={() => setIsSettingsModalOpen(true)}
            className="relative h-9 px-3 rounded-full border border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-white flex items-center gap-2 transition-colors"
            aria-label="Open sync and settings"
          >
            {syncState.isSyncing ? (
              <RefreshCw size={14} className="animate-spin" />
            ) : syncState.lastError || syncState.pendingCount > 0 ? (
              <CloudOff size={14} className="text-amber-400" />
            ) : (
              <Cloud size={14} className={supabase ? 'text-emerald-400' : 'text-zinc-500'} />
            )}
            <Settings size={13} />
            {syncState.pendingCount > 0 && (
              <span className="absolute -right-1 -top-1 min-w-4 h-4 px-1 rounded-full bg-amber-400 text-black text-[9px] font-bold flex items-center justify-center">
                {syncState.pendingCount}
              </span>
            )}
          </button>
        </div>
      </header>

      {(loadError || syncState.lastError) && (
        <div className="mx-4 mt-3 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2.5 flex items-start justify-between gap-3 relative z-10">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-amber-300">Cloud sync needs attention</p>
            <p className="text-[10px] text-amber-200/70 mt-1 line-clamp-2">{loadError ?? syncState.lastError}</p>
          </div>
          <button onClick={() => void loadData(false)} className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-amber-200 flex items-center gap-1">
            <RefreshCw size={11} /> Retry
          </button>
        </div>
      )}

      <main className="p-4 sm:p-6 min-h-[calc(100vh-140px)] relative z-10">
        <Suspense fallback={<div className="text-sm text-zinc-500">Loading...</div>}>
          {currentView === 'dashboard' && (
            <Dashboard
              transactions={transactions}
              debts={debts}
              goals={goals}
              recurringRules={recurringRules}
              onQuickAdd={(prefill) => void handleQuickAdd(prefill)}
              onOpenTransactions={() => setCurrentView('list')}
              onOpenDebts={() => setCurrentView('debts')}
              onPayDebt={handleOpenPayDebt}
              onOpenGoals={() => setCurrentView('goals')}
              onAddGoalFunds={handleOpenAddFunds}
            />
          )}
        {currentView === 'list' && <ExpenseList expenses={transactions} onEdit={(tx) => { setExpensePrefill(null); setEditingTransaction(tx); setIsExpenseModalOpen(true); }} />}
        {currentView === 'debts' && <DebtList debts={debts} onToggleStatus={handleOpenPayDebt} onEdit={(d) => { setEditingDebt(d); setIsDebtModalOpen(true); }} />}
        {currentView === 'goals' && <GoalList goals={goals} onAddFundsClick={handleOpenAddFunds} onEdit={(g) => { setEditingGoal(g); setIsGoalModalOpen(true); }} />}
        </Suspense>
      </main>

      {/* Bottom Nav - Black with White Active State */}
      <nav className="fixed bottom-0 left-1/2 z-20 grid w-full max-w-5xl -translate-x-1/2 grid-cols-4 border-x border-t border-zinc-900 bg-black/95 px-1 py-1 pb-safe backdrop-blur-lg">
        <button onClick={() => setCurrentView('dashboard')} className={`flex flex-col items-center justify-center p-2 rounded-lg transition-all active:bg-zinc-900 ${currentView === 'dashboard' ? 'text-white' : 'text-zinc-600'}`}>
          <LayoutDashboard size={20} strokeWidth={currentView === 'dashboard' ? 2.5 : 2} />
          <span className="text-[10px] mt-1 font-medium tracking-wide">Home</span>
        </button>
        <button onClick={() => setCurrentView('list')} className={`flex flex-col items-center justify-center p-2 rounded-lg transition-all active:bg-zinc-900 ${currentView === 'list' ? 'text-white' : 'text-zinc-600'}`}>
          <ListIcon size={20} strokeWidth={currentView === 'list' ? 2.5 : 2} />
          <span className="text-[10px] mt-1 font-medium tracking-wide">Transactions</span>
        </button>
        <button onClick={() => setCurrentView('debts')} className={`flex flex-col items-center justify-center p-2 rounded-lg transition-all active:bg-zinc-900 ${currentView === 'debts' ? 'text-white' : 'text-zinc-600'}`}>
          <ArrowRightLeft size={20} strokeWidth={currentView === 'debts' ? 2.5 : 2} />
          <span className="text-[10px] mt-1 font-medium tracking-wide">Debts</span>
        </button>
        <button onClick={() => setIsMoreMenuOpen(true)} className={`flex flex-col items-center justify-center p-2 rounded-lg transition-all active:bg-zinc-900 ${currentView === 'goals' ? 'text-white' : 'text-zinc-600'}`}>
          <MoreHorizontal size={20} strokeWidth={currentView === 'goals' ? 2.5 : 2} />
          <span className="text-[10px] mt-1 font-medium tracking-wide">More</span>
        </button>
      </nav>

      {quickAddNotice && (
        <div aria-live="polite" className="fixed bottom-24 left-1/2 z-40 flex w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 items-center justify-between gap-3 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 shadow-2xl shadow-black/70">
          <p className="min-w-0 truncate text-xs text-zinc-300">Added <strong className="text-white">{quickAddNotice.description} · ¥{quickAddNotice.amount.toLocaleString()}</strong></p>
          <button type="button" onClick={() => void handleUndoQuickAdd()} className="min-h-9 shrink-0 rounded-lg px-2 text-xs font-bold uppercase tracking-wide text-emerald-300 hover:bg-emerald-400/10">Undo</button>
        </div>
      )}

      <Modal isOpen={isMoreMenuOpen} onClose={() => setIsMoreMenuOpen(false)} title="More">
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => { setIsMoreMenuOpen(false); setCurrentView('goals'); }}
            className="flex w-full items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-left transition hover:bg-zinc-800"
          >
            <div className="rounded-lg bg-zinc-800 p-2 text-zinc-300"><Target size={18} /></div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-zinc-200">Goals</p>
              <p className="text-xs text-zinc-500">Optional savings targets when you are ready</p>
            </div>
            <ChevronRight size={17} className="text-zinc-600" />
          </button>
          <button
            type="button"
            onClick={() => { setIsMoreMenuOpen(false); setIsSettingsModalOpen(true); }}
            className="flex w-full items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-left transition hover:bg-zinc-800"
          >
            <div className="rounded-lg bg-zinc-800 p-2 text-zinc-300"><Settings size={18} /></div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-zinc-200">Sync & settings</p>
              <p className="text-xs text-zinc-500">Cloud status, recurring entries and account</p>
            </div>
            <ChevronRight size={17} className="text-zinc-600" />
          </button>
          <button
            type="button"
            onClick={() => { setIsMoreMenuOpen(false); handleExport(); }}
            className="flex w-full items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-left transition hover:bg-zinc-800"
          >
            <div className="rounded-lg bg-zinc-800 p-2 text-zinc-300"><Download size={18} /></div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-zinc-200">Export backup</p>
              <p className="text-xs text-zinc-500">Download a private JSON copy of your data</p>
            </div>
          </button>
        </div>
      </Modal>

      <Modal isOpen={isExpenseModalOpen} onClose={closeTransactionModal} title={editingTransaction ? `Edit ${editingTransaction.type}` : `Add ${expensePrefill?.type ?? 'expense'}`}>
        <ExpenseForm
          transaction={editingTransaction ?? undefined}
          prefill={editingTransaction ? undefined : expensePrefill ?? undefined}
          existingTransactions={transactions}
          onSave={handleSaveTransaction}
          onCancel={closeTransactionModal}
          onDelete={editingTransaction ? () => {
            const id = editingTransaction.id;
            closeTransactionModal();
            handleDeleteTransaction(id);
          } : undefined}
        />
      </Modal>
      <Modal isOpen={isDebtModalOpen} onClose={() => { setIsDebtModalOpen(false); setEditingDebt(null); }} title={editingDebt ? "Edit Debt" : "Add Debt"}>
        <DebtForm
          debt={editingDebt ?? undefined}
          onSave={handleSaveDebt}
          onCancel={() => { setIsDebtModalOpen(false); setEditingDebt(null); }}
          onDelete={editingDebt ? () => {
            const id = editingDebt.id;
            setIsDebtModalOpen(false);
            setEditingDebt(null);
            handleDeleteDebt(id);
          } : undefined}
        />
      </Modal>
      <Modal isOpen={isGoalModalOpen} onClose={() => { setIsGoalModalOpen(false); setEditingGoal(null); }} title={editingGoal ? "Edit Goal" : "New Goal"}>
        <GoalForm
          goal={editingGoal ?? undefined}
          onSave={handleSaveGoal}
          onCancel={() => { setIsGoalModalOpen(false); setEditingGoal(null); }}
          onDelete={editingGoal ? () => {
            const id = editingGoal.id;
            setIsGoalModalOpen(false);
            setEditingGoal(null);
            handleDeleteGoal(id);
          } : undefined}
        />
      </Modal>
      
      <Modal isOpen={isAddFundsModalOpen} onClose={() => { setIsAddFundsModalOpen(false); setFundError(null); }} title="Add Funds">
        <form onSubmit={handleSubmitFunds} className="space-y-4">
          <div>
            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Amount (¥)</label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-3.5 text-zinc-400" size={18} />
              <input type="number" min="1" step="1" required autoFocus value={fundAmountToAdd} onChange={(e) => { setFundAmountToAdd(e.target.value); setFundError(null); }} className="w-full pl-10 h-12 bg-zinc-900 border border-zinc-800 rounded-lg text-white text-lg font-bold focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600 outline-none" />
            </div>
            {fundError && <p className="text-[10px] text-red-400 mt-1.5">{fundError}</p>}
          </div>
          <button type="submit" className="w-full h-12 bg-white hover:bg-zinc-200 text-black font-bold rounded-lg text-xs uppercase tracking-wider">Confirm</button>
        </form>
      </Modal>

      <Modal isOpen={isPayDebtModalOpen} onClose={() => { setIsPayDebtModalOpen(false); setDebtPaymentError(null); }} title="Pay Debt">
        <form onSubmit={handleSubmitDebtPayment} className="space-y-4">
          <div>
            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Principal amount (¥)</label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-3.5 text-zinc-400" size={18} />
              <input type="number" min="1" max={selectedDebt?.amount} step="1" required autoFocus value={debtPaymentAmount} onChange={(e) => { setDebtPaymentAmount(e.target.value); setDebtPaymentError(null); }} className="w-full pl-10 h-12 bg-zinc-900 border border-zinc-800 rounded-lg text-white text-lg font-bold focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600 outline-none" />
            </div>
            {debtPaymentError && <p className="text-[10px] text-red-400 mt-1.5">{debtPaymentError}</p>}
          </div>
          {selectedDebt && (
            <div className="rounded-lg bg-zinc-950 border border-zinc-800 p-3 space-y-1.5 text-[11px]">
              <div className="flex justify-between text-zinc-500"><span>Outstanding balance</span><span>¥{selectedDebt.amount.toLocaleString()}</span></div>
              <div className="flex justify-between text-zinc-500"><span>Estimated monthly interest</span><span>¥{paymentInterestPreview.toLocaleString()}</span></div>
              <div className="flex justify-between text-zinc-500"><span>Total cash payment</span><span>¥{(paymentPrincipalPreview + paymentInterestPreview).toLocaleString()}</span></div>
              <div className="flex justify-between text-zinc-200 font-bold pt-1.5 border-t border-zinc-800"><span>New expense recorded</span><span>¥{paymentInterestPreview.toLocaleString()}</span></div>
              <p className="pt-1 text-[10px] text-zinc-600">Principal reduces the balance only, preventing purchases from being counted twice.</p>
            </div>
          )}
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
            {pendingDelete?.type === 'recurring' && 'Stop this recurring transaction? Existing entries will remain.'}
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

      <Modal isOpen={isSettingsModalOpen} onClose={() => setIsSettingsModalOpen(false)} title="Sync & Settings">
        <SettingsPanel
          email={session?.user.email ?? null}
          sync={syncState}
          recurringRules={recurringRules}
          habitPatterns={habitPatterns}
          remindersEnabled={remindersEnabled}
          onRetrySync={() => void loadData(false)}
          onDeleteRecurring={(id) => {
            setIsSettingsModalOpen(false);
            setPendingDelete({ type: 'recurring', id });
          }}
          onExport={handleExport}
          onImport={handleImport}
          onToggleReminders={handleToggleReminders}
          onToggleHabit={handleToggleHabit}
          onSignOut={() => void handleSignOut()}
        />
      </Modal>

      <style>{`
        .pb-safe { padding-bottom: env(safe-area-inset-bottom, 20px); }
        @keyframes slide-up { from { transform: translateY(10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .animate-slide-up { animation: slide-up 0.2s ease-out forwards; }
        .animate-fade-in { animation: fadeIn 0.2s ease-in; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>

      <Modal
        isOpen={!!habitReminder}
        onClose={() => {
          if (!habitReminder) return;
          const today = todayLocal();
          const s = habitStateById[habitReminder.habitId] ?? {
            habitId: habitReminder.habitId,
            lastRemindedDate: null,
            snoozedUntil: null,
            dismissCountRecent: 0,
          };
          const next = { ...habitStateById, [habitReminder.habitId]: { ...s, lastRemindedDate: today } };
          setHabitStateById(next);
          void saveHabitReminderState(next);
          setHabitReminder(null);
        }}
        title="Reminder"
      >
        {habitReminder && (
          <div className="space-y-4">
            <p className="text-sm text-zinc-300">{habitReminder.message}</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  const today = todayLocal();
                  const s = habitStateById[habitReminder.habitId] ?? {
                    habitId: habitReminder.habitId,
                    lastRemindedDate: null,
                    snoozedUntil: null,
                    dismissCountRecent: 0,
                  };
                  const next = { ...habitStateById, [habitReminder.habitId]: { ...s, lastRemindedDate: today, dismissCountRecent: 0 } };
                  setHabitStateById(next);
                  void saveHabitReminderState(next);

                  openTransactionModal({
                    type: 'expense',
                    category: habitReminder.category,
                    amount: habitReminder.amount,
                    description: habitReminder.description,
                    date: today,
                  });
                  setHabitReminder(null);
                }}
                className="flex-1 h-11 bg-white hover:bg-zinc-200 text-black font-bold text-xs uppercase tracking-wide rounded-lg transition-colors"
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => {
                  const today = todayLocal();
                  const s = habitStateById[habitReminder.habitId] ?? {
                    habitId: habitReminder.habitId,
                    lastRemindedDate: null,
                    snoozedUntil: null,
                    dismissCountRecent: 0,
                  };
                  const snoozeDays = habitReminder.intervalType === 'monthly'
                    ? 27
                    : habitReminder.intervalType === 'weekly'
                      ? 6
                      : 0;
                  const next = {
                    ...habitStateById,
                    [habitReminder.habitId]: {
                      ...s,
                      lastRemindedDate: today,
                      snoozedUntil: addDaysLocal(today, snoozeDays),
                      dismissCountRecent: 0,
                    },
                  };
                  setHabitStateById(next);
                  void saveHabitReminderState(next);
                  setHabitReminder(null);
                }}
                className="flex-1 h-11 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 font-bold text-xs uppercase tracking-wide rounded-lg transition-colors"
              >
                Not today
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                setHabitPatternsState((prev) => {
                  const updated = prev.map((p) => (p.habitId === habitReminder.habitId ? { ...p, active: false } : p));
                  void saveHabitPatterns(updated);
                  return updated;
                });
                setHabitReminder(null);
              }}
              className="w-full h-11 bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 text-zinc-500 font-bold text-xs uppercase tracking-wide rounded-lg transition-colors"
            >
              Stop reminding
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default App;
