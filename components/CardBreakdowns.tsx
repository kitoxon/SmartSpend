import React, { useMemo, useRef, useState } from 'react';
import { FileUp, Trash2 } from 'lucide-react';
import { Card, CardBreakdown, CardUsage, PlannerData } from '../types';
import { cardBreakdownId, cardUsageId } from '../utils/payCycle';
import { LocalDate, dayOfMonth, formatShortDate, monthKeyOf } from '../utils/jpCalendar';
import { formatMonthName, formatYen } from '../utils/format';
import {
  NotPaypayHistoryError, PaypayPayment, creditMethodsIn, parsePaypayHistory, summarizePaypayHistory,
} from '../utils/paypayImport';

interface CardBreakdownsProps {
  data: PlannerData;
  cards: Card[];
  seriesClass: (index: number) => string;
  today: LocalDate;
  onImport: (breakdowns: CardBreakdown[], usages: CardUsage[]) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

interface Preview {
  fileName: string;
  payments: PaypayPayment[];
  methods: string[];
}

/** The export is UTF-8 today; older or Japanese exports may be Shift_JIS. */
const readHistory = async (file: File) => {
  const buffer = await file.arrayBuffer();
  for (const encoding of ['utf-8', 'shift_jis']) {
    try {
      return parsePaypayHistory(new TextDecoder(encoding).decode(buffer));
    } catch (error) {
      if (!(error instanceof NotPaypayHistoryError)) throw error;
    }
  }
  throw new NotPaypayHistoryError();
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
  const months = preview && method ? summarizePaypayHistory(preview.payments, method) : [];
  const currentMonth = monthKeyOf(today);

  const chooseFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError(null);
    try {
      const payments = await readHistory(file);
      const methods = creditMethodsIn(payments);
      if (methods.length === 0) {
        setError('No card payments were found in this file.');
        return;
      }
      setPreview({ fileName: file.name, payments, methods });
      setMethod(methods[0]);
      setCardId((cards.find((card) => /paypay/i.test(card.name)) ?? cards[0])?.id ?? '');
      setUseAsTotal(true);
    } catch (readError) {
      setError(readError instanceof Error ? readError.message : 'Could not read this file.');
    }
  };

