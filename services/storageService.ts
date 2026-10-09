import { Transaction, Debt, Goal, RecurringTransaction } from '../types';
import { deterministicUuid, getNextRecurringDate } from '../utils/date';
import { supabase } from './supabaseClient';

const STORAGE_KEY = 'smartspend_data_v2';
const DEBT_STORAGE_KEY = 'smartspend_debts_v2';
const GOAL_STORAGE_KEY = 'smartspend_goals_v1';
const RECURRING_KEY = 'smartspend_recurring_v1';
const PLANNER_KEY = 'smartspend_planner_v1';
const OUTBOX_KEY = 'smartspend_sync_outbox_v1';
const SYNC_EVENT = 'smartspend:sync-state';
const legacyMarkerKey = (baseKey: string, userId: string) => `${baseKey}:legacy-adopted:${userId}`;

type SyncTable = 'transactions' | 'debts' | 'goals' | 'recurring_transactions' | 'planner_records';

interface PendingMutation {
  mutationId: string;
  userId: string;
  table: SyncTable;
  action: 'upsert' | 'delete';
  recordId: string;
  record?: Record<string, unknown>;
  queuedAt: string;
}

export interface SyncSnapshot {
  isSyncing: boolean;
  pendingCount: number;
  lastSyncedAt: string | null;
  lastError: string | null;
}

let syncSnapshot: SyncSnapshot = {
  isSyncing: false,
  pendingCount: 0,
  lastSyncedAt: null,
  lastError: null,
};
let activeSync: Promise<SyncSnapshot> | null = null;

