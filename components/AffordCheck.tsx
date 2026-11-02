import React, { useId, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { Card, PlannerSettings } from '../types';
import { PlanInput, buildCyclePlan, getCycle } from '../utils/payCycle';
import { formatShortDate } from '../utils/jpCalendar';
import { formatSignedYen, formatYen, parseAmount } from '../utils/format';
import { CycleOutlook, DEFAULT_CUSHION, PayWith, Verdict, checkAffordability, cycleKeysToCheck, purchasePayments } from '../utils/afford';
import { AmountInput } from './ui/AmountInput';
import { Segmented } from './ui/Segmented';
import { DEFAULT_SPLIT_RATE } from './CardBillFields';

interface AffordCheckProps {
  cards: Card[];
  planInput: PlanInput;
  settings: PlannerSettings;
  currentKey: string;
  salaryEstimate: number;
  onSaveCushion: (amount: number) => Promise<void>;
}

const CASH = 'cash';
const PAYMENT_OPTIONS = ['1', '3', '5', '6'] as const;

const VERDICTS: Record<Verdict, { title: string; icon: typeof CheckCircle2; className: string }> = {
  affordable: { title: 'Affordable', icon: CheckCircle2, className: 'bg-good-soft text-good' },
  tight: { title: 'Tight', icon: AlertTriangle, className: 'bg-warn-soft text-warn' },
  short: { title: 'Not affordable', icon: XCircle, className: 'bg-bad-soft text-bad' },
};

export const AffordCheck: React.FC<AffordCheckProps> = ({ cards, planInput, settings, currentKey, salaryEstimate, onSaveCushion }) => {
  const id = useId();
  const [price, setPrice] = useState('');
  const [payWithId, setPayWithId] = useState<string>(CASH);
  const [payments, setPayments] = useState<(typeof PAYMENT_OPTIONS)[number]>('1');
  const [rate, setRate] = useState(DEFAULT_SPLIT_RATE);
  const savedCushion = settings.cushion ?? DEFAULT_CUSHION;
  const [cushion, setCushion] = useState(String(savedCushion));
  const [editingCushion, setEditingCushion] = useState(false);

  const amount = parseAmount(price) ?? 0;
  const card = cards.find((item) => item.id === payWithId);
  const cushionAmount = parseAmount(cushion) ?? 0;
  const splitRate = Number(rate);

  const result = useMemo(() => {
    if (amount <= 0) return null;
    const payWith: PayWith = card
      ? { kind: 'card', card, payments: Number(payments), rate: Number.isFinite(splitRate) && splitRate >= 0 ? splitRate : 0 }
      : { kind: 'cash' };
    const due = purchasePayments(amount, payWith, planInput.today);
    const plans = cycleKeysToCheck(currentKey, due, settings).map((key) => buildCyclePlan(getCycle(key, settings), planInput));
    return checkAffordability(plans, due, salaryEstimate, cushionAmount);
  }, [amount, card, payments, splitRate, planInput, currentKey, settings, salaryEstimate, cushionAmount]);

  const saveCushion = () => {
    setEditingCushion(false);
    if (cushionAmount !== savedCushion) void onSaveCushion(cushionAmount);
  };

  const cycleName = (outlook: CycleOutlook) => (outlook.plan.status === 'current'
    ? `This cycle (to ${formatShortDate(outlook.plan.cycle.end)})`
    : `${formatShortDate(outlook.plan.cycle.start)} – ${formatShortDate(outlook.plan.cycle.end)}`);

  const paymentLabel = (index: number, count: number) => (!card ? 'Paid now' : count === 1 ? `${card.name} bill` : `Payment ${index + 1} of ${count}`);
  const allPayments = result?.cycles.flatMap((outlook) => outlook.payments) ?? [];

  const summary = (() => {
    if (!result) return '';
    const { worst, alreadyShort } = result;
    const nameOf = (outlook: CycleOutlook, start = true) => (outlook.plan.status === 'current'
      ? `${start ? 'This' : 'this'} cycle`
      : `${start ? 'The' : 'the'} ${formatShortDate(outlook.plan.cycle.start)} cycle`);
    const verdictText = result.verdict === 'affordable'
      ? `The cycles it's paid in keep at least your ${formatYen(cushionAmount)} cushion.`
      : result.verdict === 'tight'
        ? `${nameOf(worst)} drops to ${formatSignedYen(worst.after)}, below your ${formatYen(worst.cushion)} cushion.`
        : `${nameOf(worst)} ends ${formatYen(worst.after)} short.`;
    // A shortfall that's there without the purchase, said apart from the verdict.
    const already = !alreadyShort ? ''
      : alreadyShort === worst ? ` It's already ${formatYen(alreadyShort.before)} short without this.`
        : ` Separately, ${nameOf(alreadyShort, false)} is ${formatYen(alreadyShort.before)} short even without it.`;
    return verdictText + already;
  })();

  const verdict = result ? VERDICTS[result.verdict] : null;

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor={`${id}-price`} className="field-label">Price</label>
        <AmountInput id={`${id}-price`} value={price} onChange={setPrice} size="lg" placeholder="0" autoFocus />
      </div>

      <div>
        <p className="field-label">Pay with</p>
        <div className="flex flex-wrap gap-1.5">
          {[{ id: CASH, name: 'Cash or debit' }, ...cards].map((option) => (
            <button key={option.id} type="button" onClick={() => setPayWithId(option.id)} aria-pressed={payWithId === option.id} className={payWithId === option.id ? 'chip-on' : 'chip'}>
              {option.name}
            </button>
          ))}
        </div>
      </div>

      {card && (
        <div className="space-y-2">
          <p className="field-label mb-0">Number of payments</p>
          <Segmented<(typeof PAYMENT_OPTIONS)[number]>
            label="Number of payments"
            value={payments}
            options={PAYMENT_OPTIONS.map((value) => ({ value, label: value === '1' ? 'In full' : value }))}
            onChange={setPayments}
          />
          {payments !== '1' && (
            <label className="flex items-center gap-2 text-[13px] text-ink-2">
              Interest about
              <input value={rate} onChange={(event) => setRate(event.target.value)} inputMode="decimal" aria-label="Interest rate" className="field h-9 w-16 px-2 text-center text-sm" />
              % a year
            </label>
          )}
        </div>
      )}

      {result && verdict && (
        <div className="space-y-3 border-t border-line pt-4">
          <div className={`flex items-start gap-2.5 rounded-lg px-3 py-2.5 ${verdict.className}`}>
            <verdict.icon size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium">{verdict.title}</p>
              <p className="text-[13px] leading-relaxed">{summary}</p>
            </div>
          </div>

          <div>
            <p className="mb-1 text-xs text-ink-3">Left to spend in each cycle, before → after</p>
            <ul className="space-y-0.5">
              {result.cycles.map((outlook) => {
                const changed = outlook.after !== outlook.before;
                const tone = outlook.after < 0 ? 'text-bad' : outlook.after < outlook.cushion ? 'text-warn' : 'text-ink';
                return (
                  <li key={outlook.plan.cycle.key} className={`rounded-lg px-3 py-2 ${outlook === result.worst && result.verdict !== 'affordable' ? 'bg-subtle' : ''}`}>
                    <div className="flex items-baseline justify-between gap-3 text-[13px]">
                      <span className="min-w-0 text-ink">
                        {cycleName(outlook)}
                        {outlook.estimated && <span className="text-ink-3"> · estimate</span>}
                      </span>
                      <span className="shrink-0 tabular-nums">
                        {changed && <span className="text-ink-3">{formatSignedYen(outlook.before)} → </span>}
                        <span className={tone}>{formatSignedYen(outlook.after)}</span>
                      </span>
                    </div>
                    {outlook.payments.length > 0 && (
                      <p className="mt-0.5 text-xs text-ink-3">
                        {outlook.payments.map((payment) => `${paymentLabel(allPayments.indexOf(payment), allPayments.length)} ${formatShortDate(payment.dueDate)} −${formatYen(payment.amount)}`).join(' · ')}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

          {allPayments.length > 1 && (
            <p className="text-xs leading-relaxed text-ink-3">
              {allPayments.length} payments, about {formatYen(result.interest)} in interest. Arrange the split with the card company (あとから分割), then set it on the bill in Runway.
            </p>
          )}
        </div>
      )}

      <div className="space-y-2 border-t border-line pt-3">
        {editingCushion ? (
          <div>
            <label htmlFor={`${id}-cushion`} className="field-label">Cushion: keep at least this much to spend in each cycle</label>
            <AmountInput id={`${id}-cushion`} value={cushion} onChange={setCushion} onBlur={saveCushion} onKeyDown={(event) => { if (event.key === 'Enter') saveCushion(); }} autoFocus />
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3 text-[13px] text-ink-2">
            <span>Cushion: keep {formatYen(cushionAmount)} to spend in each cycle</span>
            <button type="button" onClick={() => setEditingCushion(true)} className="btn-ghost -mr-2 shrink-0">Change</button>
          </div>
        )}
        <p className="text-xs leading-relaxed text-ink-3">
          Later cycles assume your last salary ({formatYen(salaryEstimate)}) and your usual card spending; the purchase comes on top. Leftover money is assumed spent, and a shortfall comes out of the next cycle. Nothing is saved.
        </p>
      </div>
    </div>
  );
};
