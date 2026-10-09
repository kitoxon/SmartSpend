import React, { useMemo, useState } from 'react';
import { ArrowRight, Pencil } from 'lucide-react';
import { Card, CardBreakdown, CardStatement, CardUsage, Debt, PlannerData } from '../types';
import {
  averageCardUsage, cardDueDate, cycleForDate, getCycle, monthlyInterest, projectCardUsage, scheduledPrincipal, unusuallyHighBy, usageMonthsDueIn,
  usualPaceBy,
} from '../utils/payCycle';
import { LocalDate, formatShortDate, fromDate, monthKeyOf, shiftMonthKey } from '../utils/jpCalendar';
import { formatMonthName, formatYen, parseAmount } from '../utils/format';
import { AmountInput } from './ui/AmountInput';
import { CardBreakdowns, ImportedBill } from './CardBreakdowns';

interface CardsViewProps {
  data: PlannerData;
  debts: Debt[];
  today: LocalDate;
  latestSalary: number | null;
  onSaveUsage: (card: Card, usageMonth: string, amount: number) => Promise<void>;
  onImportBreakdowns: (breakdowns: CardBreakdown[], usages: CardUsage[], bills: ImportedBill[]) => Promise<void>;
  onDeleteBreakdown: (id: string) => Promise<void>;
  onOpenSetup: () => void;
  onOpenDebts: () => void;
}

// Fixed series order; Tailwind needs the full class names written out.
const SERIES_BG = ['bg-series-1', 'bg-series-2', 'bg-series-3', 'bg-series-4', 'bg-series-5'];
const seriesClass = (index: number) => SERIES_BG[index] ?? 'bg-ink-3';

const purchasesOn = (statement: CardStatement) => statement.amount - statement.installment;

const compactYen = (amount: number) => {
  if (amount >= 1_000_000) return `¥${(amount / 1_000_000).toFixed(amount % 1_000_000 === 0 ? 0 : 1)}M`;
  if (amount >= 1_000) return `¥${Math.round(amount / 1_000)}k`;
  return `¥${amount}`;
};

/** A round axis maximum: 1, 2 or 5 times a power of ten. */
const niceMax = (value: number) => {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 5, 10].find((candidate) => candidate * magnitude >= value) ?? 10;
  return step * magnitude;
};

const shortMonth = (monthKey: string) => {
  const [year, month] = monthKey.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: 'short' });
};