const safeJsonParse = <T,>(raw: string | null, fallback: T): T => {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const getOutbox = () => safeJsonParse<PendingMutation[]>(localStorage.getItem(OUTBOX_KEY), []);

const emitSyncSnapshot = (patch: Partial<SyncSnapshot> = {}) => {
  syncSnapshot = {
    ...syncSnapshot,
    ...patch,
    pendingCount: getOutbox().length,
  };
  window.dispatchEvent(new CustomEvent<SyncSnapshot>(SYNC_EVENT, { detail: syncSnapshot }));
};

const PLANNER_MIGRATION = 'supabase/migrations/20261009_pay_cycle_planner.sql';

const errorMessage = (error: unknown) => {
  const raw = error && typeof error === 'object' && 'message' in error
    ? String(error.message)
    : error instanceof Error ? error.message : 'Cloud sync failed';
  // A missing table or column means the database is older than the app.
  if (/planner_records|cardId/.test(raw) && /does not exist|schema cache|Could not find/i.test(raw)) {
    return `The database needs an update. Run ${PLANNER_MIGRATION} in the Supabase SQL editor, then tap Sync now.`;
  }
  return raw;
};

const getUserId = async () => {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session?.user.id ?? null;
};

const getRequiredUserId = async () => {
  const userId = await getUserId();
  if (!userId) throw new Error('Sign in is required to sync data');
  return userId;
};

const scopedKey = (baseKey: string, userId: string | null) => userId ? `${baseKey}:${userId}` : baseKey;

const readLocal = <T,>(baseKey: string, userId: string | null, fallback: T): T => {
  const key = scopedKey(baseKey, userId);
  const scoped = localStorage.getItem(key);
  if (scoped) return safeJsonParse(scoped, fallback);

  // Adopt the pre-auth cache once so an existing installation remains usable during migration.
  if (userId) {
    const legacy = localStorage.getItem(baseKey);
    if (legacy) {
      localStorage.setItem(key, legacy);
      localStorage.setItem(legacyMarkerKey(baseKey, userId), '1');
      return safeJsonParse(legacy, fallback);
    }
  }
  return fallback;
};

const writeLocal = <T,>(baseKey: string, userId: string | null, value: T) => {
  localStorage.setItem(scopedKey(baseKey, userId), JSON.stringify(value));
};

const stripOwner = <T,>(row: T & { user_id?: string }): T => {
  const { user_id: _userId, ...record } = row;
  return record as T;
};

const sortTransactions = (list: Transaction[]) => [...list].sort((a, b) => {
  const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
  if (dateDiff !== 0) return dateDiff;
  const ca = a.created_at ? new Date(a.created_at).getTime() : 0;
  const cb = b.created_at ? new Date(b.created_at).getTime() : 0;
  return cb - ca;
});

const applyRemoteMutation = async (mutation: PendingMutation) => {
  if (!supabase) return;
  if (mutation.action === 'upsert') {
    const { error } = await supabase
      .from(mutation.table)
      .upsert({ ...mutation.record, user_id: mutation.userId });
    if (error) throw error;
    return;
  }

  const { error } = await supabase
    .from(mutation.table)
    .delete()
    .eq('id', mutation.recordId)
    .eq('user_id', mutation.userId);
  if (error) throw error;
};

const queueMutation = (mutation: Omit<PendingMutation, 'mutationId' | 'queuedAt'>) => {
  const pending = getOutbox().filter((item) => !(
    item.userId === mutation.userId &&
    item.table === mutation.table &&
    item.recordId === mutation.recordId
  ));
  pending.push({
    ...mutation,
    mutationId: crypto.randomUUID(),
    queuedAt: new Date().toISOString(),
  });
  localStorage.setItem(OUTBOX_KEY, JSON.stringify(pending));
  emitSyncSnapshot();
};

const removeQueuedEntity = (userId: string, table: SyncTable, recordId: string) => {
  const remaining = getOutbox().filter((item) => !(
    item.userId === userId && item.table === table && item.recordId === recordId
  ));
  localStorage.setItem(OUTBOX_KEY, JSON.stringify(remaining));
  return remaining;
};

// A cloud read must not overwrite a save made while it was out: each save
// bumps its table's version and is counted until its cloud write finishes.
const writeVersions = new Map<SyncTable, number>();
const writesInFlight = new Map<SyncTable, number>();
const writeVersion = (table: SyncTable) => writeVersions.get(table) ?? 0;
/** Called first in every save and delete, before anything is awaited. */
const noteLocalWrite = (table: SyncTable) => writeVersions.set(table, writeVersion(table) + 1);
const changedLocallySince = (table: SyncTable, version: number) =>
  writeVersion(table) !== version || (writesInFlight.get(table) ?? 0) > 0;

const syncMutation = async (mutation: Omit<PendingMutation, 'mutationId' | 'queuedAt'>) => {
  if (!supabase) return;
  const queued: PendingMutation = {
    ...mutation,
    mutationId: crypto.randomUUID(),
    queuedAt: new Date().toISOString(),
  };
  writeVersions.set(mutation.table, writeVersion(mutation.table) + 1);
  writesInFlight.set(mutation.table, (writesInFlight.get(mutation.table) ?? 0) + 1);
  try {
    await applyRemoteMutation(queued);
    const remaining = removeQueuedEntity(mutation.userId, mutation.table, mutation.recordId);
    emitSyncSnapshot({
      lastSyncedAt: new Date().toISOString(),
      lastError: remaining.length === 0 ? null : syncSnapshot.lastError,
    });
  } catch (error) {
    queueMutation(mutation);
    emitSyncSnapshot({ lastError: errorMessage(error) });
  } finally {
    writesInFlight.set(mutation.table, (writesInFlight.get(mutation.table) ?? 1) - 1);
  }
};

const isDemoRecord = (table: SyncTable, record: Record<string, unknown>) => {
  if (table === 'transactions') {
    return ['Feast at Ramen Shop', 'Chariot (Suica)', 'Imperial Stipend'].includes(String(record.description));
  }
  if (table === 'debts') {
    return ['Iron Bank (Card A)', 'Merchant Guild (Card B)'].includes(String(record.person));
  }
  if (table === 'goals') {
    return ['Conquer Europe', 'Trading Bot Empire'].includes(String(record.name));
  }
  return false;
};

const finishLegacyAdoption = (baseKey: string, userId: string) => {
  localStorage.removeItem(baseKey);
  localStorage.removeItem(legacyMarkerKey(baseKey, userId));
};

const migrateLegacyRowsIfNeeded = async <T extends { id: string }>(
  baseKey: string,
  table: SyncTable,
  userId: string,
  localRows: T[],
  toRemoteRecord: (row: T) => Record<string, unknown> = (row) => ({ ...row }),
): Promise<T[] | null> => {
  if (!localStorage.getItem(legacyMarkerKey(baseKey, userId))) return null;
  const candidates = localRows.filter((row) => !isDemoRecord(table, toRemoteRecord(row)));
  writeLocal(baseKey, userId, candidates);

  for (const row of candidates) {
    await syncMutation({
      userId,
      table,
      action: 'upsert',
      recordId: row.id,
      record: toRemoteRecord(row),
    });
  }

  if (!getOutbox().some((item) => item.userId === userId && item.table === table)) {
    finishLegacyAdoption(baseKey, userId);
  }
  return candidates;
};

export const getSyncSnapshot = () => ({
  ...syncSnapshot,
  pendingCount: getOutbox().length,
});

export const subscribeToSyncState = (listener: (snapshot: SyncSnapshot) => void) => {
  const handler = (event: Event) => listener((event as CustomEvent<SyncSnapshot>).detail);
  window.addEventListener(SYNC_EVENT, handler);
  listener(getSyncSnapshot());
  return () => window.removeEventListener(SYNC_EVENT, handler);
};

export const syncPendingChanges = async (): Promise<SyncSnapshot> => {
  if (!supabase) return getSyncSnapshot();
  if (activeSync) return activeSync;

  activeSync = (async () => {
    emitSyncSnapshot({ isSyncing: true });
    let userId: string | null;
    try {
      userId = await getUserId();
    } catch (error) {
      emitSyncSnapshot({ isSyncing: false, lastError: errorMessage(error) });
      return getSyncSnapshot();
    }
    if (!userId) {
      emitSyncSnapshot({ isSyncing: false });
      return getSyncSnapshot();
    }

    // Each change is tried on its own: one that keeps failing stays queued
    // without holding back the others.
    let firstError: unknown = null;
    const pendingForUser = getOutbox().filter((item) => item.userId === userId);
    for (const mutation of pendingForUser) {
      try {
        await applyRemoteMutation(mutation);
        const remaining = getOutbox().filter((item) => item.mutationId !== mutation.mutationId);
        localStorage.setItem(OUTBOX_KEY, JSON.stringify(remaining));
      } catch (error) {
        firstError ??= error;
      }
    }
    if (firstError) {
      emitSyncSnapshot({ isSyncing: false, lastError: errorMessage(firstError) });
      return getSyncSnapshot();
    }

    emitSyncSnapshot({
      isSyncing: false,
      lastSyncedAt: new Date().toISOString(),
      lastError: null,
    });
    return getSyncSnapshot();
  })().finally(() => {
    activeSync = null;
  });

  return activeSync;
};

/** Pushes queued changes first. A table with changes still queued is read from the device instead. */
const prepareCloudRead = async (table: SyncTable) => {
  if (!supabase) return null;
  const userId = await getRequiredUserId();
  const snapshot = await syncPendingChanges();
  if (getOutbox().some((item) => item.userId === userId && item.table === table)) {
    throw new Error(snapshot.lastError ?? 'Some changes are still waiting to sync');
  }
  return userId;
};

const noteCloudReadSuccess = () => emitSyncSnapshot({
  lastSyncedAt: new Date().toISOString(),
});

const noteCloudReadFailure = (error: unknown) => emitSyncSnapshot({ lastError: errorMessage(error) });

export const getTransactions = async (): Promise<Transaction[]> => {
  const userId = supabase ? await getRequiredUserId() : null;
  const local = sortTransactions(readLocal<Transaction[]>(STORAGE_KEY, userId, []));
  if (!supabase) return local;

  try {
    const version = writeVersion('transactions');
    await prepareCloudRead('transactions');
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) throw error;
    // A save landed while this read was out; this device's copy is newer.
    if (changedLocallySince('transactions', version)) return sortTransactions(readLocal<Transaction[]>(STORAGE_KEY, userId, []));
    const remote = sortTransactions((data ?? []).map((row) => stripOwner(row as Transaction & { user_id?: string })));
    if (remote.length === 0 && local.length > 0) {
      const migrated = await migrateLegacyRowsIfNeeded(STORAGE_KEY, 'transactions', userId, local);
      if (migrated) return sortTransactions(migrated);
    }
    finishLegacyAdoption(STORAGE_KEY, userId);
    writeLocal(STORAGE_KEY, userId, remote);
    noteCloudReadSuccess();
    return remote;
  } catch (error) {
    noteCloudReadFailure(error);
    return local;
  }
};

