import React, { useMemo, useRef, useState } from 'react';
import { FileUp, Trash2 } from 'lucide-react';
import { Card, CardBreakdown, CardUsage, PlannerData } from '../types';
import { cardBreakdownId, cardDueDate, cardUsageId } from '../utils/payCycle';
import { LocalDate, dayOfMonth, formatShortDate, formatWeekdayDate, fromDate, monthKeyOf } from '../utils/jpCalendar';
import { formatMonthName, formatYen } from '../utils/format';
import { MerchantGroup } from '../utils/merchants';
import {
  NotPaypayHistoryError, PaypayPayment, creditMethodsIn, parsePaypayHistory, summarizePaypayHistory,
} from '../utils/paypayImport';
import { NotVpassStatementError, VpassMonth, guessStatementCard, parseVpassStatement } from '../utils/vpassImport';

export interface ImportedBill {
  card: Card;
  usageMonth: string;
  amount: number;
}

interface CardBreakdownsProps {
  data: PlannerData;
  cards: Card[];
  seriesClass: (index: number) => string;
  today: LocalDate;
  onImport: (breakdowns: CardBreakdown[], usages: CardUsage[], bills: ImportedBill[]) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

type Preview =
  | { kind: 'paypay'; fileName: string; payments: PaypayPayment[]; methods: string[] }
  | { kind: 'vpass'; fileName: string; months: VpassMonth[] };

/** One month of an import, whichever file it came from. */
interface ImportMonth {
  usageMonth: string;
  firstDate: LocalDate;
  lastDate: LocalDate;
  payments: number;
  charged: number;
  paidOtherWays: number;
  billed: number | null;
  revolving: boolean;
  categories: MerchantGroup[];
  places: MerchantGroup[];
}

/**
 * PayPay exports UTF-8 and Vpass statements Shift_JIS, but a file re-saved in
 * a spreadsheet may be either; anything that isn't valid UTF-8 is Shift_JIS.
 */
const decodeText = (buffer: ArrayBuffer) => {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('shift_jis').decode(buffer);
  }
};

const readImportFile = async (file: File): Promise<Preview> => {
  const text = decodeText(await file.arrayBuffer());
  try {
    const payments = parsePaypayHistory(text);
    return { kind: 'paypay', fileName: file.name, payments, methods: creditMethodsIn(payments) };
  } catch (error) {
    if (!(error instanceof NotPaypayHistoryError)) throw error;
  }
  try {
    return { kind: 'vpass', fileName: file.name, months: parseVpassStatement(text) };
  } catch (error) {
    if (!(error instanceof NotVpassStatementError)) throw error;
  }
  throw new Error("This file isn't a PayPay history or a Vpass statement CSV.");
};

const monthLabel = (usageMonth: string) => `${formatMonthName(usageMonth)} ${usageMonth.slice(0, 4)}`;

