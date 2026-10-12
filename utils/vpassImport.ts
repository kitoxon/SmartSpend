import { LocalDate, monthKeyOf, ymd, shiftMonthKey } from './jpCalendar';
import { MerchantGroup, groupMerchants } from './merchants';
import { parseCsv } from './paypayImport';

// Reads the statement CSVs downloaded from the SMBC Vpass website (三井住友カード,
// Olive). Both start with a line naming the cardholder, the masked card number
// and the card (Ｏｌｉｖｅ／クレジット), and rows without a date are totals such as
// "リボ払いお支払い". Two layouts exist:
// - with a payment month: use date, shop, user, payment type, -, payment month
//   ('26/10), amount used, amount paid this time, -, foreign amount, currency, rate, date;
// - without one: use date, shop, amount used, -, -, amount paid this time, and the
//   foreign details in one cell ("13.96　USD　161.816　09 18").

export interface VpassMonth {
  billingMonth: string; // Month the bill is paid
  usageMonth: string; // Purchases month: cards close at month end
  firstDate: LocalDate;
  lastDate: LocalDate;
  purchases: number; // Amount used, every line
  count: number;
  foreignCount: number;
  revolving: boolean; // Any line or total on リボ払い
  billed: number | null; // This month's payment from the statement
  cardName?: string; // As the file names it, such as "Ｏｌｉｖｅ／クレジット"
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

const CARD_NUMBER = /^\s*\d{4}-[\d*]{4}-[\d*]{4}-[\d*]{4}\s*$/;
// Rows of the layout without a payment month; their month comes from the dates.
const NO_MONTH = 'no-month';

type MonthRows = {
  lines: { date: LocalDate; merchant: string; amount: number; foreign: boolean; revolving: boolean }[];
  totals: { label: string; amount: number }[];
  paid: number[];
};

export const parseVpassStatement = (text: string): VpassMonth[] => {
  const months = new Map<string, MonthRows>();
  let cardName: string | undefined;

  for (const cells of parseCsv(text)) {
    if (CARD_NUMBER.test(cells[1] ?? '')) {
      cardName = (cells[2] ?? '').trim() || undefined;
      continue;
    }
    const billingMonth = billingMonthOf(cells[5]);
    const row = billingMonth
      ? { key: billingMonth, used: amount(cells[6]), paidNow: amount(cells[7]), foreign: cells[10], revolving: /リボ/.test(cells[3] ?? '') }
      : { key: NO_MONTH, used: amount(cells[2]), paidNow: amount(cells[5]), foreign: cells[6], revolving: false };
    const month = months.get(row.key) ?? { lines: [], totals: [], paid: [] };
    months.set(row.key, month);
    const date = useDateOf(cells[0]);
    if (!date) {
      // A total row; its payment amount is the bill.
      const total = row.paidNow ?? row.used;
      if (total !== null) month.totals.push({ label: (cells[1] ?? '').trim(), amount: total });
      continue;
    }
    if (row.used === null) continue;
    month.lines.push({
      date,
      merchant: (cells[1] ?? '').trim(),
      amount: row.used,
      foreign: Boolean((row.foreign ?? '').trim()),
      revolving: row.revolving,
    });
    if (row.paidNow !== null) month.paid.push(row.paidNow);
  }

  // Cards close at month end, so the latest purchase is in the month the statement covers.
  const noMonth = months.get(NO_MONTH);
  months.delete(NO_MONTH);
  if (noMonth?.lines.length) {
    const latest = noMonth.lines.map((line) => line.date).sort().at(-1)!;
    months.set(shiftMonthKey(monthKeyOf(latest), 1), noMonth);
  }

  if (![...months.values()].some((month) => month.lines.length > 0)) throw new NotVpassStatementError();

  return [...months.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([billingMonth, month]) => {
    // One total row is the bill. With several, the overall total: a "合計" row,
    // or the unlabelled row that ends the statement.
    const grand = month.totals.find((total) => /合計/.test(total.label)) ?? month.totals.find((total) => total.label === '');
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
      revolving: month.lines.some((line) => line.revolving) || month.totals.some((total) => /リボ/.test(total.label)),
      billed,
      ...(cardName ? { cardName } : {}),
      ...groupMerchants(month.lines),
    };
  });
};

interface CardLike {
  id: string;
  name: string;
}

interface ImportedMonthLike {
  cardId: string;
  usageMonth: string;
  source: string;
  places: MerchantGroup[];
}

// Words in card names that don't tell one SMBC card from another.
const GENERIC_CARD_WORD = /^(card|credit|visa|master|mastercard|jcb|gold|platinum|classic|smbc|mitsui|sumitomo)$/;

/** Whether the card name in a statement (Ｏｌｉｖｅ／クレジット) matches a card's name (Olive). */
const namesCard = (statementCardName: string, cardName: string) => {
  const named = statementCardName.normalize('NFKC').toLowerCase();
  return cardName.normalize('NFKC').toLowerCase().split(/[^a-z0-9]+/)
    .some((word) => word.length >= 3 && !GENERIC_CARD_WORD.test(word) && named.includes(word));
};

/**
 * Which card a statement most likely belongs to: the card the file names,
 * if it matches one; then shops seen on a card's earlier statements (gas,
 * phone, Prime repeat monthly), then a card not yet imported for this month,
 * then the Amazon card only if most purchases are at Amazon.
 */
export const guessStatementCard = <C extends CardLike>(months: VpassMonth[], cards: C[], imported: ImportedMonthLike[]) => {
  const candidates = cards.filter((card) => !/paypay/i.test(card.name));
  if (candidates.length === 0) return cards[0];

  const statementCardName = months.find((month) => month.cardName)?.cardName;
  const named = statementCardName ? candidates.find((card) => namesCard(statementCardName, card.name)) : undefined;
  if (named) return named;

  const shops = new Set(months.flatMap((month) => month.places.map((place) => place.label)));
  const overlap = (card: C) => imported
    .filter((item) => item.cardId === card.id && item.source === 'vpass')
    .reduce((count, item) => count + item.places.filter((place) => shops.has(place.label)).length, 0);
  const best = [...candidates].sort((a, b) => overlap(b) - overlap(a))[0];
  if (overlap(best) > 0) return best;

  const notImported = candidates.filter((card) => !imported.some((item) => item.cardId === card.id && months.some((month) => month.usageMonth === item.usageMonth)));
  const pool = notImported.length ? notImported : candidates;
  const total = months.reduce((sum, month) => sum + month.purchases, 0);
  const atAmazon = months.reduce((sum, month) => sum + month.places.filter((place) => /amazon/i.test(place.label)).reduce((s, place) => s + place.amount, 0), 0);
  const isAmazon = (card: C) => /amazon/i.test(card.name);
  return (total > 0 && atAmazon / total >= 0.5 ? pool.find(isAmazon) : pool.find((card) => !isAmazon(card))) ?? pool[0];
};
