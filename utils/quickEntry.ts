import { Category, Transaction } from '../types';

// What the cash pad offers to fill in: notes used before, most relevant first,
// and shortcuts for things bought at the same price each time.

export interface NoteUse {
  note: string; // The latest spelling
  category: Category;
  amounts: number[]; // Newest first
  nearNow: number; // Times it was logged around this time of day
  last: number; // Newest use, in ms
}

const DAY_MINUTES = 24 * 60;
const AROUND_NOW_MINUTES = 90;

export const minuteOfDay = (date: Date) => date.getHours() * 60 + date.getMinutes();

const minutesApart = (a: number, b: number) => {
  const difference = Math.abs(a - b) % DAY_MINUTES;
  return Math.min(difference, DAY_MINUTES - difference);
};

export const noteOf = (transaction: Transaction) => transaction.description.replace(/^\(Recurring\)\s*/i, '').trim();

/**
 * Notes grouped per category, ignoring case. Ordered by how often each was
 * logged around this time of day on any day (coffee in the morning, lunch at
 * noon), then how often overall, then how recently. The time comes from
 * created_at, when the entry was logged; `date` is only the day.
 */
export const summarizeNotes = (transactions: Transaction[], nowMinute: number): NoteUse[] => {
  const newestFirst = [...transactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const uses = new Map<string, NoteUse>();
  for (const transaction of newestFirst) {
    const note = noteOf(transaction);
    if (!note) continue;
    const key = `${transaction.category}|${note.toLocaleLowerCase()}`;
    const use = uses.get(key) ?? { note, category: transaction.category, amounts: [], nearNow: 0, last: new Date(transaction.date).getTime() };
    use.amounts.push(transaction.amount);
    if (transaction.created_at && minutesApart(minuteOfDay(new Date(transaction.created_at)), nowMinute) <= AROUND_NOW_MINUTES) use.nearNow += 1;
    uses.set(key, use);
  }
  return [...uses.values()].sort((a, b) => b.nearNow - a.nearNow || b.amounts.length - a.amounts.length || b.last - a.last);
};

/**
 * The price something usually costs, if it has one: the same amount in most
 * of its last five entries (2 of 2, 2 of 3, 3 of 5). Lunch at a different
 * price each day has none. Ties go to the more recent amount, so a new price
 * takes over once it's the most common.
 */
export const usualPrice = (amountsNewestFirst: number[]) => {
  const recent = amountsNewestFirst.slice(0, 5);
  const counts = new Map<number, number>();
  for (const amount of recent) counts.set(amount, (counts.get(amount) ?? 0) + 1);
  // A Map keeps insertion order, newest first, so reduce keeps the newer amount on a tie.
  const [amount, count] = [...counts].reduce((best, entry) => (entry[1] > best[1] ? entry : best), [0, 0] as [number, number]);
  return count >= 2 && count / recent.length >= 0.6 ? amount : null;
};
