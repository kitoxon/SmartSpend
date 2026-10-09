import React, { useState } from 'react';
import { CreditCard, Landmark, Plus, Trash2 } from 'lucide-react';
import { Bill, BusinessDayShift, Card, PlannerData, PlannerSettings } from '../types';
import { getPayday } from '../utils/payCycle';
import { formatWeekdayDate, monthKeyOf, shiftMonthKey, todayLocalDate } from '../utils/jpCalendar';
import { parseAmount } from '../utils/format';
import { isPlannerConfigured, suggestedSetup } from '../services/planner';
import { AmountInput } from './ui/AmountInput';

export interface PlanSetupResult {
  settings: PlannerSettings;
  cards: Card[];
  bills: Bill[];
}

interface PlanSetupProps {
  data: PlannerData;
  legacyRecurringCount: number;
  onSave: (result: PlanSetupResult) => Promise<void>;
  onCancel: () => void;
}

type BillDraft = Omit<Bill, 'amount'> & { amount: string };

const DAYS = Array.from({ length: 31 }, (_, index) => index + 1);
const SHIFT_LABELS: Record<BusinessDayShift, string> = {
  none: 'Keep the date',
  next: 'Move later',
  previous: 'Move earlier',
};

export const PlanSetup: React.FC<PlanSetupProps> = ({ data, legacyRecurringCount, onSave, onCancel }) => {
  const firstRun = !isPlannerConfigured(data);
  const [initial] = useState(() => (firstRun ? suggestedSetup() : { cards: data.cards, bills: data.bills }));
  const [paydayDay, setPaydayDay] = useState(data.settings.paydayDay);
  const [cards, setCards] = useState<Card[]>(initial.cards.filter((card) => !card.archived));
  const [bills, setBills] = useState<BillDraft[]>(initial.bills.filter((bill) => bill.active).map((bill) => ({ ...bill, amount: bill.amount > 0 ? String(bill.amount) : '' })));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const updateCard = (id: string, patch: Partial<Card>) => setCards((list) => list.map((card) => (card.id === id ? { ...card, ...patch } : card)));
  const updateBill = (id: string, patch: Partial<BillDraft>) => setBills((list) => list.map((bill) => (bill.id === id ? { ...bill, ...patch } : bill)));

  const nextPayday = (() => {
    const today = todayLocalDate();
    const settings = { ...data.settings, paydayDay };
    const thisMonth = getPayday(monthKeyOf(today), settings);
    return thisMonth >= today ? thisMonth : getPayday(shiftMonthKey(monthKeyOf(today), 1), settings);
  })();

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (cards.some((card) => !card.name.trim()) || bills.some((bill) => !bill.name.trim())) {
      setError('Give every card and bill a name.');
      return;
    }
    const missing = bills.find((bill) => !bill.variable && !parseAmount(bill.amount));
    if (missing) {
      setError(`Enter the amount for ${missing.name}.`);
      return;
    }
    setError(null);
    setSaving(true);

    // Removed items are kept but hidden, so past cycles still show them.
    const keptCardIds = new Set(cards.map((card) => card.id));
    const keptBillIds = new Set(bills.map((bill) => bill.id));
    const archivedCards = data.cards.filter((card) => !keptCardIds.has(card.id) && !card.archived).map((card) => ({ ...card, archived: true }));
    const retiredBills = data.bills.filter((bill) => !keptBillIds.has(bill.id) && bill.active).map((bill) => ({ ...bill, active: false }));

    try {
      await onSave({
        settings: { ...data.settings, paydayDay },
        cards: [...cards.map((card, index) => ({ ...card, name: card.name.trim(), sortOrder: index })), ...archivedCards],
        bills: [
          ...bills.map((bill, index) => ({ ...bill, name: bill.name.trim(), amount: parseAmount(bill.amount) ?? 0, sortOrder: index })),
          ...retiredBills,
        ],
      });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save.');
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {firstRun && (
        <p className="rounded-lg bg-accent-soft/60 px-3 py-2.5 text-[13px] leading-relaxed text-ink">
          Your cards and bills are filled in. Add the amounts, check the days, and save.
        </p>
      )}

      <section className="space-y-2">
        <label htmlFor="payday-day" className="text-sm font-medium text-ink">Payday</label>
        <div className="flex items-center gap-3">
          <select id="payday-day" value={paydayDay} onChange={(event) => setPaydayDay(Number(event.target.value))} className="field w-28">
            {DAYS.slice(0, 28).map((day) => <option key={day} value={day}>Day {day}</option>)}
          </select>
          <p className="text-xs leading-relaxed text-ink-3">Moves to the business day before on weekends and holidays. Next: {formatWeekdayDate(nextPayday)}.</p>
        </div>
      </section>

      <section className="space-y-2">
        <div>
          <h4 className="flex items-center gap-1.5 text-sm font-medium text-ink"><CreditCard size={15} /> Credit cards</h4>
          <p className="mt-0.5 text-xs leading-relaxed text-ink-3">Each month's purchases are paid the next month on this day, or the next business day.</p>
        </div>
        {cards.map((card) => (
          <div key={card.id} className="grid grid-cols-[minmax(0,1fr)_96px_40px] items-center gap-2">
            <input value={card.name} onChange={(event) => updateCard(card.id, { name: event.target.value })} placeholder="Card name" aria-label="Card name" className="field" />
            <select value={card.paymentDay} onChange={(event) => updateCard(card.id, { paymentDay: Number(event.target.value) })} aria-label={`${card.name} payment day`} className="field px-2">
              {DAYS.map((day) => <option key={day} value={day}>Day {day}</option>)}
            </select>
            <button type="button" onClick={() => setCards((list) => list.filter((item) => item.id !== card.id))} aria-label={`Remove ${card.name}`} className="flex h-10 w-10 items-center justify-center rounded-lg text-ink-3 hover:bg-subtle hover:text-bad">
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        <button type="button" onClick={() => setCards((list) => [...list, { id: crypto.randomUUID(), name: '', paymentDay: 26, sortOrder: list.length }])} className="btn-ghost">
          <Plus size={15} /> Add card
        </button>
      </section>

      <section className="space-y-2">
        <div>
          <h4 className="flex items-center gap-1.5 text-sm font-medium text-ink"><Landmark size={15} /> Transfer bills</h4>
          <p className="mt-0.5 text-xs leading-relaxed text-ink-3">Paid by bank transfer, not by card. For bills that vary, enter a typical amount and confirm it each month.</p>
        </div>
        {bills.map((bill) => (
          <div key={bill.id} className="space-y-2 rounded-xl border border-line p-3">
            <div className="grid grid-cols-[minmax(0,1fr)_120px_40px] items-center gap-2">
              <input value={bill.name} onChange={(event) => updateBill(bill.id, { name: event.target.value })} placeholder="Bill name" aria-label="Bill name" className="field" />
              <AmountInput value={bill.amount} onChange={(amount) => updateBill(bill.id, { amount })} placeholder={bill.variable ? 'Typical' : 'Amount'} aria-label={`${bill.name || 'Bill'} amount`} />
              <button type="button" onClick={() => setBills((list) => list.filter((item) => item.id !== bill.id))} aria-label={`Remove ${bill.name}`} className="flex h-10 w-10 items-center justify-center rounded-lg text-ink-3 hover:bg-subtle hover:text-bad">
                <Trash2 size={16} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1 block text-xs text-ink-3">Due</span>
                <select value={String(bill.dueDay)} onChange={(event) => updateBill(bill.id, { dueDay: event.target.value === 'last' ? 'last' : Number(event.target.value) })} className="field px-2 text-sm">
                  {DAYS.map((day) => <option key={day} value={day}>Day {day}</option>)}
                  <option value="last">End of month</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-ink-3">If weekend or holiday</span>
                <select value={bill.shift} onChange={(event) => updateBill(bill.id, { shift: event.target.value as BusinessDayShift })} className="field px-2 text-sm">
                  {(Object.keys(SHIFT_LABELS) as BusinessDayShift[]).map((shift) => <option key={shift} value={shift}>{SHIFT_LABELS[shift]}</option>)}
                </select>
              </label>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-[13px] text-ink-2">
              <input type="checkbox" checked={bill.variable} onChange={(event) => updateBill(bill.id, { variable: event.target.checked })} className="h-4 w-4 accent-[rgb(var(--accent))]" />
              Amount varies each month
            </label>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setBills((list) => [...list, { id: crypto.randomUUID(), name: '', amount: '', dueDay: 27, shift: 'none', variable: false, active: true, sortOrder: list.length }])}
          className="btn-ghost"
        >
          <Plus size={15} /> Add bill
        </button>
      </section>

      {legacyRecurringCount > 0 && (
        <p className="rounded-lg bg-warn-soft px-3 py-2.5 text-[13px] leading-relaxed text-warn">
          {legacyRecurringCount} recurring {legacyRecurringCount === 1 ? 'entry' : 'entries'} from the old version will stop adding expenses once you save, so bills aren't counted twice. You can remove them in Sync and settings.
        </p>
      )}

      {error && <p className="text-xs text-bad">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="btn flex-1">Cancel</button>
        <button type="submit" disabled={saving} className="btn-primary flex-[2]">{saving ? 'Saving…' : 'Save'}</button>
      </div>
    </form>
  );
};
