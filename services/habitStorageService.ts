import { supabase } from './supabaseClient';
import type { HabitPattern, HabitReminderState } from './habitService';

const HABIT_PATTERNS_KEY = 'smartspend_habit_patterns_v1';
const HABIT_STATE_KEY = 'smartspend_habit_state_v1';

const safeJsonParse = <T,>(raw: string | null, fallback: T): T => {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const getUserId = async () => {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
};

const scopedKey = (key: string, userId: string | null) => userId ? `${key}:${userId}` : key;

const readLocal = <T,>(key: string, userId: string | null, fallback: T) => {
  const current = localStorage.getItem(scopedKey(key, userId));
  if (current) return safeJsonParse<T>(current, fallback);
  const legacy = userId ? localStorage.getItem(key) : null;
  if (legacy) {
    localStorage.setItem(scopedKey(key, userId), legacy);
    return safeJsonParse<T>(legacy, fallback);
  }
  return fallback;
};

export const getHabitPatterns = async (): Promise<HabitPattern[]> => {
  const userId = await getUserId();
  if (supabase) {
    try {
      if (!userId) return [];
      const { data, error } = await supabase.from('habit_patterns').select('*').eq('user_id', userId);
      if (!error && data) {
        return (data as any[]).map((row) => ({
          habitId: row.habit_id,
          category: row.category,
          merchantKey: row.merchant_key ?? null,
          amountBucket: row.amount_bucket ?? null,
          amountMedian: Number(row.amount_median ?? 0),
          amountMad: row.amount_mad === null || row.amount_mad === undefined ? null : Number(row.amount_mad),
          intervalType: row.interval_type,
          intervalDaysMedian: row.interval_days_median ?? null,
          dowProb: row.dow_prob ?? new Array(7).fill(0),
          timeWindowStartMin: row.time_start_min ?? null,
          timeWindowEndMin: row.time_end_min ?? null,
          active: row.active ?? true,
          updatedAt: row.updated_at ?? new Date().toISOString(),
        })) as HabitPattern[];
      }
    } catch {
      // Fall back to local storage.
    }
  }

  return readLocal<HabitPattern[]>(HABIT_PATTERNS_KEY, userId, []);
};

export const saveHabitPatterns = async (patterns: HabitPattern[]): Promise<void> => {
  const userId = await getUserId();
  localStorage.setItem(scopedKey(HABIT_PATTERNS_KEY, userId), JSON.stringify(patterns));

  if (!supabase || !userId || patterns.length === 0) return;
  try {
    const rows = patterns.map((p) => ({
      habit_id: p.habitId,
      category: p.category,
      merchant_key: p.merchantKey,
      amount_bucket: p.amountBucket,
      amount_median: p.amountMedian,
      amount_mad: p.amountMad,
      interval_type: p.intervalType,
      interval_days_median: p.intervalDaysMedian,
      dow_prob: p.dowProb,
      time_start_min: p.timeWindowStartMin,
      time_end_min: p.timeWindowEndMin,
      active: p.active,
      updated_at: p.updatedAt,
      user_id: userId,
    }));
    await supabase.from('habit_patterns').upsert(rows, { onConflict: 'user_id,habit_id' });
  } catch {
    // Best-effort only.
  }
};

export const getHabitReminderState = async (): Promise<Record<string, HabitReminderState>> => {
  const userId = await getUserId();
  if (supabase) {
    try {
      if (!userId) return {};
      const { data, error } = await supabase.from('habit_reminder_state').select('*').eq('user_id', userId);
      if (!error && data) {
        const out: Record<string, HabitReminderState> = {};
        for (const row of data as any[]) {
          out[row.habit_id] = {
            habitId: row.habit_id,
            lastRemindedDate: row.last_reminded_date ?? null,
            snoozedUntil: row.snoozed_until ?? null,
            dismissCountRecent: row.dismiss_count_recent ?? 0,
          };
        }
        return out;
      }
    } catch {
      // Fall back to local storage.
    }
  }

  return readLocal<Record<string, HabitReminderState>>(HABIT_STATE_KEY, userId, {});
};

export const saveHabitReminderState = async (
  stateByHabitId: Record<string, HabitReminderState>
): Promise<void> => {
  const userId = await getUserId();
  localStorage.setItem(scopedKey(HABIT_STATE_KEY, userId), JSON.stringify(stateByHabitId));

  if (!supabase || !userId || Object.keys(stateByHabitId).length === 0) return;
  try {
    const rows = Object.values(stateByHabitId).map((s) => ({
      habit_id: s.habitId,
      last_reminded_date: s.lastRemindedDate,
      snoozed_until: s.snoozedUntil,
      dismiss_count_recent: s.dismissCountRecent,
      updated_at: new Date().toISOString(),
      user_id: userId,
    }));
    await supabase.from('habit_reminder_state').upsert(rows, { onConflict: 'user_id,habit_id' });
  } catch {
    // Best-effort only.
  }
};
