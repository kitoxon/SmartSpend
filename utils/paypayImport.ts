import type { LocalDate } from './jpCalendar';

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

export interface ImportedCategory {
  label: string;
  amount: number;
  count: number;
}

export interface ImportedMonth {
  usageMonth: string;
  firstDate: LocalDate;
  lastDate: LocalDate;
  payments: number; // Payments that used the chosen card
  charged: number; // Total charged to the chosen card
  paidOtherWays: number; // Points and balance across all payments
  categories: ImportedCategory[];
  places: ImportedCategory[]; // By brand, largest first
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

// First matching rule wins; keywords match common Japanese chains.
const CATEGORY_RULES: [string, RegExp][] = [
  ['Food delivery', /rocket now|uber ?eats|出前館|wolt|menu|demae/i],
  ['Convenience stores', /セブン-?イレブン|ローソン|ファミリーマート|ミニストップ|デイリーヤマザキ|セイコーマート|newdays|ポプラ/i],
  ['Groceries', /イオン|マックスバリュ|西友|ライフ|イトーヨーカドー|サニー|トライアル|ハローデイ|マルショク|ゆめタウン|業務スーパー|スーパー|ドン・?キホーテ|成城石井|カルディ/i],
  ['Drugstores', /マツモトキヨシ|ウエルシア|ツルハ|サンドラッグ|コスモス|スギ薬局|ダイコク|ドラッグ|薬局/i],
  ['Restaurants and cafes', /マクドナルド|すき家|吉野家|松屋|ガスト|ロイヤル|サイゼリヤ|スターバックス|starbucks|ドトール|タリーズ|コメダ|ケンタッキー|モスバーガー|丸亀|一蘭|やよい軒|大戸屋|ココイチ|くら寿司|スシロー|はま寿司|caf|カフェ|食堂|ラーメン|そば|うどん|寿司|焼肉|居酒屋|亭/i],
  ['Transport', /jr|西鉄|地下鉄|交通|タクシー|taxi|\bgo\b|駐車|パーキング|ガソリン|eneos|出光/i],
  ['Sports and hobbies', /空手|道場|武道|ジム|フィットネス|スポーツ|ゴルフ|ボウリング|プール|ヨガ|gym|sports/i],
  ['Entertainment', /ソフトバンクホークス|hub|カラオケ|映画|シネマ|ゲーム|ライブ|チケット/i],
  ['Shopping', /ダイソー|セリア|ユニクロ|gu\b|無印|ニトリ|amazon|楽天|ビックカメラ|ヨドバシ|ロフト|ハンズ/i],
  ['Vending machines', /ベンディング|自販機|vending/i],
];

export const categorizeMerchant = (merchant: string) => CATEGORY_RULES.find(([, rule]) => rule.test(merchant))?.[0] ?? 'Other';

/** "ローソン - 平尾一丁目" → "ローソン": branches of a chain count as one place. */
export const merchantBrand = (merchant: string) => merchant.split(' - ')[0].trim() || merchant;

const rank = (groups: Map<string, ImportedCategory>) =>
  [...groups.values()].filter((group) => group.amount > 0).sort((a, b) => b.amount - a.amount);

/** One summary per month of the file, counting only what went on `creditMethod`. */
export const summarizePaypayHistory = (payments: PaypayPayment[], creditMethod: string): ImportedMonth[] => {
  const months = new Map<string, PaypayPayment[]>();
  for (const payment of payments) months.set(payment.date.slice(0, 7), [...(months.get(payment.date.slice(0, 7)) ?? []), payment]);

  return [...months.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([usageMonth, list]) => {
    const onCard = list.filter((payment) => payment.creditMethod === creditMethod && payment.credit !== 0);
    const categories = new Map<string, ImportedCategory>();
    const places = new Map<string, ImportedCategory>();
    for (const payment of onCard) {
      for (const [groups, key] of [[categories, categorizeMerchant(payment.merchant)], [places, merchantBrand(payment.merchant)]] as const) {
        const group = groups.get(key) ?? { label: key, amount: 0, count: 0 };
        group.amount += payment.credit;
        group.count += payment.credit > 0 ? 1 : 0;
        groups.set(key, group);
      }
    }
    const dates = list.map((payment) => payment.date).sort();
    return {
      usageMonth,
      firstDate: dates[0],
      lastDate: dates[dates.length - 1],
      payments: onCard.filter((payment) => payment.credit > 0).length,
      charged: onCard.reduce((sum, payment) => sum + payment.credit, 0),
      paidOtherWays: list.reduce((sum, payment) => sum + payment.other, 0),
      categories: rank(categories),
      places: rank(places).slice(0, 8),
    };
  });
};
