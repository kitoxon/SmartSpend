import type { BusinessDayShift } from '../types';

// Calendar dates are handled as local 'YYYY-MM-DD' strings so that paydays and
// due dates never drift by a day across time zones.

export type LocalDate = string;

const pad = (n: number) => String(n).padStart(2, '0');

export const ymd = (year: number, month: number, day: number): LocalDate => `${year}-${pad(month)}-${pad(day)}`;

export const parseLocalDate = (value: LocalDate) => {
  const [year, month, day] = value.split('-').map(Number);
  return { year, month, day };
};

export const toDate = (value: LocalDate) => {
  const { year, month, day } = parseLocalDate(value);
  return new Date(year, month - 1, day, 12);
};

export const fromDate = (date: Date): LocalDate => ymd(date.getFullYear(), date.getMonth() + 1, date.getDate());

export const todayLocalDate = () => fromDate(new Date());

export const daysInMonth = (year: number, month: number) => new Date(year, month, 0).getDate();

export const addDays = (value: LocalDate, days: number) => {
  const date = toDate(value);
  date.setDate(date.getDate() + days);
  return fromDate(date);
};

export const diffDays = (from: LocalDate, to: LocalDate) =>
  Math.round((toDate(to).getTime() - toDate(from).getTime()) / 86_400_000);

export const weekday = (value: LocalDate) => toDate(value).getDay();

/** 'YYYY-MM' month key shifted by `delta` months. */
export const shiftMonthKey = (key: string, delta: number) => {
  const [year, month] = key.split('-').map(Number);
  const date = new Date(year, month - 1 + delta, 1);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
};

export const monthKeyOf = (value: LocalDate) => value.slice(0, 7);

/** Whole months from one 'YYYY-MM' key to another. */
export const monthsBetween = (from: string, to: string) => {
  const [fromYear, fromMonth] = from.split('-').map(Number);
  const [toYear, toMonth] = to.split('-').map(Number);
  return (toYear - fromYear) * 12 + (toMonth - fromMonth);
};

const nthMonday = (year: number, month: number, n: number) => {
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const firstMonday = 1 + ((8 - firstWeekday) % 7);
  return ymd(year, month, firstMonday + (n - 1) * 7);
};

// Astronomical approximations used by the Cabinet Office; valid 1980–2099.
const vernalEquinoxDay = (year: number) =>
  Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
const autumnalEquinoxDay = (year: number) =>
  Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));

const holidayCache = new Map<number, Set<LocalDate>>();

/** Japanese national holidays under the rules in force since 2020. */
export const nationalHolidays = (year: number): Set<LocalDate> => {
  const cached = holidayCache.get(year);
  if (cached) return cached;

  const base = new Set<LocalDate>([
    ymd(year, 1, 1),
    nthMonday(year, 1, 2),
    ymd(year, 2, 11),
    ymd(year, 2, 23),
    ymd(year, 3, vernalEquinoxDay(year)),
    ymd(year, 4, 29),
    ymd(year, 5, 3),
    ymd(year, 5, 4),
    ymd(year, 5, 5),
    nthMonday(year, 7, 3),
    ymd(year, 8, 11),
    nthMonday(year, 9, 3),
    ymd(year, 9, autumnalEquinoxDay(year)),
    nthMonday(year, 10, 2),
    ymd(year, 11, 3),
    ymd(year, 11, 23),
  ]);

  const holidays = new Set(base);
  for (const holiday of base) {
    // A day sandwiched between two holidays is a citizens' holiday.
    const between = addDays(holiday, 1);
    if (!base.has(between) && base.has(addDays(holiday, 2)) && weekday(between) !== 0) holidays.add(between);
  }
  for (const holiday of base) {
    // A holiday on Sunday moves to the next day that is not already a holiday.
    if (weekday(holiday) !== 0) continue;
    let substitute = addDays(holiday, 1);
    while (holidays.has(substitute)) substitute = addDays(substitute, 1);
    holidays.add(substitute);
  }

  holidayCache.set(year, holidays);
  return holidays;
};

export const isNationalHoliday = (value: LocalDate) => nationalHolidays(parseLocalDate(value).year).has(value);

/** Banks are closed on weekends, national holidays, and Dec 31 – Jan 3. */
export const isBankBusinessDay = (value: LocalDate) => {
  const day = weekday(value);
  if (day === 0 || day === 6) return false;
  const { month, day: date } = parseLocalDate(value);
  if ((month === 12 && date === 31) || (month === 1 && date <= 3)) return false;
  return !isNationalHoliday(value);
};

export const shiftToBusinessDay = (value: LocalDate, shift: BusinessDayShift) => {
  if (shift === 'none') return value;
  const step = shift === 'next' ? 1 : -1;
  let current = value;
  while (!isBankBusinessDay(current)) current = addDays(current, step);
  return current;
};

/** The given day of a month, clamped to the month's length ('last' = final day). */
export const dayOfMonth = (monthKey: string, day: number | 'last') => {
  const [year, month] = monthKey.split('-').map(Number);
  const last = daysInMonth(year, month);
  return ymd(year, month, day === 'last' ? last : Math.min(Math.max(1, day), last));
};

export const formatShortDate = (value: LocalDate) =>
  toDate(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

export const formatWeekdayDate = (value: LocalDate) =>
  toDate(value).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
