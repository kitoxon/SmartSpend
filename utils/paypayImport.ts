import type { LocalDate } from './jpCalendar';
import { MerchantGroup, groupMerchants } from './merchants';

// Reads the transaction history CSV exported from the PayPay app (English or
// Japanese). Imports only explain where a card bill went; they never become
// expenses in the plan.

export interface PaypayPayment {
  date: LocalDate;
  merchant: string;
  amount: number; // Whole payment, every method
  credit: number; // Part charged to a credit card
  creditMethod: string | null; // e.g. "Credit VISA 3150"
  other: number; // Part paid with PayPay Points or Balance
}

export interface ImportedMonth {
  usageMonth: string;
  firstDate: LocalDate;
  lastDate: LocalDate;
  payments: number; // Payments that used the chosen card
  charged: number; // Total charged to the chosen card
  paidOtherWays: number; // Points and balance across all payments
  categories: MerchantGroup[];
  places: MerchantGroup[]; // By brand, largest first
}

/** Minimal RFC 4180 parser: quoted fields, escaped quotes, CRLF. */
export const parseCsv = (text: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const source = text.replace(/^﻿/, '');
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') {
        field += '"';
        index++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[index + 1] === '\n') index++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cell) => cell.trim()));
};

const yen = (value: string | undefined) => {
  const digits = (value ?? '').replace(/[,\s円yen¥]/gi, '');
  return /^\d+$/.test(digits) ? Number(digits) : 0;
};

const COLUMNS = {
  date: ['Date & Time', '取引日'],
  outgoing: ['Amount Outgoing (Yen)', '出金金額'],
  incoming: ['Amount Incoming (Yen)', '入金金額'],
  type: ['Transaction Type', '取引内容'],
  merchant: ['Business Name', '取引先'],
  method: ['Method', '取引方法'],
} as const;

const isCredit = (label: string) => /credit|クレジット/i.test(label);

/** Splits "PayPay Point (18yen), Credit VISA 3150 (82yen)" into its parts. */
const splitMethod = (method: string, amount: number) => {
  const parts = [...method.matchAll(/([^,(（]+)[(（]\s*([\d,]+)\s*(?:yen|円)\s*[)）]/gi)]
    .map((match) => ({ label: match[1].trim(), amount: yen(match[2]) }));
  if (parts.length === 0) parts.push({ label: method.trim(), amount });
  const credit = parts.filter((part) => isCredit(part.label));
  return {
    credit: credit.reduce((sum, part) => sum + part.amount, 0),
    creditMethod: credit[0]?.label ?? null,
    other: parts.filter((part) => !isCredit(part.label)).reduce((sum, part) => sum + part.amount, 0),
  };
};

export class NotPaypayHistoryError extends Error {
  constructor() {
    super("This doesn't look like a PayPay transaction history file.");
  }
}

export const parsePaypayHistory = (text: string): PaypayPayment[] => {
  const [header, ...rows] = parseCsv(text);
  if (!header) throw new NotPaypayHistoryError();
  const column = (names: readonly string[]) => header.findIndex((cell) => names.some((name) => cell.trim().startsWith(name)));
  const index = Object.fromEntries(Object.entries(COLUMNS).map(([key, names]) => [key, column(names)])) as Record<keyof typeof COLUMNS, number>;
  if (Object.values(index).some((position) => position < 0)) throw new NotPaypayHistoryError();

  return rows.flatMap((cells) => {
    const type = cells[index.type] ?? '';
    const date = (cells[index.date] ?? '').slice(0, 10).replace(/\//g, '-');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
    const isPayment = /^payment$|^支払い$/i.test(type.trim());
    const isRefund = /refund|返金/i.test(type);
    if (!isPayment && !isRefund) return [];
    const amount = isPayment ? yen(cells[index.outgoing]) : yen(cells[index.incoming]);
    if (amount <= 0) return [];
    const parts = splitMethod(cells[index.method] ?? '', amount);
    const sign = isRefund ? -1 : 1;
    return [{
      date,
      merchant: (cells[index.merchant] ?? '').trim(),
      amount: sign * amount,
      credit: sign * parts.credit,
      creditMethod: parts.creditMethod,
      other: sign * parts.other,
    }];
  });
};

export const creditMethodsIn = (payments: PaypayPayment[]) =>
  [...new Set(payments.map((payment) => payment.creditMethod).filter((method): method is string => Boolean(method)))];

/** One summary per month of the file, counting only what went on `creditMethod`. */
export const summarizePaypayHistory = (payments: PaypayPayment[], creditMethod: string): ImportedMonth[] => {
  const months = new Map<string, PaypayPayment[]>();
  for (const payment of payments) months.set(payment.date.slice(0, 7), [...(months.get(payment.date.slice(0, 7)) ?? []), payment]);

  return [...months.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([usageMonth, list]) => {
    const onCard = list.filter((payment) => payment.creditMethod === creditMethod && payment.credit !== 0);
    const { categories, places } = groupMerchants(onCard.map((payment) => ({ merchant: payment.merchant, amount: payment.credit })));
    const dates = list.map((payment) => payment.date).sort();
    return {
      usageMonth,
      firstDate: dates[0],
      lastDate: dates[dates.length - 1],
      payments: onCard.filter((payment) => payment.credit > 0).length,
      charged: onCard.reduce((sum, payment) => sum + payment.credit, 0),
      paidOtherWays: list.reduce((sum, payment) => sum + payment.other, 0),
      categories,
      places,
    };
  });
};
