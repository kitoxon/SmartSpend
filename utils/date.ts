export const toLocalDateInput = (value: string | Date) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-CA');
};

export const localDateInputToIso = (value: string) => {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) throw new Error('Invalid date');
  return date.toISOString();
};

export const addDaysClamped = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

export const addMonthsClamped = (date: Date, months: number, preferredDay = date.getDate()) => {
  const next = new Date(date);
  const targetMonth = next.getMonth() + months;
  next.setDate(1);
  next.setMonth(targetMonth);
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(Math.max(1, preferredDay), lastDay));
  return next;
};

export const getNextRecurringDate = (
  date: Date,
  frequency: 'weekly' | 'monthly',
  anchorDay?: number
) => frequency === 'weekly'
  ? addDaysClamped(date, 7)
  : addMonthsClamped(date, 1, anchorDay ?? date.getDate());

export const deterministicUuid = async (seed: string) => {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(seed)));
  const uuidBytes = bytes.slice(0, 16);
  uuidBytes[6] = (uuidBytes[6] & 0x0f) | 0x50;
  uuidBytes[8] = (uuidBytes[8] & 0x3f) | 0x80;
  const hex = Array.from(uuidBytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