export const saveTransaction = async (transaction: Transaction): Promise<void> => {
  noteLocalWrite('transactions');
  const userId = supabase ? await getRequiredUserId() : null;
  const record: Transaction = {
    ...transaction,
    created_at: transaction.created_at ?? new Date().toISOString(),
  };
  const current = readLocal<Transaction[]>(STORAGE_KEY, userId, []);
  writeLocal(STORAGE_KEY, userId, sortTransactions([record, ...current.filter((item) => item.id !== record.id)]));
  if (userId) await syncMutation({ userId, table: 'transactions', action: 'upsert', recordId: record.id, record: { ...record } });
};

export const deleteTransaction = async (id: string): Promise<void> => {
  noteLocalWrite('transactions');
  const userId = supabase ? await getRequiredUserId() : null;
  const current = readLocal<Transaction[]>(STORAGE_KEY, userId, []);
  writeLocal(STORAGE_KEY, userId, current.filter((item) => item.id !== id));
  if (userId) await syncMutation({ userId, table: 'transactions', action: 'delete', recordId: id });
};

const recurringToRow = (recurring: RecurringTransaction): Record<string, unknown> => ({
  id: recurring.id,
  frequency: recurring.frequency,
  next_due: recurring.nextDue,
  anchor_day: recurring.anchorDay ?? null,
  transaction_template: recurring.transactionTemplate,
});

