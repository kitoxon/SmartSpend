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

export const getHabitPatterns = async (): Promise<HabitPattern[]> => {
  if (supabase) {
    try {
      const { data, error } = await supabase.from('habit_patterns').select('*');
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

  return safeJsonParse<HabitPattern[]>(localStorage.getItem(HABIT_PATTERNS_KEY), []);
};

export const saveHabitPatterns = async (patterns: HabitPattern[]): Promise<void> => {
  localStorage.setItem(HABIT_PATTERNS_KEY, JSON.stringify(patterns));

  if (!supabase) return;
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
    }));
    await supabase.from('habit_patterns').upsert(rows, { onConflict: 'habit_id' });
  } catch {
    // Best-effort only.
  }
};

export const getHabitReminderState = async (): Promise<Record<string, HabitReminderState>> => {
  if (supabase) {
    try {
      const { data, error } = await supabase.from('habit_reminder_state').select('*');
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

  return safeJsonParse<Record<string, HabitReminderState>>(localStorage.getItem(HABIT_STATE_KEY), {});
};

export const saveHabitReminderState = async (
  stateByHabitId: Record<string, HabitReminderState>
): Promise<void> => {
  localStorage.setItem(HABIT_STATE_KEY, JSON.stringify(stateByHabitId));

  if (!supabase) return;
  try {
    const rows = Object.values(stateByHabitId).map((s) => ({
      habit_id: s.habitId,
      last_reminded_date: s.lastRemindedDate,
      snoozed_until: s.snoozedUntil,
      dismiss_count_recent: s.dismissCountRecent,
      updated_at: new Date().toISOString(),
    }));
    await supabase.from('habit_reminder_state').upsert(rows, { onConflict: 'habit_id' });
  } catch {
    // Best-effort only.
  }
};

