import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  ArrowLeftRight, ChevronRight, Cloud, CloudOff, Download, HandCoins, History, Home, MoreHorizontal, Plus, RefreshCw,
  Settings, SlidersHorizontal, Target,
} from 'lucide-react';
import {
  Bill, BillPayment, Card, CardBreakdown, CardStatement, CardUsage, Category, Debt, Goal, PayCycleRecord, RecurringTransaction, Transaction, ViewState,
} from './types';
import {
  PlannerKind, PlannerRecord, SyncSnapshot,
  clearLocalFinancialData, deleteDebt, deleteGoal, deletePlannerRecord, deleteRecurringTransaction, deleteTransaction,
  getDebts, getGoals, getPlannerRecords, getRecurringTransactions, getSyncSnapshot, getTransactions,
  processRecurringTransactions, saveDebt, saveGoal, savePlannerRecord, saveRecurringTransaction, saveTransaction,
  subscribeToSyncState, syncPendingChanges,
} from './services/storageService';
import {
  CardBillInput, SETTINGS_RECORD_ID, buildCardBill, installmentDueOnBill, isPlannerConfigured, markCardBillPaid, toPlannerData, unmarkCardBillPaid,
} from './services/planner';
import {
  Obligation, PayCycle, billPaymentId, buildCyclePlan, cardDueDate, cardUsageId, cycleForDate, cycleRecordId, getCycle, monthlyInterest, statementId,
  suggestedCarryover,
} from './utils/payCycle';
import { monthsBetween, shiftMonthKey, todayLocalDate } from './utils/jpCalendar';
import { BALANCE_ADJUSTMENT_NOTE, withCurrentCategory } from './utils/transactions';
import { addMonthsClamped } from './utils/date';
import { formatYen } from './utils/format';
import { APP_NAME } from './constants';
import { supabase } from './services/supabaseClient';
import { AuthScreen } from './components/AuthScreen';
import { CycleHome } from './components/CycleHome';
import { CashEntry } from './components/CashEntry';
import { PaydayCheckin, CheckinResult } from './components/PaydayCheckin';
import { ObligationEditor } from './components/ObligationEditor';
import { PlanSetup, PlanSetupResult } from './components/PlanSetup';
import { ExpenseForm } from './components/ExpenseForm';
import { DebtForm } from './components/DebtForm';
import { GoalForm } from './components/GoalForm';
import { SettingsPanel } from './components/SettingsPanel';
import { BalanceCheck } from './components/BalanceCheck';
import type { ImportedBill } from './components/CardBreakdowns';
import { Modal } from './components/ui/Modal';
import { AmountInput } from './components/ui/AmountInput';
import { CreditCardIcon } from './components/ui/CreditCardIcon';

const ExpenseList = React.lazy(() => import('./components/ExpenseList').then((m) => ({ default: m.ExpenseList })));
const DebtList = React.lazy(() => import('./components/DebtList').then((m) => ({ default: m.DebtList })));
const GoalList = React.lazy(() => import('./components/GoalList').then((m) => ({ default: m.GoalList })));
const CardsView = React.lazy(() => import('./components/CardsView').then((m) => ({ default: m.CardsView })));
const CycleHistory = React.lazy(() => import('./components/CycleHistory').then((m) => ({ default: m.CycleHistory })));

type TransactionPrefill = Partial<Pick<Transaction, 'type' | 'amount' | 'description' | 'category' | 'date'>>;
type PendingDelete = { type: 'transaction' | 'debt' | 'goal' | 'recurring'; id: string };

const errorText = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);