const recurringFromRow = (row: Record<string, unknown>): RecurringTransaction => ({
  id: String(row.id),
  frequency: row.frequency as RecurringTransaction['frequency'],
  nextDue: String(row.next_due),
  anchorDay: row.anchor_day === null || row.anchor_day === undefined ? undefined : Number(row.anchor_day),
  transactionTemplate: row.transaction_template as RecurringTransaction['transactionTemplate'],
});

export const getRecurringTransactions = async (): Promise<RecurringTransaction[]> => {
  const userId = supabase ? await getRequiredUserId() : null;
  const local = readLocal<RecurringTransaction[]>(RECURRING_KEY, userId, []);
  if (!supabase) return local;

  try {
    const version = writeVersion('recurring_transactions');
    await prepareCloudRead('recurring_transactions');
    const { data, error } = await supabase
      .from('recurring_transactions')
      .select('*')
      .eq('user_id', userId)
      .order('next_due', { ascending: true });
    if (error) throw error;
    // A save landed while this read was out; this device's copy is newer.
    if (changedLocallySince('recurring_transactions', version)) return readLocal<RecurringTransaction[]>(RECURRING_KEY, userId, []);
    const remote = (data ?? []).map((row) => recurringFromRow(row as Record<string, unknown>));
    if (remote.length === 0 && local.length > 0) {
      const migrated = await migrateLegacyRowsIfNeeded(RECURRING_KEY, 'recurring_transactions', userId, local, recurringToRow);
      if (migrated) return migrated;
    }
    finishLegacyAdoption(RECURRING_KEY, userId);
    writeLocal(RECURRING_KEY, userId, remote);
    noteCloudReadSuccess();
    return remote;
  } catch (error) {
    noteCloudReadFailure(error);
    return local;
  }
};

export const saveRecurringTransaction = async (recurring: RecurringTransaction): Promise<void> => {
  noteLocalWrite('recurring_transactions');
  const userId = supabase ? await getRequiredUserId() : null;
  const current = readLocal<RecurringTransaction[]>(RECURRING_KEY, userId, []);
  writeLocal(RECURRING_KEY, userId, [recurring, ...current.filter((item) => item.id !== recurring.id)]);
  if (userId) {
    await syncMutation({
      userId,
      table: 'recurring_transactions',
      action: 'upsert',
      recordId: recurring.id,
      record: recurringToRow(recurring),
    });
  }
};

export const deleteRecurringTransaction = async (id: string): Promise<void> => {
  noteLocalWrite('recurring_transactions');
  const userId = supabase ? await getRequiredUserId() : null;
  const current = readLocal<RecurringTransaction[]>(RECURRING_KEY, userId, []);
  writeLocal(RECURRING_KEY, userId, current.filter((item) => item.id !== id));
  if (userId) await syncMutation({ userId, table: 'recurring_transactions', action: 'delete', recordId: id });
};

