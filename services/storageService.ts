
import { Transaction, Debt, Goal, RecurringTransaction } from '../types';
import { MOCK_DATA_IF_EMPTY, MOCK_DEBTS_IF_EMPTY } from '../constants';
import { supabase } from './supabaseClient';

const STORAGE_KEY = 'smartspend_data_v2'; 
const DEBT_STORAGE_KEY = 'smartspend_debts_v2';
const GOAL_STORAGE_KEY = 'smartspend_goals_v1';
const RECURRING_KEY = 'smartspend_recurring_v1';

/*
  SUPABASE SCHEMA INSTRUCTIONS:
  If using Supabase, create these tables:
  transactions, debts, goals, recurring_transactions, habit_patterns, habit_reminder_state
*/

// --- Transactions ---

const sortTransactions = (list: Transaction[]) => {
  return [...list].sort((a, b) => {
    const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
    if (dateDiff !== 0) return dateDiff;
    const ca = a.created_at ? new Date(a.created_at).getTime() : 0;
    const cb = b.created_at ? new Date(b.created_at).getTime() : 0;
    return cb - ca;
  });
};

export const getTransactions = async (): Promise<Transaction[]> => {
  if (supabase) {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .order('date', { ascending: false })
      .order('created_at', { ascending: false });
    if (!error && data) return sortTransactions(data as Transaction[]);
  }
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return sortTransactions(MOCK_DATA_IF_EMPTY as Transaction[]);
    return sortTransactions(JSON.parse(stored));
  } catch (e) {
    return [];
  }
};

export const saveTransaction = async (transaction: Transaction): Promise<void> => {
  const record: Transaction = {
    ...transaction,
    created_at: transaction.created_at ?? new Date().toISOString(),
  };

  if (supabase) {
    await supabase.from('transactions').upsert(record);
  }
  const current = await getTransactionsLocal();
  const updated = [record, ...current.filter(t => t.id !== record.id)];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
};

export const deleteTransaction = async (id: string): Promise<void> => {
  if (supabase) {
    await supabase.from('transactions').delete().eq('id', id);
  }
  const current = await getTransactionsLocal();
  const updated = current.filter(t => t.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
};

const getTransactionsLocal = async (): Promise<Transaction[]> => {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored ? JSON.parse(stored) : [];
};

// --- Recurring Transactions ---

export const getRecurringTransactions = async (): Promise<RecurringTransaction[]> => {
  const stored = localStorage.getItem(RECURRING_KEY);
  return stored ? JSON.parse(stored) : [];
};

export const saveRecurringTransaction = async (recurring: RecurringTransaction): Promise<void> => {
  const current = await getRecurringTransactions();
  const updated = [recurring, ...current.filter(r => r.id !== recurring.id)];
  localStorage.setItem(RECURRING_KEY, JSON.stringify(updated));
};

export const processRecurringTransactions = async (): Promise<Transaction[]> => {
  const recurringRules = await getRecurringTransactions();
  const newTransactions: Transaction[] = [];
  const now = new Date();
  now.setHours(0, 0, 0, 0); // Normalize today

  let updatedRules = recurringRules.map(rule => {
    let nextDue = new Date(rule.nextDue);
    let modified = false;

    // While the next due date is today or in the past
    while (nextDue <= now) {
      modified = true;
      // Create the transaction
      const newTx: Transaction = {
        id: crypto.randomUUID(),
        date: nextDue.toISOString(),
        ...rule.transactionTemplate
      };
      newTransactions.push(newTx);

      // Advance the date
      if (rule.frequency === 'monthly') {
        nextDue.setMonth(nextDue.getMonth() + 1);
      } else {
        nextDue.setDate(nextDue.getDate() + 7);
      }
    }

    return { ...rule, nextDue: nextDue.toISOString() };
  });

  // Save generated transactions
  for (const tx of newTransactions) {
    await saveTransaction(tx);
  }

  // Save updated rules (next due dates)
  if (newTransactions.length > 0) {
     localStorage.setItem(RECURRING_KEY, JSON.stringify(updatedRules));
  }

  return newTransactions;
};

// --- Debts ---

export const getDebts = async (): Promise<Debt[]> => {
  if (supabase) {
    const { data, error } = await supabase.from('debts').select('*');
    if (!error && data) return data as Debt[];
  }
  try {
    const stored = localStorage.getItem(DEBT_STORAGE_KEY);
    return stored ? JSON.parse(stored) : MOCK_DEBTS_IF_EMPTY;
  } catch (e) {
    return [];
  }
};

export const saveDebt = async (debt: Debt): Promise<void> => {
  if (supabase) {
    await supabase.from('debts').upsert(debt);
  }
  const stored = localStorage.getItem(DEBT_STORAGE_KEY);
  const localDebts: Debt[] = stored ? JSON.parse(stored) : MOCK_DEBTS_IF_EMPTY;
  
  const updated = [debt, ...localDebts.filter(d => d.id !== debt.id)];
  localStorage.setItem(DEBT_STORAGE_KEY, JSON.stringify(updated));
};

export const deleteDebt = async (id: string): Promise<void> => {
  if (supabase) {
    await supabase.from('debts').delete().eq('id', id);
  }
  const stored = localStorage.getItem(DEBT_STORAGE_KEY);
  const localDebts: Debt[] = stored ? JSON.parse(stored) : [];
  const updated = localDebts.filter(d => d.id !== id);
  localStorage.setItem(DEBT_STORAGE_KEY, JSON.stringify(updated));
};

// --- Goals ---

export const getGoals = async (): Promise<Goal[]> => {
  if (supabase) {
    const { data, error } = await supabase.from('goals').select('*');
    if (!error && data) return data as Goal[];
  }
  try {
    const stored = localStorage.getItem(GOAL_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (e) {
    return [];
  }
};

export const saveGoal = async (goal: Goal): Promise<void> => {
  if (supabase) {
    await supabase.from('goals').upsert(goal);
  }
  const stored = localStorage.getItem(GOAL_STORAGE_KEY);
  const localGoals: Goal[] = stored ? JSON.parse(stored) : [];
  const updated = [goal, ...localGoals.filter(g => g.id !== goal.id)];
  localStorage.setItem(GOAL_STORAGE_KEY, JSON.stringify(updated));
};

export const deleteGoal = async (id: string): Promise<void> => {
  if (supabase) {
    await supabase.from('goals').delete().eq('id', id);
  }
  const stored = localStorage.getItem(GOAL_STORAGE_KEY);
  const localGoals: Goal[] = stored ? JSON.parse(stored) : [];
  const updated = localGoals.filter(g => g.id !== id);
  localStorage.setItem(GOAL_STORAGE_KEY, JSON.stringify(updated));
};
