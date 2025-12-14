import { Category, Transaction } from '../types';

export type HabitIntervalType = 'daily' | 'weekly' | 'monthly' | 'unknown';

export interface HabitPattern {
  habitId: string;
  category: Category;
  merchantKey: string | null;
  amountBucket: number | null;
  amountMedian: number;
  amountMad: number | null;
  intervalType: HabitIntervalType;
  intervalDaysMedian: number | null;
  dowProb: number[]; // 0..6
  timeWindowStartMin: number | null; // minutes from midnight (local)
  timeWindowEndMin: number | null;
  active: boolean;
  updatedAt: string; // ISO
}

export interface HabitReminderState {
  habitId: string;
  lastRemindedDate: string | null; // YYYY-MM-DD
  snoozedUntil: string | null; // YYYY-MM-DD
  dismissCountRecent: number;
}

export interface HabitReminderCandidate {
  habitId: string;
  title: string;
  message: string;
  category: Category;
  description: string;
  amount: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

const toLocalISODate = (d: Date) => d.toLocaleDateString('en-CA'); // YYYY-MM-DD

const startOfDay = (d: Date) => {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
};

const diffDays = (a: Date, b: Date) => {
  const da = startOfDay(a).getTime();
  const db = startOfDay(b).getTime();
  return Math.round((da - db) / DAY_MS);
};

const minutesFromMidnight = (d: Date) => d.getHours() * 60 + d.getMinutes();

const median = (nums: number[]) => {
  if (!nums.length) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const mad = (nums: number[]) => {
  if (nums.length < 3) return null;
  const m = median(nums);
  const deviations = nums.map((n) => Math.abs(n - m));
  return median(deviations);
};

const quantile = (nums: number[], q: number) => {
  if (!nums.length) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * clamp(q, 0, 1);
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] === undefined) return sorted[base];
  return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
};