export const processRecurringTransactions = async (): Promise<Transaction[]> => {
  const recurringRules = await getRecurringTransactions();
  const newTransactions: Transaction[] = [];
  const now = new Date();
  now.setHours(23, 59, 59, 999);

  for (const rule of recurringRules) {
    // Variable bills are forecast from their recurring rule but must not become
    // real expenses until the user confirms the actual amount and date.
    if (rule.transactionTemplate.requiresConfirmation) continue;

    let nextDue = new Date(rule.nextDue);
    if (Number.isNaN(nextDue.getTime())) continue;
    const anchorDay = rule.anchorDay ?? nextDue.getDate();
    const ruleTransactions: Transaction[] = [];
    let modified = false;

    while (nextDue <= now) {
      modified = true;
      const occurrenceDate = nextDue.toISOString();
      const transactionTemplate = { ...rule.transactionTemplate };
      delete transactionTemplate.requiresConfirmation;
      const transaction: Transaction = {
        id: await deterministicUuid(`smartspend:${rule.id}:${occurrenceDate}`),
        date: occurrenceDate,
        created_at: new Date().toISOString(),
        ...transactionTemplate,
      };
      ruleTransactions.push(transaction);
      newTransactions.push(transaction);
      nextDue = getNextRecurringDate(nextDue, rule.frequency, anchorDay);
    }

    if (!modified) continue;
    for (const transaction of ruleTransactions) {
      await saveTransaction(transaction);
    }
    await saveRecurringTransaction({ ...rule, anchorDay, nextDue: nextDue.toISOString() });
  }

  return newTransactions;
};

export const getDebts = async (): Promise<Debt[]> => {
  const userId = supabase ? await getRequiredUserId() : null;
  const local = readLocal<Debt[]>(DEBT_STORAGE_KEY, userId, []);
  if (!supabase) return local;

  try {
    const version = writeVersion('debts');
    await prepareCloudRead('debts');
    const { data, error } = await supabase.from('debts').select('*').eq('user_id', userId);
    if (error) throw error;
    // A save landed while this read was out; this device's copy is newer.
    if (changedLocallySince('debts', version)) return readLocal<Debt[]>(DEBT_STORAGE_KEY, userId, []);
    const remote = (data ?? []).map((row) => stripOwner(row as Debt & { user_id?: string }));
    if (remote.length === 0 && local.length > 0) {
      const migrated = await migrateLegacyRowsIfNeeded(DEBT_STORAGE_KEY, 'debts', userId, local);
      if (migrated) return migrated;
    }
    finishLegacyAdoption(DEBT_STORAGE_KEY, userId);
    writeLocal(DEBT_STORAGE_KEY, userId, remote);
    noteCloudReadSuccess();
    return remote;
  } catch (error) {
    noteCloudReadFailure(error);
    return local;
  }
};

export const saveDebt = async (debt: Debt): Promise<void> => {
  noteLocalWrite('debts');
  const userId = supabase ? await getRequiredUserId() : null;
  const current = readLocal<Debt[]>(DEBT_STORAGE_KEY, userId, []);
  writeLocal(DEBT_STORAGE_KEY, userId, [debt, ...current.filter((item) => item.id !== debt.id)]);
  if (userId) await syncMutation({ userId, table: 'debts', action: 'upsert', recordId: debt.id, record: { ...debt } });
};

export const deleteDebt = async (id: string): Promise<void> => {
  noteLocalWrite('debts');
  const userId = supabase ? await getRequiredUserId() : null;
  const current = readLocal<Debt[]>(DEBT_STORAGE_KEY, userId, []);
  writeLocal(DEBT_STORAGE_KEY, userId, current.filter((item) => item.id !== id));
  if (userId) await syncMutation({ userId, table: 'debts', action: 'delete', recordId: id });
};

export const getGoals = async (): Promise<Goal[]> => {
  const userId = supabase ? await getRequiredUserId() : null;
  const local = readLocal<Goal[]>(GOAL_STORAGE_KEY, userId, []);
  if (!supabase) return local;

  try {
    const version = writeVersion('goals');
    await prepareCloudRead('goals');
    const { data, error } = await supabase.from('goals').select('*').eq('user_id', userId);
    if (error) throw error;
    // A save landed while this read was out; this device's copy is newer.
    if (changedLocallySince('goals', version)) return readLocal<Goal[]>(GOAL_STORAGE_KEY, userId, []);
    const remote = (data ?? []).map((row) => stripOwner(row as Goal & { user_id?: string }));
    if (remote.length === 0 && local.length > 0) {
      const migrated = await migrateLegacyRowsIfNeeded(GOAL_STORAGE_KEY, 'goals', userId, local);
      if (migrated) return migrated;
    }
    finishLegacyAdoption(GOAL_STORAGE_KEY, userId);
    writeLocal(GOAL_STORAGE_KEY, userId, remote);
    noteCloudReadSuccess();
    return remote;
  } catch (error) {
    noteCloudReadFailure(error);
    return local;
  }
};

