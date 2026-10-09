import { LocalDate, ymd, shiftMonthKey } from './jpCalendar';
import { MerchantGroup, groupMerchants } from './merchants';
import { parseCsv } from './paypayImport';

// Reads the statement CSV downloaded from the SMBC Vpass website (三井住友カード,
// Olive). Columns: use date, shop, user, payment type, -, payment month ('26/10),
// amount used, amount paid this time, -, foreign amount, currency, rate, date.
// Rows without a date are totals such as "リボ払いお支払い".

export interface VpassMonth {
  billingMonth: string; // Month the bill is paid
  usageMonth: string; // Purchases month: cards close at month end
  firstDate: LocalDate;
  lastDate: LocalDate;
  purchases: number; // Amount used, every line
  count: number;
  foreignCount: number;
  revolving: boolean; // Any line on リボ払い
  billed: number | null; // This month's payment from the statement
  categories: MerchantGroup[];
  places: MerchantGroup[];
}

export class NotVpassStatementError extends Error {
  constructor() {
    super("This doesn't look like a Vpass statement file.");
  }
}

const amount = (value: string | undefined) => {
  const cleaned = (value ?? '').replace(/[,\s円¥]/g, '');
  return /^-?\d+$/.test(cleaned) ? Number(cleaned) : null;
};

const billingMonthOf = (value: string | undefined) => {
  const match = (value ?? '').trim().match(/^'?(\d{2}|\d{4})\/(\d{1,2})$/);
  if (!match) return null;
  const year = match[1].length === 2 ? 2000 + Number(match[1]) : Number(match[1]);
  return `${year}-${String(Number(match[2])).padStart(2, '0')}`;
};

const useDateOf = (value: string | undefined) => {
  const match = (value ?? '').trim().match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  return match ? ymd(Number(match[1]), Number(match[2]), Number(match[3])) : null;
};

export const parseVpassStatement = (text: string): VpassMonth[] => {
  const months = new Map<string, {
    lines: { date: LocalDate; merchant: string; amount: number; foreign: boolean; revolving: boolean }[];
    totals: { label: string; amount: number }[];
    paid: number[];
  }>();

  for (const cells of parseCsv(text)) {
    const billingMonth = billingMonthOf(cells[5]);
    if (!billingMonth) continue; // Header lines such as the cardholder name
    const month = months.get(billingMonth) ?? { lines: [], totals: [], paid: [] };
    months.set(billingMonth, month);
    const used = amount(cells[6]);
    const paidNow = amount(cells[7]);
    const date = useDateOf(cells[0]);
    if (!date) {
      // A total row; its payment amount is the bill.
      const total = paidNow ?? used;
      if (total !== null) month.totals.push({ label: (cells[1] ?? '').trim(), amount: total });
      continue;
    }
    if (used === null) continue;
    month.lines.push({
      date,
      merchant: (cells[1] ?? '').trim(),
      amount: used,
      foreign: Boolean((cells[10] ?? '').trim()),
      revolving: /リボ/.test(cells[3] ?? ''),
    });
    if (paidNow !== null) month.paid.push(paidNow);
  }

  if (![...months.values()].some((month) => month.lines.length > 0)) throw new NotVpassStatementError();

  return [...months.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([billingMonth, month]) => {
    // One total row is the bill; with several, a "合計" row is the overall total.
    const grand = month.totals.find((total) => /合計/.test(total.label));
    const billed = month.totals.length === 1
      ? month.totals[0].amount
      : grand?.amount ?? (month.totals.length ? month.totals.reduce((sum, total) => sum + total.amount, 0) : month.paid.length ? month.paid.reduce((sum, value) => sum + value, 0) : null);
    const dates = month.lines.map((line) => line.date).sort();
    return {
      billingMonth,
      usageMonth: shiftMonthKey(billingMonth, -1),
      firstDate: dates[0],
      lastDate: dates[dates.length - 1],
      purchases: month.lines.reduce((sum, line) => sum + line.amount, 0),
      count: month.lines.filter((line) => line.amount > 0).length,
      foreignCount: month.lines.filter((line) => line.foreign).length,
      revolving: month.lines.some((line) => line.revolving),
      billed,
      ...groupMerchants(month.lines),
    };
  });
};