  const confirmImport = async () => {
    if (!preview || !cardId) return;
    setSaving(true);
    const importedAt = new Date().toISOString();
    const newBreakdowns: CardBreakdown[] = months.map((month) => ({
      id: cardBreakdownId(cardId, month.usageMonth),
      cardId,
      usageMonth: month.usageMonth,
      source: 'paypay',
      importedAt,
      firstDate: month.firstDate,
      lastDate: month.lastDate,
      payments: month.payments,
      charged: month.charged,
      paidOtherWays: month.paidOtherWays,
      categories: month.categories,
      places: month.places,
    }));
    // The charged total becomes the card's month total, unless the bill is
    // already entered or a higher total was typed from the card's app.
    const usages: CardUsage[] = useAsTotal ? months.flatMap((month) => {
      const hasBill = data.statements.some((item) => item.cardId === cardId && item.usageMonth === month.usageMonth);
      const typed = data.cardUsage.find((item) => item.cardId === cardId && item.usageMonth === month.usageMonth);
      if (hasBill || month.charged <= 0 || (typed && typed.amount > month.charged)) return [];
      const asOf = month.usageMonth < currentMonth ? dayOfMonth(month.usageMonth, 'last') : month.lastDate;
      return [{ id: cardUsageId(cardId, month.usageMonth), cardId, usageMonth: month.usageMonth, amount: month.charged, asOf }];
    }) : [];
    try {
      await onImport(newBreakdowns, usages);
      setSelectedId(newBreakdowns.at(-1)?.id ?? null);
      setPreview(null);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'Could not import.');
    } finally {
      setSaving(false);
    }
  };

  const cardIndex = (id: string) => cards.findIndex((card) => card.id === id);
  const cardName = (id: string) => data.cards.find((card) => card.id === id)?.name ?? 'Card';

  const renderBreakdown = (breakdown: CardBreakdown) => {
    const statement = data.statements.find((item) => item.cardId === breakdown.cardId && item.usageMonth === breakdown.usageMonth);
    const billPurchases = statement ? statement.amount - statement.installment : null;
    const largest = Math.max(...breakdown.categories.map((category) => category.amount), 1);
    const top = breakdown.categories[0];
    const mostFrequent = [...breakdown.categories].sort((a, b) => b.count - a.count)[0];
    return (
      <div className="mt-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-ink">{cardName(breakdown.cardId)} · {monthLabel(breakdown.usageMonth)}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-ink-3">
              PayPay history, {formatShortDate(breakdown.firstDate)}–{formatShortDate(breakdown.lastDate)}: {breakdown.payments} payments, {formatYen(breakdown.charged)} on the card
              {billPurchases ? ` · ${Math.min(100, Math.round((breakdown.charged / billPurchases) * 100))}% of the ${formatYen(billPurchases)} bill` : ''}
            </p>
          </div>
          <button type="button" onClick={() => void onDelete(breakdown.id)} aria-label="Remove this import" className="shrink-0 rounded-lg p-2 text-ink-3 hover:bg-subtle hover:text-bad">
            <Trash2 size={15} />
          </button>
        </div>

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
        </ul>

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

        <p className="mt-3 text-xs leading-relaxed text-ink-3">
          {breakdown.paidOtherWays > 0 && `${formatYen(breakdown.paidOtherWays)} paid with PayPay Points or Balance isn't on the card. `}
          Purchases made with the card outside the PayPay app aren't included.
        </p>
      </div>
    );
  };

  return (
    <section className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium text-ink">Where the money went</h2>
          <p className="mt-0.5 text-xs leading-relaxed text-ink-3">From imported PayPay history. For understanding a bill only; nothing is added as spending.</p>
        </div>
        <button type="button" onClick={() => fileInput.current?.click()} className="btn min-h-9 shrink-0 px-3 text-[13px]"><FileUp size={14} /> Import</button>
        <input ref={fileInput} type="file" accept=".csv,text/csv" onChange={(event) => void chooseFile(event)} className="hidden" />
      </div>

      {error && <p className="mt-3 rounded-lg bg-bad-soft px-3 py-2 text-[13px] text-bad">{error}</p>}

      {preview && (
        <div className="mt-3 space-y-3 rounded-xl border border-accent/50 p-3">
          <p className="truncate text-xs text-ink-3">{preview.fileName}</p>
          <ul className="space-y-1">
            {months.map((month) => (
              <li key={month.usageMonth} className="text-[13px] text-ink-2">
                <span className="text-ink">{monthLabel(month.usageMonth)}</span> · {month.payments} payments · <span className="tabular-nums text-ink">{formatYen(month.charged)}</span> on the card
                {month.paidOtherWays > 0 && ` · ${formatYen(month.paidOtherWays)} with points or balance`}
              </li>
            ))}
          </ul>
          <div className={preview.methods.length > 1 ? 'grid grid-cols-2 gap-2' : ''}>
            <label className="block">
              <span className="mb-1 block text-xs text-ink-3">Card</span>
              <select value={cardId} onChange={(event) => setCardId(event.target.value)} className="field px-2 text-sm">
                {cards.map((card) => <option key={card.id} value={card.id}>{card.name}</option>)}
              </select>
            </label>
            {preview.methods.length > 1 && (
              <label className="block">
                <span className="mb-1 block text-xs text-ink-3">Shown in the file as</span>
                <select value={method} onChange={(event) => setMethod(event.target.value)} className="field px-2 text-sm">
                  {preview.methods.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
            )}
          </div>
          <label className="flex cursor-pointer items-start gap-2 text-[13px] text-ink-2">
            <input type="checkbox" checked={useAsTotal} onChange={(event) => setUseAsTotal(event.target.checked)} className="mt-0.5 h-4 w-4 accent-[rgb(var(--accent))]" />
            Use the amount on the card as this card's month total, unless its bill is already entered
          </label>
          <div className="flex gap-2">
            <button type="button" onClick={() => setPreview(null)} className="btn flex-1">Cancel</button>
            <button type="button" onClick={() => void confirmImport()} disabled={saving || !cardId} className="btn-primary flex-[2]">{saving ? 'Importing…' : 'Import'}</button>
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
          Download a month of transaction history from the PayPay app as a CSV file, then import it here to see categories and top places for your PayPay Card.
        </p>
      )}
    </section>
  );
};