const normalizeText = (s: string) =>
  s
    .toLowerCase()
    .replace(/\(recurring\)/g, '')
    .replace(/[^a-z\u3040-\u30ff\u4e00-\u9faf\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const merchantKeyFromDescription = (description: string) => {
  const normalized = normalizeText(description);
  if (!normalized) return null;

  const parts = normalized.split(' ').filter(Boolean);
  if (parts.length === 0) return null;

  // Drop extremely generic first tokens.
  const stop = new Set(['buy', 'paid', 'payment', 'fee', 'tax', 'card', 'cash', 'for', 'to', 'at', 'in']);
  const filtered = parts.filter((p) => !stop.has(p));
  const chosen = (filtered.length ? filtered : parts).slice(0, 2).join(' ');
  return chosen.length >= 3 ? chosen : null;
};

const amountBucket = (amount: number) => {
  const a = Math.abs(amount);
  if (a < 5000) return Math.round(a / 100) * 100;
  if (a < 20000) return Math.round(a / 500) * 500;
  return Math.round(a / 1000) * 1000;
};

const stableHash = (s: string) => {
  // djb2-ish, stable and fast. Output base36.
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (h * 33) ^ s.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
};

const habitIdFor = (category: Category, merchantKey: string | null, bucket: number | null) => {
  return stableHash([category, merchantKey ?? '', bucket ?? ''].join('|'));
};

export const buildHabitPatterns = (transactions: Transaction[], now = new Date()): HabitPattern[] => {
  const scheduleCutoff = new Date(now.getTime() - 56 * DAY_MS);
  const historyCutoff = new Date(now.getTime() - 180 * DAY_MS);
  const recent = transactions.filter((t) => {
    if (t.type !== 'expense') return false;
    if (t.category === Category.Debt || t.category === Category.Savings) return false;
    const dt = new Date(t.date);
    return dt >= historyCutoff;
  });

  const groups = new Map<string, Transaction[]>();

  for (const tx of recent) {
    const merchantKey = merchantKeyFromDescription(tx.description);
    const bucket = merchantKey ? null : amountBucket(tx.amount);
    const id = habitIdFor(tx.category, merchantKey, bucket);
    const list = groups.get(id) ?? [];
    list.push(tx);
    groups.set(id, list);
  }

  const patterns: HabitPattern[] = [];
  const nowIso = new Date().toISOString();
  const weeksObserved = Math.max(1, Math.ceil(diffDays(now, scheduleCutoff) / 7));

  for (const [id, list] of groups.entries()) {
    if (list.length < 3) continue;

    const byDate = [...list].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const amounts = byDate.map((t) => t.amount);
    const amountMedian = Math.round(median(amounts));
    const amountMad = mad(amounts);

    // Interval detection from gaps
    const gaps: number[] = [];
    for (let i = 1; i < byDate.length; i++) {
      const d0 = new Date(byDate[i - 1].date);
      const d1 = new Date(byDate[i].date);
      const gap = Math.abs(diffDays(d1, d0));
      if (gap > 0) gaps.push(gap);
    }
    const intervalDaysMedian = gaps.length ? Math.round(median(gaps)) : null;
    let intervalType: HabitIntervalType = 'unknown';
    if (intervalDaysMedian !== null) {
      if (intervalDaysMedian <= 2) intervalType = 'daily';
      else if (Math.abs(intervalDaysMedian - 7) <= 1) intervalType = 'weekly';
      else if (Math.abs(intervalDaysMedian - 30) <= 5) intervalType = 'monthly';
    }

    // DOW schedule
    const dowCounts = new Array(7).fill(0);
    for (const t of byDate) {
      const d = new Date(t.date);
      if (d < scheduleCutoff) continue;
      dowCounts[d.getDay()]++;
    }
    const dowProb = dowCounts.map((c) => clamp(c / weeksObserved, 0, 1));

    // Time window from created_at (best) else skip.
    const timeSamples: number[] = [];
    for (const t of byDate) {
      const ts = t.created_at ? new Date(t.created_at) : null;
      if (!ts || isNaN(ts.getTime())) continue;
      if (ts < scheduleCutoff) continue;
      timeSamples.push(minutesFromMidnight(ts));
    }
    let timeWindowStartMin: number | null = null;
    let timeWindowEndMin: number | null = null;
    if (timeSamples.length >= 5) {
      let start = Math.round(quantile(timeSamples, 0.25));
      let end = Math.round(quantile(timeSamples, 0.75));
      if (end - start < 90) {
        const mid = Math.round(median(timeSamples));
        start = mid - 45;
        end = mid + 45;
      }
      timeWindowStartMin = clamp(start, 0, 24 * 60);
      timeWindowEndMin = clamp(end, 0, 24 * 60);
    }

    const sample = byDate[byDate.length - 1];
    const merchantKey = merchantKeyFromDescription(sample.description);
    const bucket = merchantKey ? null : amountBucket(sample.amount);

    patterns.push({
      habitId: id,
      category: sample.category,
      merchantKey,
      amountBucket: bucket,
      amountMedian,
      amountMad: amountMad === null ? null : Math.round(amountMad),
      intervalType,
      intervalDaysMedian,
      dowProb,
      timeWindowStartMin,
      timeWindowEndMin,
      active: true,
      updatedAt: nowIso,
    });
  }

  return patterns;
};

export const findDueHabitReminder = (
  patterns: HabitPattern[],
  transactions: Transaction[],
  stateByHabitId: Record<string, HabitReminderState>,
  now = new Date()
): HabitReminderCandidate | null => {
  const today = toLocalISODate(now);
  const nowMin = minutesFromMidnight(now);
  const todayDow = now.getDay();
  const todayDom = now.getDate();

  const matchesPattern = (t: Transaction, pattern: HabitPattern) => {
    if (t.type !== 'expense') return false;
    if (t.category !== pattern.category) return false;
    if (pattern.merchantKey) return merchantKeyFromDescription(t.description) === pattern.merchantKey;
    if (pattern.amountBucket !== null) return amountBucket(t.amount) === pattern.amountBucket;
    return false;
  };

  const matchingTransactions = (pattern: HabitPattern) =>
    transactions
      .filter((t) => matchesPattern(t, pattern))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const hasMatchingToday = (pattern: HabitPattern) =>
    transactions.some((t) => toLocalISODate(new Date(t.date)) === today && matchesPattern(t, pattern));

  const startOfWeek = (d: Date) => {
    const copy = startOfDay(d);
    const day = copy.getDay();
    const diff = day === 0 ? -6 : 1 - day; // Monday start
    copy.setDate(copy.getDate() + diff);
    return copy;
  };

  const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);

  const scorePattern = (pattern: HabitPattern) => {
    const base = pattern.dowProb[todayDow] ?? 0;
    const intervalBoost = pattern.intervalType === 'daily' ? 0.2 : pattern.intervalType === 'weekly' ? 0.1 : 0;
    return base + intervalBoost;
  };

  const candidates = patterns
    .filter((p) => p.active)
    .map((pattern) => {
      const state = stateByHabitId[pattern.habitId];
      if (state?.snoozedUntil && state.snoozedUntil >= today) return null;
      if (state?.lastRemindedDate === today) return null;
      if (hasMatchingToday(pattern)) return null;

      const dow = pattern.dowProb[todayDow] ?? 0;

      const matches = matchingTransactions(pattern);
      const lastMatchDate = matches.length ? new Date(matches[matches.length - 1].date) : null;
      const daysSinceLast = lastMatchDate ? diffDays(now, lastMatchDate) : null;

      if (pattern.intervalType === 'weekly') {
        const weekStart = startOfWeek(now);
        const hasThisWeek = matches.some((t) => new Date(t.date) >= weekStart);
        if (hasThisWeek) return null;
        if (dow < 0.4) return null;
        if (nowMin < 12 * 60) return null;
        if (daysSinceLast !== null) {
          const expected = pattern.intervalDaysMedian ?? 7;
          if (daysSinceLast < expected - 1) return null;
        }
      } else if (pattern.intervalType === 'monthly') {
        const monthStart = startOfMonth(now);
        const hasThisMonth = matches.some((t) => new Date(t.date) >= monthStart);
        if (hasThisMonth) return null;
        if (nowMin < 12 * 60) return null;

        const doms = matches.slice(-6).map((t) => new Date(t.date).getDate());
        const expectedDom = doms.length >= 3 ? Math.round(median(doms)) : 1;
        const windowStart = clamp(expectedDom - 7, 1, 31);
        const windowEnd = clamp(expectedDom + 7, 1, 31);
        if (todayDom < windowStart || todayDom > windowEnd) return null;
      } else {
        // Daily/unknown: day-of-week + time-of-day window.
        if (dow < 0.6) return null;
        if (pattern.timeWindowEndMin !== null) {
          if (nowMin < pattern.timeWindowStartMin!) return null;
          if (nowMin > pattern.timeWindowEndMin! + 120) return null; // 2h grace
        } else {
          if (nowMin < 18 * 60) return null;
        }
      }

      const amount = pattern.amountMedian || 0;
      const merchant = pattern.merchantKey ? ` (${pattern.merchantKey})` : '';
      const intervalHint =
        pattern.intervalType === 'weekly'
          ? 'this week'
          : pattern.intervalType === 'monthly'
            ? 'this month'
            : 'today';
      return {
        pattern,
        candidate: {
          habitId: pattern.habitId,
          title: 'Quick reminder',
          message: `You usually log ${pattern.category}${merchant} around now. Did you miss it ${intervalHint}?`,
          category: pattern.category,
          description: pattern.merchantKey ? pattern.merchantKey : `${pattern.category}`,
          amount,
        },
        score: scorePattern(pattern),
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.score - a.score);

  return candidates[0]?.candidate ?? null;
};