const Legend: React.FC<{ cards: Card[] }> = ({ cards }) => (
  <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
    {cards.map((card, index) => (
      <li key={card.id} className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${seriesClass(index)}`} />{card.name}</li>
    ))}
  </ul>
);

/** Purchases on a card in a month: its entered bill, else the latest typed total, else its usual amount. */
const expectedPurchases = (card: Card, month: string, data: PlannerData) => {
  const statement = data.statements.find((item) => item.cardId === card.id && item.usageMonth === month);
  if (statement) return { known: purchasesOn(statement), expected: purchasesOn(statement) };
  const usage = data.cardUsage.find((item) => item.cardId === card.id && item.usageMonth === month);
  const average = averageCardUsage(card.id, data.statements, month);
  return { known: usage?.amount ?? 0, expected: (usage ? projectCardUsage(usage, average) : average) ?? 0 };
};

const UsageRow: React.FC<{
  card: Card;
  index: number;
  month: string;
  closed: boolean;
  data: PlannerData;
  today: LocalDate;
  onSave: (amount: number) => Promise<void>;
}> = ({ card, index, month, closed, data, today, onSave }) => {
  const statement = data.statements.find((item) => item.cardId === card.id && item.usageMonth === month);
  const usage = data.cardUsage.find((item) => item.cardId === card.id && item.usageMonth === month);
  const average = averageCardUsage(card.id, data.statements, month);
  const projected = usage ? projectCardUsage(usage, average) : average;
  const pace = average !== null ? usualPaceBy(average, usage?.asOf ?? today) : null;
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(usage ? String(usage.amount) : '');
  const [saving, setSaving] = useState(false);

  const scaleMax = Math.max(average ?? 0, usage?.amount ?? 0, projected ?? 0, 1);
  const save = async () => {
    const amount = parseAmount(value);
    if (amount === null) return;
    setSaving(true);
    await onSave(amount);
    setSaving(false);
    setEditing(false);
  };

  const name = (
    <span className="flex min-w-0 items-center gap-2 text-sm text-ink"><span className={`h-2.5 w-2.5 shrink-0 rounded-full ${seriesClass(index)}`} /><span className="truncate">{card.name}</span></span>
  );

  // Once the bill is entered at check-in, it replaces any typed total.
  if (statement) {
    return (
      <li className="flex items-center justify-between gap-3 py-3">
        {name}
        <span className="shrink-0 text-right text-[13px]"><span className="tabular-nums text-ink">{formatYen(statement.amount)}</span> <span className="text-ink-3">bill entered</span></span>
      </li>
    );
  }

  const difference = usage && average !== null ? usage.amount - (closed ? average : pace ?? 0) : null;

  return (
    <li className="py-3">
      <div className="flex items-center justify-between gap-3">
        {name}
        {!editing && (
          <button type="button" onClick={() => setEditing(true)} className="btn-ghost -mr-2 shrink-0"><Pencil size={13} /> {usage ? 'Update' : 'Add total'}</button>
        )}
      </div>
      {editing ? (
        <form onSubmit={(event) => { event.preventDefault(); void save(); }} className="mt-2 flex gap-2">
          <AmountInput value={value} onChange={setValue} placeholder={closed ? 'Month total' : 'Used so far'} aria-label={`${card.name} ${closed ? 'month total' : 'used so far'}`} className="flex-1" autoFocus />
          <button type="button" onClick={() => setEditing(false)} className="btn px-3">Cancel</button>
          <button type="submit" disabled={saving || parseAmount(value) === null} className="btn-primary px-4">Save</button>
        </form>
      ) : (
        <>
          <p className="mt-1 text-[13px] text-ink-2">
            {usage
              ? <><span className="text-ink tabular-nums">{formatYen(usage.amount)}</span> {closed ? 'total' : 'so far'} · {formatShortDate(usage.asOf)}</>
              : closed ? 'No total yet. The card app shows the month total.' : 'No total yet this month'}
          </p>
          {usage && !closed && (
            <div className="relative mt-2 h-1.5 rounded-full bg-subtle" aria-hidden="true">
              <div className={`h-full rounded-full ${seriesClass(index)}`} style={{ width: `${(usage.amount / scaleMax) * 100}%` }} />
              {pace !== null && <span className="absolute -top-1 h-3.5 w-0.5 rounded-full bg-ink-3" style={{ left: `${(pace / scaleMax) * 100}%` }} />}
            </div>
          )}
          <div className="mt-1.5 flex flex-wrap justify-between gap-x-3 text-xs text-ink-3">
            {usage && difference !== null ? (
              <span>
                {closed ? `Usually ${formatYen(average ?? 0)}` : `Usual by now ${formatYen(pace ?? 0)}`}
                {Math.abs(difference) >= 1_000 && (
                  <span className={difference > 0 ? 'text-warn' : 'text-good'}> · {formatYen(difference)} {difference > 0 ? 'above' : 'below'}</span>
                )}
              </span>
            ) : <span>{average !== null ? `Usually ${formatYen(average)} a month` : 'No bills yet to compare with'}</span>}
            {projected !== null && !closed && <span>Expected about {formatYen(projected)}</span>}
          </div>
        </>
      )}
    </li>
  );
};

export const CardsView: React.FC<CardsViewProps> = ({
  data, debts, today, latestSalary, onSaveUsage, onImportBreakdowns, onDeleteBreakdown, onOpenSetup, onOpenDebts,
}) => {
  const cards = useMemo(() => data.cards.filter((card) => !card.archived), [data.cards]);
  const month = monthKeyOf(today);
  const [hovered, setHovered] = useState<number | null>(null);

  // Early in a month the next cycle still pays last month's purchases, so show that month too.
  const nextCycle = getCycle(shiftMonthKey(cycleForDate(today, data.settings).key, 1), data.settings);
  const usageMonths = [...new Set([...(cards[0] ? usageMonthsDueIn(cards[0], nextCycle) : []), month])].sort();

  // Twelve months of purchases, from the bills entered at check-in.
  const history = useMemo(() => {
    const months = Array.from({ length: 12 }, (_, index) => shiftMonthKey(month, index - 12));
    const rows = months.map((usageMonth) => {
      const perCard = cards.map((card) => {
        // On revolving payment the bill is less than what was bought; an
        // imported statement knows the real purchases.
        const imported = data.cardBreakdowns.find((item) => item.cardId === card.id && item.usageMonth === usageMonth && item.source === 'vpass');
        if (imported) return imported.charged;
        const statement = data.statements.find((item) => item.cardId === card.id && item.usageMonth === usageMonth);
        return statement ? purchasesOn(statement) : 0;
      });
      // Only the top segment of a stack gets the rounded data-end.
      const topIndex = perCard.reduce((top, amount, index) => (amount > 0 ? index : top), -1);
      return { usageMonth, perCard, topIndex, total: perCard.reduce((sum, amount) => sum + amount, 0) };
    });
    const firstWithData = rows.findIndex((row) => row.total > 0);
    return firstWithData === -1 ? [] : rows.slice(firstWithData);
  }, [cards, data.statements, data.cardBreakdowns, month]);

  const totals = history.map((row) => row.total);
  const last = history.at(-1) ?? null;
  const recent = totals.slice(-3).filter((total) => total > 0);
  const average = recent.length ? Math.round(recent.reduce((sum, total) => sum + total, 0) / recent.length) : null;
  const axisMax = niceMax(Math.max(...totals, average ?? 0));
  const salaryShare = last && latestSalary ? Math.round((last.total / latestSalary) * 100) : null;
  const earlier = totals.slice(-4, -1).filter((total) => total > 0);
  const earlierAverage = earlier.length ? Math.round(earlier.reduce((sum, total) => sum + total, 0) / earlier.length) : null;
  const lastChange = last && earlierAverage ? Math.round(((last.total - earlierAverage) / earlierAverage) * 100) : null;
  const lastIsHigh = last ? unusuallyHighBy(last.total, earlierAverage) !== null : false;

  const installments = debts.filter((debt) => debt.cardId && !debt.isPaid && debt.amount > 0);
  const cardName = (id?: string) => cards.find((card) => card.id === id)?.name ?? data.cards.find((card) => card.id === id)?.name ?? 'Card';

  if (cards.length === 0) {
    return (
      <div className="card px-6 py-12 text-center">
        <p className="text-sm text-ink">No cards yet</p>
        <p className="mt-1 text-[13px] text-ink-2">Add your credit cards to track their bills.</p>
        <button type="button" onClick={onOpenSetup} className="btn-primary mt-4">Set up cards</button>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-28">
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <div className="space-y-4">
          {usageMonths.map((usageMonth) => {
            const closed = usageMonth < month;
            const paidFrom = cycleForDate(cardDueDate(cards[0], usageMonth), data.settings);
            const totals = cards.map((card) => expectedPurchases(card, usageMonth, data));
            return (
              <section key={usageMonth} className="card p-5">
                <h2 className="text-sm font-medium text-ink">{formatMonthName(usageMonth)} purchases{closed ? '' : ' so far'}</h2>
                <p className="mt-0.5 text-xs leading-relaxed text-ink-3">
                  {closed
                    ? `Month closed · paid from the ${formatShortDate(paidFrom.start)} cycle. Enter each card's final total from its app.`
                    : `Paid from the ${formatShortDate(paidFrom.start)} cycle. Type each card's total from its app now and then.`}
                </p>
                <ul className="mt-1 divide-y divide-line">
                  {cards.map((card, index) => (
                    <UsageRow key={card.id} card={card} index={index} month={usageMonth} closed={closed} data={data} today={today} onSave={(amount) => onSaveUsage(card, usageMonth, amount)} />
                  ))}
                </ul>
                <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3 border-t border-line pt-3 text-sm">
                  <span className="text-ink-2">All cards</span>
                  <span className="tabular-nums">
                    <span className="text-ink">{formatYen(totals.reduce((sum, item) => sum + item.known, 0))}</span>
                    {!closed && <span className="text-ink-3"> so far · about {formatYen(totals.reduce((sum, item) => sum + item.expected, 0))} expected</span>}
                  </span>
                </div>
              </section>
            );
          })}
        </div>

        <section className="card p-5">
          <h2 className="text-sm font-medium text-ink">Purchases by month</h2>
          <p className="mt-0.5 text-xs text-ink-3">From each bill, or an imported statement, not counting split installments.</p>

          {history.length === 0 ? (
            <p className="mt-4 text-[13px] leading-relaxed text-ink-2">The card bills you enter at check-in build this chart.</p>
          ) : (
            <>
              <dl className="mt-4 grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-subtle p-3">
                  <dt className="text-xs text-ink-2">{last ? formatMonthName(last.usageMonth) : 'Last month'}</dt>
                  <dd className="mt-0.5 text-base font-medium text-ink">{formatYen(last?.total ?? 0)}</dd>
                  {lastChange !== null && (
                    <dd className={`text-xs ${lastIsHigh ? 'text-warn' : 'text-ink-3'}`}>{lastChange > 0 ? '+' : ''}{lastChange}% vs before</dd>
                  )}
                </div>
                <div className="rounded-lg bg-subtle p-3">
                  <dt className="text-xs text-ink-2">3-month average</dt>
                  <dd className="mt-0.5 text-base font-medium text-ink">{average !== null ? formatYen(average) : '—'}</dd>
                </div>
                <div className="rounded-lg bg-subtle p-3">
                  <dt className="text-xs text-ink-2">Of salary</dt>
                  <dd className="mt-0.5 text-base font-medium text-ink">{salaryShare !== null ? `${salaryShare}%` : '—'}</dd>
                </div>
              </dl>

              <div className="mt-4"><Legend cards={cards} /></div>

              <div className="relative mt-3 pl-10">
                {/* Gridlines with round tick values */}
                {[1, 0.5, 0].map((fraction) => (
                  <div key={fraction} className="absolute left-10 right-0 border-t border-line" style={{ bottom: `${fraction * 160 + 20}px` }}>
                    <span className="absolute -left-10 -top-2 w-9 text-right text-[11px] tabular-nums text-ink-3">{compactYen(axisMax * fraction)}</span>
                  </div>
                ))}
                {average !== null && (
                  <div className="pointer-events-none absolute left-10 right-0 z-[1] border-t border-ink-3" style={{ bottom: `${(average / axisMax) * 160 + 20}px` }}>
                    {/* Left end, so it never collides with the latest bar's label */}
                    <span className="absolute -top-4 left-0 bg-card pr-1 text-[11px] text-ink-3">avg {compactYen(average)}</span>
                  </div>
                )}
                <div className="relative flex h-[180px] items-end">
                  {history.map((row, index) => {
                    const isLast = index === history.length - 1;
                    return (
                      <button
                        key={row.usageMonth}
                        type="button"
                        onMouseEnter={() => setHovered(index)}
                        onMouseLeave={() => setHovered(null)}
                        onFocus={() => setHovered(index)}
                        onBlur={() => setHovered(null)}
                        aria-label={`${formatMonthName(row.usageMonth)}: ${formatYen(row.total)}`}
                        className="group relative flex h-full flex-1 flex-col items-center justify-end outline-none"
                      >
                        {isLast && row.total > 0 && (
                          <span className="mb-1 text-[11px] tabular-nums text-ink-2">{compactYen(row.total)}</span>
                        )}
                        <span className="flex w-full max-w-[24px] flex-col-reverse gap-[2px]" style={{ height: `${(row.total / axisMax) * 160}px` }}>
                          {row.perCard.map((amount, cardIndex) => amount > 0 && (
                            <span
                              key={cards[cardIndex].id}
                              className={`w-full ${seriesClass(cardIndex)} ${cardIndex === row.topIndex ? 'rounded-t-[4px]' : ''} ${hovered !== null && hovered !== index ? 'opacity-50' : ''}`}
                              style={{ flexGrow: amount, flexBasis: 0 }}
                            />
                          ))}
                        </span>
                        <span className="mt-1 h-[16px] text-[11px] text-ink-3">{history.length <= 6 || (history.length - 1 - index) % 2 === 0 ? shortMonth(row.usageMonth) : ''}</span>
                        {hovered === index && (
                          <span role="tooltip" className={`absolute bottom-full z-10 mb-1 w-56 rounded-lg border border-line bg-card p-2.5 text-left shadow-sm ${index > history.length / 2 ? 'right-0' : 'left-0'}`}>
                            <span className="block text-xs text-ink-2">{formatMonthName(row.usageMonth)}</span>
                            {row.perCard.map((amount, cardIndex) => (
                              <span key={cards[cardIndex].id} className="mt-1 flex items-center justify-between gap-2 text-xs">
                                <span className="flex min-w-0 items-center gap-1.5 text-ink-2"><span className={`h-0.5 w-2.5 shrink-0 rounded-full ${seriesClass(cardIndex)}`} /><span className="truncate">{cards[cardIndex].name}</span></span>
                                <span className="font-medium tabular-nums text-ink">{formatYen(amount)}</span>
                              </span>
                            ))}
                            <span className="mt-1.5 flex justify-between border-t border-line pt-1.5 text-xs"><span className="text-ink-2">Total</span><span className="font-medium tabular-nums text-ink">{formatYen(row.total)}</span></span>
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <details className="mt-3 text-[13px]">
                <summary className="cursor-pointer text-ink-2 hover:text-ink">Show the numbers</summary>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-xs tabular-nums">
                    <thead>
                      <tr className="text-ink-3">
                        <th className="py-1 pr-2 text-left font-normal">Month</th>
                        {cards.map((card) => <th key={card.id} className="py-1 pl-2 text-right font-normal">{card.name}</th>)}
                        <th className="py-1 pl-2 text-right font-normal">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {[...history].reverse().map((row) => (
                        <tr key={row.usageMonth} className="text-ink">
                          <td className="py-1.5 pr-2 text-ink-2">{formatMonthName(row.usageMonth)} {row.usageMonth.slice(0, 4)}</td>
                          {row.perCard.map((amount, cardIndex) => <td key={cards[cardIndex].id} className="py-1.5 pl-2 text-right">{amount ? formatYen(amount) : '—'}</td>)}
                          <td className="py-1.5 pl-2 text-right font-medium">{formatYen(row.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </>
          )}
        </section>
      </div>

      <CardBreakdowns data={data} cards={cards} seriesClass={seriesClass} today={today} onImport={onImportBreakdowns} onDelete={onDeleteBreakdown} />

      <section className="card p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-ink">Split installments</h2>
          <button type="button" onClick={onOpenDebts} className="btn-ghost -mr-2">All debts <ArrowRight size={13} /></button>
        </div>
        {installments.length === 0 ? (
          <p className="mt-1 text-[13px] leading-relaxed text-ink-2">None. If a bill is too big at check-in, you can split part of it here.</p>
        ) : (
          <ul className="mt-1 divide-y divide-line">
            {installments.map((debt) => (
              <li key={debt.id} className="flex items-center justify-between gap-3 py-2.5">
                <span className="min-w-0">
                  <span className="block truncate text-sm text-ink">{cardName(debt.cardId)}</span>
                  <span className="block text-xs text-ink-3">
                    Next {formatYen(scheduledPrincipal(debt) + monthlyInterest(debt))} with the {formatShortDate(fromDate(new Date(debt.dueDate)))} bill
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-sm tabular-nums text-ink">{formatYen(debt.amount)}</span>
                  <span className="block text-xs text-ink-3">left</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <button type="button" onClick={onOpenSetup} className="btn-ghost mx-auto flex">Edit cards and payment days</button>
    </div>
  );
};