export const saveGoal = async (goal: Goal): Promise<void> => {
  noteLocalWrite('goals');
  const userId = supabase ? await getRequiredUserId() : null;
  const current = readLocal<Goal[]>(GOAL_STORAGE_KEY, userId, []);
  writeLocal(GOAL_STORAGE_KEY, userId, [goal, ...current.filter((item) => item.id !== goal.id)]);
  if (userId) await syncMutation({ userId, table: 'goals', action: 'upsert', recordId: goal.id, record: { ...goal } });
};

export const deleteGoal = async (id: string): Promise<void> => {
  noteLocalWrite('goals');
  const userId = supabase ? await getRequiredUserId() : null;
  const current = readLocal<Goal[]>(GOAL_STORAGE_KEY, userId, []);
  writeLocal(GOAL_STORAGE_KEY, userId, current.filter((item) => item.id !== id));
  if (userId) await syncMutation({ userId, table: 'goals', action: 'delete', recordId: id });
};

export type PlannerKind = 'settings' | 'card' | 'bill' | 'statement' | 'bill_payment' | 'cycle' | 'card_usage' | 'card_breakdown';

// Pay-cycle planner entities share one table with a JSON body, so new fields
// never need a schema change. The id is unique per user, not globally.
export interface PlannerRecord {
  id: string;
  kind: PlannerKind;
  data: unknown;
  updated_at: string;
}

export const getPlannerRecords = async (): Promise<PlannerRecord[]> => {
  const userId = supabase ? await getRequiredUserId() : null;
  const local = readLocal<PlannerRecord[]>(PLANNER_KEY, userId, []);
  if (!supabase) return local;

  try {
    const version = writeVersion('planner_records');
    await prepareCloudRead('planner_records');
    const { data, error } = await supabase.from('planner_records').select('id, kind, data, updated_at').eq('user_id', userId);
    if (error) throw error;
    // A save landed while this read was out; this device's copy is newer.
    if (changedLocallySince('planner_records', version)) return readLocal<PlannerRecord[]>(PLANNER_KEY, userId, []);
    const remote = (data ?? []) as PlannerRecord[];
    writeLocal(PLANNER_KEY, userId, remote);
    noteCloudReadSuccess();
    return remote;
  } catch (error) {
    noteCloudReadFailure(error);
    return local;
  }
};

export const savePlannerRecord = async (kind: PlannerKind, id: string, data: unknown): Promise<PlannerRecord> => {
  noteLocalWrite('planner_records');
  const userId = supabase ? await getRequiredUserId() : null;
  const record: PlannerRecord = { id, kind, data, updated_at: new Date().toISOString() };
  const current = readLocal<PlannerRecord[]>(PLANNER_KEY, userId, []);
  writeLocal(PLANNER_KEY, userId, [record, ...current.filter((item) => item.id !== id)]);
  if (userId) await syncMutation({ userId, table: 'planner_records', action: 'upsert', recordId: id, record: { ...record } });
  return record;
};

export const deletePlannerRecord = async (id: string): Promise<void> => {
  noteLocalWrite('planner_records');
  const userId = supabase ? await getRequiredUserId() : null;
  const current = readLocal<PlannerRecord[]>(PLANNER_KEY, userId, []);
  writeLocal(PLANNER_KEY, userId, current.filter((item) => item.id !== id));
  if (userId) await syncMutation({ userId, table: 'planner_records', action: 'delete', recordId: id });
};

export const clearLocalFinancialData = (userId: string) => {
  [STORAGE_KEY, DEBT_STORAGE_KEY, GOAL_STORAGE_KEY, RECURRING_KEY, PLANNER_KEY]
    .forEach((key) => localStorage.removeItem(scopedKey(key, userId)));
  const remaining = getOutbox().filter((item) => item.userId !== userId);
  localStorage.setItem(OUTBOX_KEY, JSON.stringify(remaining));
  emitSyncSnapshot({ lastError: null, lastSyncedAt: null });
};