const App: React.FC = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [debts, setDebtsState] = useState<Debt[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [recurringRules, setRecurringRules] = useState<RecurringTransaction[]>([]);
  const [plannerRecords, setPlannerRecordsState] = useState<PlannerRecord[]>([]);
  // Planner actions write several linked records in sequence, so they read the
  // latest values from refs rather than from a render's closure.
  const debtsRef = useRef<Debt[]>([]);
  const recordsRef = useRef<PlannerRecord[]>([]);

  const [currentView, setCurrentView] = useState<ViewState>('home');
  const [cycleOffset, setCycleOffset] = useState(0);
  const [today, setToday] = useState(todayLocalDate());
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(!supabase);
  const [session, setSession] = useState<Session | null>(null);
  const [syncState, setSyncState] = useState<SyncSnapshot>(getSyncSnapshot());
  const dataLoadInFlight = useRef<Promise<void> | null>(null);

  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [isCashOpen, setIsCashOpen] = useState(false);
  const [isSetupOpen, setIsSetupOpen] = useState(false);
  const [checkinMode, setCheckinMode] = useState<'payday' | 'today' | null>(null);
  const [editingObligation, setEditingObligation] = useState<Obligation | null>(null);
  const [isBalanceOpen, setIsBalanceOpen] = useState(false);
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
  const [transactionPrefill, setTransactionPrefill] = useState<TransactionPrefill | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [isDebtModalOpen, setIsDebtModalOpen] = useState(false);
  const [editingDebt, setEditingDebt] = useState<Debt | null>(null);
  const [isGoalModalOpen, setIsGoalModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [fundAmountToAdd, setFundAmountToAdd] = useState('');
  const [fundError, setFundError] = useState<string | null>(null);
  const [selectedDebtId, setSelectedDebtId] = useState<string | null>(null);
  const [debtPaymentAmount, setDebtPaymentAmount] = useState('');
  const [debtPaymentError, setDebtPaymentError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [notice, setNotice] = useState<Transaction | null>(null);
  const noticeTimer = useRef<number | null>(null);

  const replaceDebts = (next: Debt[]) => {
    debtsRef.current = next;
    setDebtsState(next);
  };
  const replaceRecords = (next: PlannerRecord[]) => {
    recordsRef.current = next;
    setPlannerRecordsState(next);
  };

  // ---------------------------------------------------------------- Loading

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
        const records = await getPlannerRecords();
        // Once transfer bills are set up, old recurring rules would count them twice.
        if (!isPlannerConfigured(toPlannerData(records))) await processRecurringTransactions();
        const [txs, dbs, gls, rules] = await Promise.all([getTransactions(), getDebts(), getGoals(), getRecurringTransactions()]);
        replaceRecords(records);
        setTransactions(txs.map(withCurrentCategory));
        replaceDebts(dbs);
        setGoals(gls);
        setRecurringRules(rules);
      } catch (error) {
        setLoadError(errorText(error, 'Could not load your data'));
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
    void loadData(true);
  }, [loadData]);

  useEffect(() => subscribeToSyncState(setSyncState), []);

  useEffect(() => {
    const refresh = () => {
      setToday(todayLocalDate());
      void loadData(false);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    window.addEventListener('online', refresh);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', refresh);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [loadData]);

  useEffect(() => () => {
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
  }, []);

  // The date can change while the app stays open, so check once a minute.
  useEffect(() => {
    const timer = window.setInterval(() => setToday(todayLocalDate()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  // ---------------------------------------------------------------- Planner

  const plannerData = useMemo(() => toPlannerData(plannerRecords), [plannerRecords]);
  const isConfigured = isPlannerConfigured(plannerData);
  const { settings } = plannerData;
  const currentCycle = useMemo(() => cycleForDate(today, settings), [today, settings]);
  const viewedCycle = useMemo(() => getCycle(shiftMonthKey(currentCycle.key, cycleOffset), settings), [currentCycle.key, cycleOffset, settings]);
  const previousCycle = useMemo(() => getCycle(shiftMonthKey(currentCycle.key, -1), settings), [currentCycle.key, settings]);
  const planInput = useMemo(() => ({ data: plannerData, debts, transactions, today }), [plannerData, debts, transactions, today]);
  const currentPlan = useMemo(() => buildCyclePlan(currentCycle, planInput), [currentCycle, planInput]);
  const viewedPlan = useMemo(() => buildCyclePlan(viewedCycle, planInput), [viewedCycle, planInput]);
  const nextPlan = useMemo(() => buildCyclePlan(getCycle(shiftMonthKey(currentCycle.key, 1), settings), planInput), [currentCycle.key, settings, planInput]);
  const historyPlans = useMemo(() => {
    const keys = new Set(plannerData.cycles.map((record) => record.key).filter((key) => key <= currentCycle.key));
    if (currentPlan.record) keys.add(currentCycle.key);
    return [...keys].sort().reverse().map((key) => buildCyclePlan(getCycle(key, settings), planInput));
  }, [plannerData.cycles, currentCycle.key, currentPlan.record, settings, planInput]);
  const latestSalary = [...plannerData.cycles].filter((record) => record.salary > 0).sort((a, b) => b.key.localeCompare(a.key))[0]?.salary ?? null;
  const cardNames = useMemo(() => Object.fromEntries(plannerData.cards.map((card) => [card.id, card.name])), [plannerData.cards]);
  // Activity counts a cycle from the same day Home does: its mid-cycle start, if any.
  const trackedRange = (cycle: PayCycle) => {
    const from = plannerData.cycles.find((record) => record.key === cycle.key)?.trackingFrom;
    return { start: from && from > cycle.start ? from : cycle.start, end: cycle.end };
  };

  const putPlanner = async (kind: PlannerKind, id: string, data: unknown) => {
    const record: PlannerRecord = { id, kind, data, updated_at: new Date().toISOString() };
    replaceRecords([record, ...recordsRef.current.filter((item) => item.id !== id)]);
    await savePlannerRecord(kind, id, data);
  };

  const dropPlanner = async (id: string) => {
    replaceRecords(recordsRef.current.filter((item) => item.id !== id));
    await deletePlannerRecord(id);
  };

  const putDebt = async (debt: Debt) => {
    replaceDebts([debt, ...debtsRef.current.filter((item) => item.id !== debt.id)]);
    await saveDebt(debt);
  };

  const dropDebt = async (id: string) => {
    replaceDebts(debtsRef.current.filter((item) => item.id !== id));
    await deleteDebt(id);
  };

  /** Sets a card bill's paid state, moving its split installments along with it. */
  const setCardBillPaid = async (statement: CardStatement, paid: boolean) => {
    let next = statement;
    if (next.paidAt) {
      const reverted = unmarkCardBillPaid(next, debtsRef.current);
      for (const debt of reverted.updatedDebts) await putDebt(debt);
      next = reverted.statement;
    }
    const card = toPlannerData(recordsRef.current).cards.find((item) => item.id === statement.cardId);
    if (paid && card) {
      const applied = markCardBillPaid(next, debtsRef.current, cardDueDate(card, statement.usageMonth));
      for (const debt of applied.updatedDebts) await putDebt(debt);
      next = applied.statement;
    }
    await putPlanner('statement', next.id, next);
  };

  const saveCardBill = async (input: CardBillInput, paid?: boolean) => {
    const existing = toPlannerData(recordsRef.current).statements.find((item) => item.id === statementId(input.card.id, input.usageMonth));
    const { statement, splitDebt, removedSplitDebtId } = buildCardBill(input, existing, debtsRef.current);
    if (splitDebt) await putDebt(splitDebt);
    if (removedSplitDebtId) await dropDebt(removedSplitDebtId);
    await setCardBillPaid(statement, paid ?? Boolean(existing?.paidAt));
  };

  const saveBillPayment = async (bill: Bill, dueDate: string, patch: Partial<BillPayment>) => {
    const id = billPaymentId(bill.id, dueDate);
    const existing = toPlannerData(recordsRef.current).billPayments.find((item) => item.id === id);
    const next: BillPayment = { id, billId: bill.id, dueDate, amount: bill.amount, confirmed: false, ...existing, ...patch };
    await putPlanner('bill_payment', id, next);
  };

  /** Moves check-in savings into a goal, undoing what an earlier save of the same check-in added. */
  const moveSavingsToGoal = async (previous?: PayCycleRecord['savingsApplied'], next?: PayCycleRecord['savingsApplied']) => {
    if (previous?.goalId === next?.goalId && previous?.amount === next?.amount) return;
    const changes = new Map<string, number>();
    if (previous) changes.set(previous.goalId, (changes.get(previous.goalId) ?? 0) - previous.amount);
    if (next) changes.set(next.goalId, (changes.get(next.goalId) ?? 0) + next.amount);
    for (const [goalId, delta] of changes) {
      const goal = goals.find((item) => item.id === goalId);
      if (!goal || delta === 0) continue;
      const updated = { ...goal, currentAmount: Math.max(0, goal.currentAmount + delta) };
      setGoals((list) => list.map((item) => (item.id === goalId ? updated : item)));
      await saveGoal(updated);
    }
  };

  const handleCheckin = async (result: CheckinResult) => {
    const id = cycleRecordId(result.cycleKey);
    const previous = plannerData.cycles.find((item) => item.id === id);
    const savingsApplied = result.savingsGoalId && result.savings > 0 ? { goalId: result.savingsGoalId, amount: result.savings } : undefined;
    await moveSavingsToGoal(previous?.savingsApplied, savingsApplied);
    const record: PayCycleRecord = {
      id,
      key: result.cycleKey,
      salary: result.salary,
      carryover: result.carryover,
      savings: result.savings,
      trackingFrom: result.trackingFrom,
      savingsGoalId: result.savingsGoalId,
      savingsApplied,
      checkedInAt: new Date().toISOString(),
    };
    await putPlanner('cycle', id, record);

    // A late check-in covers bills whose due date already passed: they were paid.
    const checkinDay = todayLocalDate();
    for (const input of result.cardBills) {
      await saveCardBill(input, cardDueDate(input.card, input.usageMonth) < checkinDay ? true : undefined);
    }
    for (const { bill, dueDate, amount } of result.billAmounts) {
      const existing = plannerData.billPayments.find((item) => item.id === billPaymentId(bill.id, dueDate));
      const changed = amount !== (existing?.amount ?? bill.amount);
      const alreadyDue = dueDate < checkinDay && !existing?.paidAt;
      if (changed || alreadyDue) {
        await saveBillPayment(bill, dueDate, {
          amount,
          ...(changed ? { confirmed: true } : {}),
          ...(alreadyDue ? { paidAt: new Date().toISOString() } : {}),
        });
      }
    }
    if (result.savings !== settings.defaultSavings || result.savingsGoalId !== settings.defaultSavingsGoalId) {
      await putPlanner('settings', SETTINGS_RECORD_ID, { ...settings, defaultSavings: result.savings, defaultSavingsGoalId: result.savingsGoalId });
    }
    setCheckinMode(null);
  };

  const handleSaveUsage = async (card: Card, usageMonth: string, amount: number) => {
    const id = cardUsageId(card.id, usageMonth);
    const usage: CardUsage = { id, cardId: card.id, usageMonth, amount, asOf: todayLocalDate() };
    await putPlanner('card_usage', id, usage);
  };

  /** Imported history explains card bills; its charged total can stand in for the card's month total. */
  const handleImportBreakdowns = async (breakdowns: CardBreakdown[], usages: CardUsage[], bills: ImportedBill[]) => {
    for (const breakdown of breakdowns) await putPlanner('card_breakdown', breakdown.id, breakdown);
    for (const usage of usages) await putPlanner('card_usage', usage.id, usage);
    // A statement's bill is saved as if entered at check-in.
    for (const bill of bills) {
      const installment = installmentDueOnBill(bill.card, bill.usageMonth, debtsRef.current, toPlannerData(recordsRef.current).statements);
      await saveCardBill({ card: bill.card, usageMonth: bill.usageMonth, amount: bill.amount, installment, split: null });
    }
  };

  /** Removing an import also removes a month total it set, unless that total was changed since. */
  const handleDeleteBreakdown = async (breakdown: CardBreakdown) => {
    await dropPlanner(breakdown.id);
    if (!breakdown.setMonthTotal) return;
    const usageId = cardUsageId(breakdown.cardId, breakdown.usageMonth);
    const usage = toPlannerData(recordsRef.current).cardUsage.find((item) => item.id === usageId);
    if (usage && usage.amount === breakdown.charged) await dropPlanner(usageId);
  };

  /** Records the gap between the real balance and the plan, so the numbers match the bank again. */
  const handleBalanceAdjust = async (difference: number, savingsInAccount: boolean) => {
    if (savingsInAccount !== (settings.savingsInAccount ?? true)) {
      await putPlanner('settings', SETTINGS_RECORD_ID, { ...settings, savingsInAccount });
    }
    const transaction: Transaction = {
      id: crypto.randomUUID(),
      amount: Math.abs(difference),
      type: difference < 0 ? 'expense' : 'income',
      category: Category.Other,
      description: BALANCE_ADJUSTMENT_NOTE,
      date: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };
    setTransactions((previous) => [transaction, ...previous]);
    setIsBalanceOpen(false);
    await saveTransaction(transaction);
  };

  const handleSaveSetup = async (result: PlanSetupResult) => {
    await putPlanner('settings', SETTINGS_RECORD_ID, result.settings);
    for (const card of result.cards) await putPlanner('card', card.id, card);
    for (const bill of result.bills) await putPlanner('bill', bill.id, bill);
    setIsSetupOpen(false);
  };

  const handleTogglePaid = async (obligation: Obligation) => {
    try {
      if (obligation.kind === 'debt') {
        handleOpenPayDebt(obligation.refId);
      } else if (obligation.kind === 'card') {
        // The real amount is needed before a bill can be marked paid.
        if (!obligation.statement) setEditingObligation(obligation);
        else await setCardBillPaid(obligation.statement, !obligation.paid);
      } else {
        const bill = plannerData.bills.find((item) => item.id === obligation.refId);
        if (!bill) return;
        if (obligation.needsAmount) setEditingObligation(obligation);
        else await saveBillPayment(bill, obligation.dueDate, { amount: obligation.amount, paidAt: obligation.paid ? undefined : new Date().toISOString() });
      }
    } catch (error) {
      setLoadError(errorText(error, 'Could not update this bill.'));
    }
  };

  // ------------------------------------------------------------ Transactions

  const showNotice = (transaction: Transaction) => {
    setNotice(transaction);
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => {
      setNotice(null);
      noticeTimer.current = null;
    }, 5000);
  };

  const handleSaveCash = async (data: Omit<Transaction, 'id'>) => {
    const transaction: Transaction = { ...data, id: crypto.randomUUID(), created_at: new Date().toISOString() };
    setTransactions((previous) => [transaction, ...previous]);
    setIsCashOpen(false);
    showNotice(transaction);
    try {
      await saveTransaction(transaction);
    } catch (error) {
      setTransactions((previous) => previous.filter((item) => item.id !== transaction.id));
      setLoadError(errorText(error, 'Could not save the expense.'));
    }
  };

  const handleUndoNotice = async () => {
    const transaction = notice;
    if (!transaction) return;
    setNotice(null);
    setTransactions((previous) => previous.filter((item) => item.id !== transaction.id));
    try {
      await deleteTransaction(transaction.id);
    } catch (error) {
      setTransactions((previous) => [transaction, ...previous]);
      setLoadError(errorText(error, 'Could not undo.'));
    }
  };

  const openTransactionForm = (prefill: TransactionPrefill | null, transaction: Transaction | null = null) => {
    setTransactionPrefill(prefill);
    setEditingTransaction(transaction);
    setIsTransactionModalOpen(true);
  };

  const closeTransactionForm = () => {
    setIsTransactionModalOpen(false);
    setEditingTransaction(null);
    setTransactionPrefill(null);
  };

  const handleSaveTransaction = async (data: Omit<Transaction, 'id'>, existingId?: string) => {
    const transaction: Transaction = existingId
      ? { ...data, id: existingId, created_at: editingTransaction?.created_at ?? new Date().toISOString() }
      : { ...data, id: crypto.randomUUID(), created_at: new Date().toISOString() };
    setTransactions((previous) => [transaction, ...previous.filter((item) => item.id !== transaction.id)]);
    closeTransactionForm();
    await saveTransaction(transaction);
  };

  useEffect(() => {
    if (isLoading) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('action') !== 'cash') return;
    setIsCashOpen(true);
    window.history.replaceState(null, '', window.location.pathname);
  }, [isLoading]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (!event.altKey || event.ctrlKey || event.metaKey) return;
      if ((event.target as HTMLElement | null)?.matches('input, textarea, select, [contenteditable="true"]')) return;
      const key = event.key.toLocaleLowerCase();
      if (key === 'e') {
        event.preventDefault();
        setIsCashOpen(true);
      } else if (key === 'i') {
        event.preventDefault();
        openTransactionForm({ type: 'income' });
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

  // ------------------------------------------------------------ Debts, goals

  const handleSaveDebt = async (data: Omit<Debt, 'id' | 'isPaid'>, existingId?: string) => {
    const existing = existingId ? debts.find((debt) => debt.id === existingId) : undefined;
    await putDebt({ ...existing, ...data, id: existingId ?? crypto.randomUUID(), isPaid: data.amount <= 0 });
    setEditingDebt(null);
    setIsDebtModalOpen(false);
  };

  const handleOpenPayDebt = (id: string) => {
    const debt = debts.find((item) => item.id === id);
    if (!debt) return;
    setSelectedDebtId(id);
    setDebtPaymentAmount(String(Math.min(debt.minimumPayment ?? debt.amount, debt.amount)));
    setDebtPaymentError(null);
    setEditingObligation(null);
  };

  const selectedDebt = selectedDebtId ? debts.find((debt) => debt.id === selectedDebtId) ?? null : null;
  const paymentPrincipal = Math.min(Math.max(Number(debtPaymentAmount) || 0, 0), selectedDebt?.amount ?? 0);
  const paymentInterest = selectedDebt ? monthlyInterest(selectedDebt) : 0;

  const handleSubmitDebtPayment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedDebt) return;
    const principal = Number(debtPaymentAmount);
    if (!Number.isFinite(principal) || principal <= 0) {
      setDebtPaymentError('Enter a positive amount.');
      return;
    }
    if (principal > selectedDebt.amount) {
      setDebtPaymentError(`That's more than the ${formatYen(selectedDebt.amount)} balance.`);
      return;
    }
    const balance = selectedDebt.amount - principal;
    const due = new Date(selectedDebt.dueDate || new Date().toISOString());
    await putDebt({ ...selectedDebt, amount: balance, isPaid: balance === 0, dueDate: addMonthsClamped(due, 1, due.getDate()).toISOString() });
    // The whole payment leaves the account, so it counts against this cycle.
    const transaction: Transaction = {
      id: crypto.randomUUID(),
      amount: principal + paymentInterest,
      category: Category.Debt,
      date: new Date().toISOString(),
      created_at: new Date().toISOString(),
      description: `Debt payment: ${selectedDebt.person} (interest ¥${paymentInterest.toLocaleString('ja-JP')})`,
      type: 'expense',
    };
    setTransactions((previous) => [transaction, ...previous]);
    await saveTransaction(transaction);
    setSelectedDebtId(null);
  };

  const handleSaveGoal = async (data: Omit<Goal, 'id'>, existingId?: string) => {
    const goal: Goal = { ...data, id: existingId ?? crypto.randomUUID() };
    setGoals((previous) => [goal, ...previous.filter((item) => item.id !== goal.id)]);
    await saveGoal(goal);
    setEditingGoal(null);
    setIsGoalModalOpen(false);
  };

  const handleSubmitFunds = async (event: React.FormEvent) => {
    event.preventDefault();
    const amount = Number(fundAmountToAdd);
    if (!Number.isFinite(amount) || amount <= 0) {
      setFundError('Enter a positive amount.');
      return;
    }
    const goal = goals.find((item) => item.id === selectedGoalId);
    if (goal) {
      const updated = { ...goal, currentAmount: goal.currentAmount + amount };
      setGoals((previous) => previous.map((item) => (item.id === goal.id ? updated : item)));
      await saveGoal(updated);
    }
    setSelectedGoalId(null);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const { type, id } = pendingDelete;
    setPendingDelete(null);
    if (type === 'transaction') {
      setTransactions((previous) => previous.filter((item) => item.id !== id));
      await deleteTransaction(id);
    } else if (type === 'debt') {
      await dropDebt(id);
    } else if (type === 'goal') {
      setGoals((previous) => previous.filter((item) => item.id !== id));
      await deleteGoal(id);
    } else {
      setRecurringRules((previous) => previous.filter((rule) => rule.id !== id));
      await deleteRecurringTransaction(id);
    }
  };

  // ------------------------------------------------------- Account, backup

  const handleSignOut = async () => {
    if (!supabase || !session) return;
    clearLocalFinancialData(session.user.id);
    await supabase.auth.signOut();
    setIsSettingsModalOpen(false);
    setTransactions([]);
    replaceDebts([]);
    setGoals([]);
    setRecurringRules([]);
    replaceRecords([]);
  };

  const handleExport = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      transactions,
      debts,
      goals,
      recurringTransactions: recurringRules,
      plannerRecords,
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `runway-backup-${todayLocalDate()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (file: File): Promise<string> => {
    let payload: unknown;
    try {
      payload = JSON.parse(await file.text());
    } catch {
      throw new Error(`This is not a valid ${APP_NAME} backup.`);
    }
    if (!payload || typeof payload !== 'object') throw new Error('The backup is empty.');
    const backup = payload as Record<string, unknown>;
    const list = <T,>(key: string) => (Array.isArray(backup[key]) ? backup[key] as T[] : []);
    const importedTransactions = list<Transaction>('transactions');
    const importedDebts = list<Debt>('debts');
    const importedGoals = list<Goal>('goals');
    const importedRecurring = list<RecurringTransaction>('recurringTransactions');
    const importedPlanner = list<PlannerRecord>('plannerRecords');
    const allRows = [...importedTransactions, ...importedDebts, ...importedGoals, ...importedRecurring, ...importedPlanner];
    if (allRows.length === 0) throw new Error('No records were found in this backup.');
    if (allRows.some((row) => !row || typeof row !== 'object' || typeof row.id !== 'string' || !row.id)) {
      throw new Error('Some backup records are invalid or missing an ID.');
    }
    for (const transaction of importedTransactions) await saveTransaction(transaction);
    for (const debt of importedDebts) await saveDebt(debt);
    for (const goal of importedGoals) await saveGoal(goal);
    for (const recurring of importedRecurring) await saveRecurringTransaction(recurring);
    for (const record of importedPlanner) await savePlannerRecord(record.kind, record.id, record.data);
    await loadData(false);
    return `Merged ${allRows.length} record${allRows.length === 1 ? '' : 's'} from the backup.`;
  };

  // ---------------------------------------------------------------- Render

  if (authReady && supabase && !session) return <AuthScreen />;

  if (isLoading) {
    return (
      <div className="mx-auto min-h-screen max-w-5xl space-y-4 px-4 py-6 sm:px-6">
        <div className="h-8 w-32 animate-pulse rounded-lg bg-subtle" />
        <div className="h-64 animate-pulse rounded-xl bg-card" />
        <div className="h-40 animate-pulse rounded-xl bg-card" />
      </div>
    );
  }

  const syncProblem = Boolean(syncState.lastError) || syncState.pendingCount > 0;
  const navItem = (view: ViewState, label: string, icon: React.ReactNode, onClick = () => setCurrentView(view)) => (
    <button type="button" onClick={onClick} aria-current={currentView === view ? 'page' : undefined} className={`flex flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 text-[11px] transition ${currentView === view ? 'text-ink' : 'text-ink-3 hover:text-ink-2'}`}>
      {icon}
      {label}
    </button>
  );

  return (
    <div className="min-h-screen text-ink">
      <header className="sticky top-0 z-20 h-14 border-b border-line bg-page/90 backdrop-blur">
        <div className="mx-auto flex h-full max-w-5xl items-center justify-between px-4 sm:px-6">
          <button type="button" onClick={() => { setCurrentView('home'); setCycleOffset(0); }} className="flex items-center gap-2.5">
            <img src="/favicon.svg" alt="" className="h-7 w-7 rounded-lg" />
            <span className="text-base font-medium text-ink">{APP_NAME}</span>
          </button>
          <button type="button" onClick={() => setIsSettingsModalOpen(true)} aria-label="Sync and settings" className="relative flex h-9 items-center gap-1.5 rounded-full border border-line bg-card px-3 text-ink-2 transition hover:text-ink">
            {syncState.isSyncing ? <RefreshCw size={14} className="animate-spin" /> : syncProblem ? <CloudOff size={14} className="text-warn" /> : <Cloud size={14} className={supabase ? 'text-good' : 'text-ink-3'} />}
            <Settings size={14} />
            {syncState.pendingCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-warn px-1 text-[10px] font-medium text-on-ink">{syncState.pendingCount}</span>
            )}
          </button>
        </div>
      </header>

      {(loadError || syncState.lastError) && (
        <div className="mx-auto mt-3 max-w-5xl px-4 sm:px-6">
          <div className="flex items-start justify-between gap-3 rounded-lg border border-warn/30 bg-warn-soft px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-warn">Sync needs attention</p>
              <p className="mt-0.5 line-clamp-2 text-xs text-warn">{loadError ?? syncState.lastError}</p>
            </div>
            <button type="button" onClick={() => void loadData(false)} className="flex shrink-0 items-center gap-1 text-xs font-medium text-warn"><RefreshCw size={12} /> Retry</button>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-5xl px-4 pt-4 sm:px-6">
        <Suspense fallback={<div className="h-40 animate-pulse rounded-xl bg-card" />}>
          {currentView === 'home' && (
            <CycleHome
              plan={viewedPlan}
              nextPlan={nextPlan}
              isConfigured={isConfigured}
              onCheckBalance={() => setIsBalanceOpen(true)}
              onOpenCards={() => setCurrentView('cards')}
              onShiftCycle={(delta) => setCycleOffset((offset) => offset + delta)}
              onToday={() => setCycleOffset(0)}
              onSetup={() => setIsSetupOpen(true)}
              onCheckIn={setCheckinMode}
              onTogglePaid={(obligation) => void handleTogglePaid(obligation)}
              onEditObligation={(obligation) => (obligation.kind === 'debt' ? handleOpenPayDebt(obligation.refId) : setEditingObligation(obligation))}
              onAddCash={() => setIsCashOpen(true)}
              onOpenActivity={() => setCurrentView('list')}
              onEditTransaction={(transaction) => openTransactionForm(null, transaction)}
            />
          )}
          {currentView === 'list' && (
            <ExpenseList expenses={transactions} onEdit={(transaction) => openTransactionForm(null, transaction)} currentCycle={trackedRange(currentCycle)} previousCycle={trackedRange(previousCycle)} />
          )}
          {currentView === 'cards' && (
            <CardsView
              data={plannerData}
              debts={debts}
              today={today}
              latestSalary={latestSalary}
              onSaveUsage={handleSaveUsage}
              onImportBreakdowns={handleImportBreakdowns}
              onDeleteBreakdown={handleDeleteBreakdown}
              onOpenSetup={() => setIsSetupOpen(true)}
              onOpenDebts={() => setCurrentView('debts')}
            />
          )}
          {currentView === 'history' && (
            <CycleHistory plans={historyPlans} onOpenCycle={(key) => { setCycleOffset(monthsBetween(currentCycle.key, key)); setCurrentView('home'); }} />
          )}
          {currentView === 'debts' && (
            <DebtList debts={debts} cardNames={cardNames} onToggleStatus={handleOpenPayDebt} onEdit={(debt) => { setEditingDebt(debt); setIsDebtModalOpen(true); }} />
          )}
          {currentView === 'goals' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-medium text-ink">Goals</h2>
                <button type="button" onClick={() => { setEditingGoal(null); setIsGoalModalOpen(true); }} className="btn min-h-9 px-3 text-[13px]"><Plus size={15} /> New goal</button>
              </div>
              <GoalList goals={goals} onAddFundsClick={(id) => { setSelectedGoalId(id); setFundAmountToAdd(''); setFundError(null); }} onEdit={(goal) => { setEditingGoal(goal); setIsGoalModalOpen(true); }} />
            </div>
          )}
        </Suspense>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-page/95 backdrop-blur pb-safe">
        <div className="mx-auto grid max-w-5xl grid-cols-5 items-center px-2 pt-1">
          {navItem('home', 'Home', <Home size={20} />, () => { setCurrentView('home'); setCycleOffset(0); })}
          {navItem('list', 'Activity', <HandCoins size={20} />)}
          <div className="flex justify-center">
            <button type="button" onClick={() => setIsCashOpen(true)} aria-label="Add cash expense" className="flex h-12 w-12 items-center justify-center rounded-full bg-ink text-on-ink transition hover:opacity-90 active:scale-95">
              <Plus size={22} />
            </button>
          </div>
          {navItem('cards', 'Cards', <CreditCardIcon size={20} />)}
          <button type="button" onClick={() => setIsMoreMenuOpen(true)} className={`flex flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 text-[11px] transition ${['goals', 'debts', 'history'].includes(currentView) ? 'text-ink' : 'text-ink-3 hover:text-ink-2'}`}>
            <MoreHorizontal size={20} />
            More
          </button>
        </div>
      </nav>

      {notice && (
        <div aria-live="polite" className="fixed bottom-24 left-1/2 z-40 flex w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 items-center justify-between gap-3 rounded-xl bg-ink px-4 py-3 text-on-ink animate-slide-up">
          <p className="min-w-0 truncate text-[13px]">Added {notice.description || notice.category} · {formatYen(notice.amount)}</p>
          <button type="button" onClick={() => void handleUndoNotice()} className="shrink-0 rounded-lg px-2 py-1 text-[13px] font-medium underline-offset-2 hover:underline">Undo</button>
        </div>
      )}

      <Modal isOpen={isMoreMenuOpen} onClose={() => setIsMoreMenuOpen(false)} title="More">
        <div className="-mx-2 space-y-1">
          {[
            { icon: <History size={18} />, title: 'Cycle history', note: 'Where each cycle\'s money went', action: () => setCurrentView('history') },
            { icon: <Target size={18} />, title: 'Goals', note: 'Savings targets', action: () => setCurrentView('goals') },
            { icon: <ArrowLeftRight size={18} />, title: 'Debts', note: 'Split installments and loans', action: () => setCurrentView('debts') },
            { icon: <SlidersHorizontal size={18} />, title: 'Setup', note: 'Payday, credit cards and transfer bills', action: () => setIsSetupOpen(true) },
            { icon: <Settings size={18} />, title: 'Sync and settings', note: 'Account, backup and old recurring entries', action: () => setIsSettingsModalOpen(true) },
            { icon: <Download size={18} />, title: 'Export backup', note: 'Download a private JSON copy', action: handleExport },
          ].map((item) => (
            <button key={item.title} type="button" onClick={() => { setIsMoreMenuOpen(false); item.action(); }} className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition hover:bg-subtle">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-subtle text-ink-2">{item.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-ink">{item.title}</span>
                <span className="block text-xs text-ink-3">{item.note}</span>
              </span>
              <ChevronRight size={16} className="text-ink-3" />
            </button>
          ))}
        </div>
      </Modal>

      <Modal isOpen={isCashOpen} onClose={() => setIsCashOpen(false)} title="Cash expense">
        <CashEntry
          transactions={transactions}
          left={isConfigured && currentPlan.record ? currentPlan.left : null}
          onSave={handleSaveCash}
          onLogIncome={() => { setIsCashOpen(false); openTransactionForm({ type: 'income' }); }}
        />
      </Modal>

      <Modal isOpen={isSetupOpen} onClose={() => setIsSetupOpen(false)} title="Setup" size="lg" closeOnBackdrop={false}>
        <PlanSetup data={plannerData} legacyRecurringCount={recurringRules.length} onSave={handleSaveSetup} onCancel={() => setIsSetupOpen(false)} />
      </Modal>

      <Modal isOpen={checkinMode !== null} onClose={() => setCheckinMode(null)} title={checkinMode === 'today' ? 'Start tracking' : 'Payday check-in'} size="lg" closeOnBackdrop={false} bare>
        {checkinMode && (
          <PaydayCheckin
            mode={checkinMode}
            plan={currentPlan}
            data={plannerData}
            debts={debts}
            goals={goals}
            suggestedCarryover={suggestedCarryover(currentCycle, planInput, settings)}
            onSubmit={handleCheckin}
            onCancel={() => setCheckinMode(null)}
          />
        )}
      </Modal>

      <Modal isOpen={isBalanceOpen} onClose={() => setIsBalanceOpen(false)} title="Check balance">
        {isBalanceOpen && (
          <BalanceCheck
            plan={currentPlan}
            savingsInAccount={settings.savingsInAccount ?? true}
            onSave={handleBalanceAdjust}
            onCancel={() => setIsBalanceOpen(false)}
          />
        )}
      </Modal>

      <Modal isOpen={editingObligation !== null} onClose={() => setEditingObligation(null)} title={editingObligation?.kind === 'card' ? `${editingObligation.label} bill` : editingObligation?.label ?? ''}>
        {editingObligation && (
          <ObligationEditor
            key={editingObligation.key}
            obligation={editingObligation}
            data={plannerData}
            debts={debts}
            onSaveCard={async (input, paid) => { await saveCardBill(input, paid); setEditingObligation(null); }}
            onSaveBill={async (bill, dueDate, amount, paid) => {
              await saveBillPayment(bill, dueDate, { amount, confirmed: true, paidAt: paid ? editingObligation.billPayment?.paidAt ?? new Date().toISOString() : undefined });
              setEditingObligation(null);
            }}
            onPayDebt={handleOpenPayDebt}
            onCancel={() => setEditingObligation(null)}
          />
        )}
      </Modal>

      <Modal isOpen={isTransactionModalOpen} onClose={closeTransactionForm} title={editingTransaction ? 'Edit entry' : transactionPrefill?.type === 'income' ? 'Add income' : 'Add entry'}>
        <ExpenseForm
          key={editingTransaction?.id ?? transactionPrefill?.type ?? 'new'}
          transaction={editingTransaction ?? undefined}
          prefill={editingTransaction ? undefined : transactionPrefill ?? undefined}
          existingTransactions={transactions}
          onSave={handleSaveTransaction}
          onCancel={closeTransactionForm}
          onDelete={editingTransaction ? () => {
            const id = editingTransaction.id;
            closeTransactionForm();
            setPendingDelete({ type: 'transaction', id });
          } : undefined}
        />
      </Modal>

      <Modal isOpen={isDebtModalOpen} onClose={() => { setIsDebtModalOpen(false); setEditingDebt(null); }} title={editingDebt ? 'Edit debt' : 'Add debt'}>
        <DebtForm
          debt={editingDebt ?? undefined}
          onSave={handleSaveDebt}
          onCancel={() => { setIsDebtModalOpen(false); setEditingDebt(null); }}
          onDelete={editingDebt ? () => {
            const id = editingDebt.id;
            setIsDebtModalOpen(false);
            setEditingDebt(null);
            setPendingDelete({ type: 'debt', id });
          } : undefined}
        />
      </Modal>

      <Modal isOpen={isGoalModalOpen} onClose={() => { setIsGoalModalOpen(false); setEditingGoal(null); }} title={editingGoal ? 'Edit goal' : 'New goal'}>
        <GoalForm
          goal={editingGoal ?? undefined}
          onSave={handleSaveGoal}
          onCancel={() => { setIsGoalModalOpen(false); setEditingGoal(null); }}
          onDelete={editingGoal ? () => {
            const id = editingGoal.id;
            setIsGoalModalOpen(false);
            setEditingGoal(null);
            setPendingDelete({ type: 'goal', id });
          } : undefined}
        />
      </Modal>

      <Modal isOpen={selectedGoalId !== null} onClose={() => setSelectedGoalId(null)} title="Add to goal">
        <form onSubmit={handleSubmitFunds} className="space-y-4">
          <div>
            <label htmlFor="fund-amount" className="field-label">Amount</label>
            <AmountInput id="fund-amount" value={fundAmountToAdd} onChange={(value) => { setFundAmountToAdd(value); setFundError(null); }} size="lg" autoFocus />
            {fundError && <p className="mt-1.5 text-xs text-bad">{fundError}</p>}
          </div>
          <button type="submit" className="btn-primary w-full">Add</button>
        </form>
      </Modal>

      <Modal isOpen={selectedDebt !== null} onClose={() => setSelectedDebtId(null)} title={selectedDebt ? `Pay ${selectedDebt.person}` : 'Pay debt'}>
        {selectedDebt && (
          <form onSubmit={handleSubmitDebtPayment} className="space-y-4">
            <div>
              <label htmlFor="debt-principal" className="field-label">Principal</label>
              <AmountInput id="debt-principal" value={debtPaymentAmount} onChange={(value) => { setDebtPaymentAmount(value); setDebtPaymentError(null); }} size="lg" autoFocus />
              {debtPaymentError && <p className="mt-1.5 text-xs text-bad">{debtPaymentError}</p>}
            </div>
            <div className="space-y-1.5 rounded-lg bg-subtle p-3 text-[13px]">
              <div className="flex justify-between text-ink-2"><span>Balance</span><span className="tabular-nums">{formatYen(selectedDebt.amount)}</span></div>
              <div className="flex justify-between text-ink-2"><span>Interest this month</span><span className="tabular-nums">{formatYen(paymentInterest)}</span></div>
              <div className="flex justify-between border-t border-line pt-1.5 font-medium text-ink"><span>Paid from this cycle</span><span className="tabular-nums">{formatYen(paymentPrincipal + paymentInterest)}</span></div>
            </div>
            <button type="submit" className="btn-primary w-full">Record payment</button>
          </form>
        )}
      </Modal>

      <Modal isOpen={pendingDelete !== null} onClose={() => setPendingDelete(null)} title="Delete">
        <div className="space-y-4">
          <p className="text-sm text-ink-2">
            {pendingDelete?.type === 'transaction' && 'Delete this entry?'}
            {pendingDelete?.type === 'debt' && 'Delete this debt?'}
            {pendingDelete?.type === 'goal' && 'Delete this goal?'}
            {pendingDelete?.type === 'recurring' && 'Stop this recurring entry? Entries it already added stay.'}
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setPendingDelete(null)} className="btn flex-1">Cancel</button>
            <button type="button" onClick={() => void confirmDelete()} className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg bg-bad px-4 text-sm font-medium text-on-ink transition hover:opacity-90">Delete</button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={isSettingsModalOpen} onClose={() => setIsSettingsModalOpen(false)} title="Sync and settings">
        <SettingsPanel
          email={session?.user.email ?? null}
          sync={syncState}
          recurringRules={recurringRules}
          onRetrySync={() => void loadData(false)}
          onDeleteRecurring={(id) => { setIsSettingsModalOpen(false); setPendingDelete({ type: 'recurring', id }); }}
          onExport={handleExport}
          onImport={handleImport}
          onSignOut={() => void handleSignOut()}
        />
      </Modal>
    </div>
  );
};

export default App;