export const CardBreakdowns: React.FC<CardBreakdownsProps> = ({ data, cards, seriesClass, today, onImport, onDelete }) => {
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [cardId, setCardId] = useState('');
  const [method, setMethod] = useState('');
  const [useAsTotal, setUseAsTotal] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const breakdowns = useMemo(
    () => [...data.cardBreakdowns].sort((a, b) => b.usageMonth.localeCompare(a.usageMonth) || a.cardId.localeCompare(b.cardId)),
    [data.cardBreakdowns],
  );
  const shown = breakdowns.find((item) => item.id === selectedId) ?? breakdowns[0] ?? null;
  const currentMonth = monthKeyOf(today);
  const card = cards.find((item) => item.id === cardId);

  const months: ImportMonth[] = !preview ? [] : preview.kind === 'paypay'
    ? (method ? summarizePaypayHistory(preview.payments, method) : []).map((month) => ({ ...month, billed: null, revolving: false }))
    : preview.months.map((month) => ({
      usageMonth: month.usageMonth,
      firstDate: month.firstDate,
      lastDate: month.lastDate,
      payments: month.count,
      charged: month.purchases,
      paidOtherWays: 0,
      billed: month.billed,
      revolving: month.revolving,
      categories: month.categories,
      places: month.places,
    }));

  const statementFor = (id: string, usageMonth: string) => data.statements.find((item) => item.cardId === id && item.usageMonth === usageMonth);

  /** Best guess at the card a file belongs to; always shown so it can be changed. */
  const guessCard = (next: Preview) => {
    if (next.kind === 'paypay') return (cards.find((item) => /paypay/i.test(item.name)) ?? cards[0])?.id ?? '';
    return guessStatementCard(next.months, cards, data.cardBreakdowns)?.id ?? '';
  };

  const chooseFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError(null);
    try {
      const next = await readImportFile(file);
      if (next.kind === 'paypay' && next.methods.length === 0) {
        setError('No card payments were found in this file.');
        return;
      }
      setPreview(next);
      setMethod(next.kind === 'paypay' ? next.methods[0] : '');
      setCardId(guessCard(next));
      setUseAsTotal(true);
    } catch (readError) {
      setError(readError instanceof Error ? readError.message : 'Could not read this file.');
    }
  };

  const confirmImport = async () => {
    if (!preview || !card) return;
    setSaving(true);
    const importedAt = new Date().toISOString();
    const newBreakdowns: CardBreakdown[] = months.map((month) => ({
      id: cardBreakdownId(card.id, month.usageMonth),
      cardId: card.id,
      usageMonth: month.usageMonth,
      source: preview.kind,
      importedAt,
      firstDate: month.firstDate,
      lastDate: month.lastDate,
      payments: month.payments,
      charged: month.charged,
      paidOtherWays: month.paidOtherWays,
      ...(month.billed !== null ? { billed: month.billed } : {}),
      ...(month.revolving ? { revolving: true } : {}),
      categories: month.categories,
      places: month.places,
    }));

    // A statement's payment amount is the bill itself. A PayPay history only
    // gives a month total, used unless the bill is entered or a higher total was typed.
    const bills: ImportedBill[] = preview.kind === 'vpass' && useAsTotal
      ? months.flatMap((month) => (month.billed !== null && !statementFor(card.id, month.usageMonth) ? [{ card, usageMonth: month.usageMonth, amount: month.billed }] : []))
      : [];
    const usages: CardUsage[] = preview.kind === 'paypay' && useAsTotal ? months.flatMap((month) => {
      const typed = data.cardUsage.find((item) => item.cardId === card.id && item.usageMonth === month.usageMonth);
      if (statementFor(card.id, month.usageMonth) || month.charged <= 0 || (typed && typed.amount > month.charged)) return [];
      const asOf = month.usageMonth < currentMonth ? dayOfMonth(month.usageMonth, 'last') : month.lastDate;
      return [{ id: cardUsageId(card.id, month.usageMonth), cardId: card.id, usageMonth: month.usageMonth, amount: month.charged, asOf }];
    }) : [];

    try {
      await onImport(newBreakdowns, usages, bills);
      setSelectedId(newBreakdowns.at(-1)?.id ?? null);
      setPreview(null);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'Could not import.');
    } finally {
      setSaving(false);
    }
  };

  const cardIndex = (id: string) => cards.findIndex((item) => item.id === id);
  const cardName = (id: string) => data.cards.find((item) => item.id === id)?.name ?? 'Card';

  const renderBreakdown = (breakdown: CardBreakdown) => {
    const isStatement = breakdown.source === 'vpass';
    const statement = statementFor(breakdown.cardId, breakdown.usageMonth);
    // Without an entered bill, a total typed after the month ended is the bill.
    const finalTotal = data.cardUsage.find((item) => item.cardId === breakdown.cardId && item.usageMonth === breakdown.usageMonth && item.asOf > dayOfMonth(item.usageMonth, 'last'));
    const billPurchases = statement ? statement.amount - statement.installment : finalTotal?.amount ?? null;
    const billLabel = statement ? 'bill' : 'total you entered';
    // A PayPay history misses what the bill has from outside the app (ETC
    // tolls, using the card directly), or runs over when late payments move
    // to next month. A statement already is the bill.
    const notInHistory = !isStatement && billPurchases !== null ? billPurchases - breakdown.charged : 0;
    // On revolving payment, purchases not in this bill carry over with interest.
    const carriedOver = isStatement && breakdown.billed !== undefined ? breakdown.charged - breakdown.billed : 0;
    const largest = Math.max(...breakdown.categories.map((category) => category.amount), notInHistory, 1);
    const top = breakdown.categories[0];
    const mostFrequent = [...breakdown.categories].sort((a, b) => b.count - a.count)[0];
    return (
      <div className="mt-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-ink">{cardName(breakdown.cardId)} · {monthLabel(breakdown.usageMonth)}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-ink-3">
              {isStatement ? 'Vpass statement' : 'PayPay history'}, {formatShortDate(breakdown.firstDate)}–{formatShortDate(breakdown.lastDate)}:{' '}
              {breakdown.payments} {isStatement ? 'purchases' : 'payments'}, {formatYen(breakdown.charged)}{isStatement ? '' : ' on the card'}
              {isStatement && breakdown.billed !== undefined && ` · bill ${formatYen(breakdown.billed)}`}
              {!isStatement && billPurchases ? ` · ${Math.min(100, Math.round((breakdown.charged / billPurchases) * 100))}% of the ${formatYen(billPurchases)} ${billLabel}` : ''}
            </p>
          </div>
          <button type="button" onClick={() => void onDelete(breakdown.id)} aria-label="Remove this import" className="shrink-0 rounded-lg p-2 text-ink-3 hover:bg-subtle hover:text-bad">
            <Trash2 size={15} />
          </button>
        </div>

        {carriedOver >= 1 && (
          <p className="mt-3 rounded-lg bg-warn-soft px-3 py-2 text-[13px] leading-relaxed text-warn">
            {formatYen(carriedOver)} of these purchases isn't in this bill. On リボ払い (revolving payment) it carries over to later bills and is charged interest. Vpass shows the balance under リボ払い残高.
          </p>
        )}
        {carriedOver <= -1 && (
          <p className="mt-3 text-xs leading-relaxed text-ink-3">
            The bill is {formatYen(carriedOver)} more than these purchases: an earlier revolving balance or interest.
          </p>
        )}
        {isStatement && breakdown.revolving && Math.abs(carriedOver) < 1 && (
          <p className="mt-3 text-xs leading-relaxed text-ink-3">These purchases are set to リボ払い (revolving), and this bill pays all of them.</p>
        )}

        {top && (
          <p className="mt-3 text-[13px] leading-relaxed text-ink-2">
            Biggest share: {top.label}{breakdown.charged > 0 ? ` (${Math.round((top.amount / breakdown.charged) * 100)}%)` : ''}.
            {mostFrequent && mostFrequent.count >= 5 && mostFrequent.label !== top.label && ` Most often: ${mostFrequent.label}, ${mostFrequent.count} times, about ${formatYen(mostFrequent.amount / mostFrequent.count)} each.`}
          </p>
        )}

        <ul className="mt-3 space-y-2.5">
          {breakdown.categories.map((category) => (
            <li key={category.label}>
              <div className="flex items-baseline justify-between gap-3 text-[13px]">
                <span className="text-ink">{category.label}</span>
                <span className="tabular-nums text-ink-2">{formatYen(category.amount)} <span className="text-ink-3">· {category.count}×</span></span>
              </div>
              <div className="mt-1 h-2" aria-hidden="true">
                <div className={`h-full rounded-r-[4px] ${seriesClass(cardIndex(breakdown.cardId))}`} style={{ width: `${Math.max(1, (category.amount / largest) * 100)}%` }} />
              </div>
            </li>
          ))}
          {notInHistory >= 1 && (
            <li>
              <div className="flex items-baseline justify-between gap-3 text-[13px]">
                <span className="text-ink-2">Not in PayPay history</span>
                <span className="tabular-nums text-ink-2">{formatYen(notInHistory)}</span>
              </div>
              <div className="mt-1 h-2" aria-hidden="true">
                <div className="h-full rounded-r-[4px] bg-line-strong" style={{ width: `${Math.max(1, (notInHistory / largest) * 100)}%` }} />
              </div>
              <p className="mt-1 text-xs text-ink-3">Such as ETC tolls or using the card directly. Together with the above, this makes the {formatYen(billPurchases ?? 0)} {billLabel}.</p>
            </li>
          )}
        </ul>
        {notInHistory <= -1 && (
          <p className="mt-2 text-xs leading-relaxed text-ink-3">
            These payments come to {formatYen(notInHistory)} more than the {billLabel}. Payments from the last days of the month are often billed the month after.
          </p>
        )}

        {breakdown.places.length > 0 && (
          <div className="mt-4">
            <p className="text-xs text-ink-3">Top places</p>
            <ul className="mt-1 divide-y divide-line">
              {breakdown.places.slice(0, 5).map((place) => (
                <li key={place.label} className="flex items-baseline justify-between gap-3 py-1.5 text-[13px]">
                  <span className="min-w-0 truncate text-ink">{place.label}</span>
                  <span className="shrink-0 tabular-nums text-ink-2">{formatYen(place.amount)} <span className="text-ink-3">· {place.count}×</span></span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {!isStatement && (
          <p className="mt-3 text-xs leading-relaxed text-ink-3">
            {breakdown.paidOtherWays > 0 && `${formatYen(breakdown.paidOtherWays)} paid with PayPay Points or Balance isn't on the card. `}
            {billPurchases === null && "Purchases made with the card outside the PayPay app aren't included."}
          </p>
        )}
      </div>
    );
  };

  return (
    <section className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium text-ink">Where the money went</h2>
          <p className="mt-0.5 text-xs leading-relaxed text-ink-3">From imported PayPay history or Vpass statements. For understanding bills only; nothing is added as spending.</p>
        </div>
        <button type="button" onClick={() => fileInput.current?.click()} className="btn min-h-9 shrink-0 px-3 text-[13px]"><FileUp size={14} /> Import</button>
        <input ref={fileInput} type="file" accept=".csv,text/csv" onChange={(event) => void chooseFile(event)} className="hidden" />
      </div>

      {error && <p className="mt-3 rounded-lg bg-bad-soft px-3 py-2 text-[13px] text-bad">{error}</p>}

      {preview && (
        <div className="mt-3 space-y-3 rounded-xl border border-accent/50 p-3">
          <p className="truncate text-xs text-ink-3">{preview.kind === 'vpass' ? 'Vpass statement' : 'PayPay history'} · {preview.fileName}</p>
          <ul className="space-y-1">
            {months.map((month) => (
              <li key={month.usageMonth} className="text-[13px] text-ink-2">
                <span className="text-ink">{monthLabel(month.usageMonth)}</span> · {month.payments} {preview.kind === 'vpass' ? 'purchases' : 'payments'} ·{' '}
                <span className="tabular-nums text-ink">{formatYen(month.charged)}</span>{preview.kind === 'paypay' ? ' on the card' : ''}
                {month.paidOtherWays > 0 && ` · ${formatYen(month.paidOtherWays)} with points or balance`}
                {month.billed !== null && <> · bill <span className="tabular-nums text-ink">{formatYen(month.billed)}</span></>}
              </li>
            ))}
          </ul>
          <div className={preview.kind === 'paypay' && preview.methods.length > 1 ? 'grid grid-cols-2 gap-2' : ''}>
            <label className="block">
              <span className="mb-1 block text-xs text-ink-3">Card</span>
              <select value={cardId} onChange={(event) => setCardId(event.target.value)} className="field px-2 text-sm">
                {cards.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            {preview.kind === 'paypay' && preview.methods.length > 1 && (
              <label className="block">
                <span className="mb-1 block text-xs text-ink-3">Shown in the file as</span>
                <select value={method} onChange={(event) => setMethod(event.target.value)} className="field px-2 text-sm">
                  {preview.methods.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
            )}
          </div>
          {preview.kind === 'vpass' && card ? (
            months.map((month) => {
              const entered = statementFor(card.id, month.usageMonth);
              if (month.billed === null) return null;
              if (entered) {
                return entered.amount === month.billed ? null : (
                  <p key={month.usageMonth} className="text-xs leading-relaxed text-ink-3">
                    You entered {formatYen(entered.amount)} for this bill; the statement says {formatYen(month.billed)}. Tap the bill on Home to change it.
                  </p>
                );
              }
              return (
                <label key={month.usageMonth} className="flex cursor-pointer items-start gap-2 text-[13px] text-ink-2">
                  <input type="checkbox" checked={useAsTotal} onChange={(event) => setUseAsTotal(event.target.checked)} className="mt-0.5 h-4 w-4 accent-[rgb(var(--accent))]" />
                  Use {formatYen(month.billed)} as {card.name}'s bill due {formatWeekdayDate(cardDueDate(card, month.usageMonth))}
                </label>
              );
            })
          ) : (
            <label className="flex cursor-pointer items-start gap-2 text-[13px] text-ink-2">
              <input type="checkbox" checked={useAsTotal} onChange={(event) => setUseAsTotal(event.target.checked)} className="mt-0.5 h-4 w-4 accent-[rgb(var(--accent))]" />
              Use the amount on the card as this card's month total, unless its bill is already entered
            </label>
          )}
          {card && months.map((month) => {
            const existing = data.cardBreakdowns.find((item) => item.cardId === card.id && item.usageMonth === month.usageMonth);
            return existing && (
              <p key={`replace-${month.usageMonth}`} className="rounded-lg bg-warn-soft px-3 py-2 text-xs leading-relaxed text-warn">
                Replaces the {card.name} {monthLabel(month.usageMonth)} import from {formatShortDate(fromDate(new Date(existing.importedAt)))}. Check the card if that's not what you meant.
              </p>
            );
          })}
          <div className="flex gap-2">
            <button type="button" onClick={() => setPreview(null)} className="btn flex-1">Cancel</button>
            <button type="button" onClick={() => void confirmImport()} disabled={saving || !card} className="btn-primary flex-[2]">{saving ? 'Importing…' : 'Import'}</button>
          </div>
        </div>
      )}

      {breakdowns.length > 1 && (
        <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
          {breakdowns.map((breakdown) => (
            <button
              key={breakdown.id}
              type="button"
              onClick={() => setSelectedId(breakdown.id)}
              aria-pressed={shown?.id === breakdown.id}
              className={`shrink-0 ${shown?.id === breakdown.id ? 'chip-on' : 'chip'}`}
            >
              {cardName(breakdown.cardId)} · {formatMonthName(breakdown.usageMonth).slice(0, 3)}
            </button>
          ))}
        </div>
      )}

      {shown ? renderBreakdown(shown) : !preview && (
        <p className="mt-3 text-[13px] leading-relaxed text-ink-2">
          Import a PayPay history CSV from the PayPay app, or a statement CSV from the Vpass website, to see categories and top places for that card.
        </p>
      )}
    </section>
  );
};
