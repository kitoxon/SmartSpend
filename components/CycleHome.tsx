import React from 'react';
import {
  ArrowLeftRight, ArrowRight, Check, ChevronLeft, ChevronRight, Plus, Sparkles,
} from 'lucide-react';
import { Transaction } from '../types';
import { CyclePlan, Obligation, cycleBreakdown, statementPurchases, unusuallyHighBy } from '../utils/payCycle';
import { addDays, diffDays, formatShortDate, formatWeekdayDate, fromDate, monthKeyOf, todayLocalDate } from '../utils/jpCalendar';
import { formatSignedYen, formatYen } from '../utils/format';
import { CategoryIcon } from './ui/CategoryIcon';
import { APP_NAME } from '../constants';
import { CreditCardIcon } from './ui/CreditCardIcon';
import { BillIcon } from './ui/BillIcon';

interface CycleHomeProps {
  plan: CyclePlan;
  nextPlan: CyclePlan;
  isConfigured: boolean;
  onCheckBalance: () => void;
  onOpenCards: () => void;
  onShiftCycle: (delta: number) => void;
  onToday: () => void;
  onSetup: () => void;
  onCheckIn: (mode: 'payday' | 'today') => void;
  onTogglePaid: (obligation: Obligation) => void;
  onEditObligation: (obligation: Obligation) => void;
  onAddCash: () => void;
  onOpenActivity: () => void;
  onEditTransaction: (transaction: Transaction) => void;
}

const ObligationIcon: React.FC<{ obligation: Obligation }> = ({ obligation }) => {
  const props = { size: 15, 'aria-hidden': true, className: 'shrink-0 text-ink-3' } as const;
  if (obligation.kind === 'card') return <CreditCardIcon {...props} />;
  if (obligation.kind === 'debt') return <ArrowLeftRight {...props} />;
  return <BillIcon name={obligation.label} size={props.size} className={props.className} />;
};

const Row: React.FC<{ label: React.ReactNode; value: React.ReactNode; muted?: boolean; strong?: boolean }> = ({ label, value, muted, strong }) => (
  <div className={`flex items-center justify-between gap-3 py-1.5 text-sm ${muted ? 'text-ink-2' : 'text-ink'} ${strong ? 'font-medium' : ''}`}>
    <span className="min-w-0 truncate">{label}</span>
    <span className="shrink-0 tabular-nums">{value}</span>
  </div>
);

const ObligationRow: React.FC<{
  obligation: Obligation;
  trackOverdue: boolean;
  onTogglePaid: (obligation: Obligation) => void;
  onEdit: (obligation: Obligation) => void;
}> = ({ obligation, trackOverdue, onTogglePaid, onEdit }) => {
  const today = todayLocalDate();
  const daysUntil = diffDays(today, obligation.dueDate);
  const overdue = trackOverdue && !obligation.paid && daysUntil < 0;
  const when = obligation.paid
    ? 'Paid'
    : overdue ? `${-daysUntil}d overdue`
      : daysUntil === 0 ? 'Due today' : daysUntil === 1 ? 'Due tomorrow' : formatWeekdayDate(obligation.dueDate);
  const kindLabel = obligation.kind === 'card' ? 'card bill' : obligation.kind === 'debt' ? 'payment' : 'bill';
  const highBy = obligation.statement ? unusuallyHighBy(statementPurchases(obligation.statement), obligation.usual) : null;

  return (
    <div className="flex items-center gap-2 py-1">
      <button
        type="button"
        onClick={() => onTogglePaid(obligation)}
        aria-pressed={obligation.paid}
        aria-label={obligation.paid ? `Mark ${obligation.label} ${kindLabel} as unpaid` : `Mark ${obligation.label} ${kindLabel} as paid`}
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition ${obligation.paid ? 'border-transparent bg-good-mark text-on-ink' : 'border-line-strong text-transparent hover:border-ink-3 hover:text-ink-3'}`}
      >
        <Check size={14} strokeWidth={3} />
      </button>
      <button type="button" onClick={() => onEdit(obligation)} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg py-1 text-left transition hover:bg-subtle/60">
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-sm text-ink"><ObligationIcon obligation={obligation} /><span className="truncate">{obligation.label}</span></span>
          <span className={`mt-0.5 block text-xs ${overdue ? 'text-bad' : 'text-ink-3'}`}>
            {when}
            {obligation.estimated && !obligation.needsAmount && <span className="text-warn"> · estimate</span>}
            {highBy !== null && <span className="text-warn"> · {formatYen(highBy)} above usual</span>}
            {obligation.installment > 0 && ` · incl. ${formatYen(obligation.installment)} installment`}
            {obligation.splitAmount > 0 && ` · ${formatYen(obligation.splitAmount)} split`}
          </span>
        </span>
        {obligation.needsAmount ? (
          <span className="shrink-0 rounded-md bg-warn-soft px-2 py-1 text-xs text-warn">Add amount</span>
        ) : (
          <span className={`shrink-0 text-sm tabular-nums ${obligation.paid ? 'text-ink-3' : 'text-ink-2'}`}>
            −{formatYen(obligation.amount)}
          </span>
        )}
      </button>
    </div>
  );
};

/** Preview of the coming cycle, driven by this month's card totals. */
const NextCycleCard: React.FC<{ plan: CyclePlan; onOpenCards: () => void }> = ({ plan, onOpenCards }) => {
  const breakdown = cycleBreakdown(plan);
  const cardItems = plan.obligations.filter((item) => item.kind === 'card');
  const salaryKnown = plan.salary > 0;
  const latestUsage = cardItems.map((item) => item.usage?.asOf).filter(Boolean).sort().at(-1);
  const monthStillOpen = cardItems.some((item) => item.usage && item.usage.usageMonth >= monthKeyOf(todayLocalDate()));
  const note = cardItems.some((item) => item.needsAmount)
    ? 'Some cards have no bills yet. Add their totals for an estimate.'
    : latestUsage
      ? `Card totals from ${formatShortDate(latestUsage)}${monthStillOpen ? ', plus your usual pace for the rest of the month' : ''}.`
      : 'Based on your usual card bills. Add card totals for a closer estimate.';

  return (
    <section className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium text-ink">Next cycle</h2>
          <p className="text-xs text-ink-3">From {formatWeekdayDate(plan.cycle.start)}</p>
        </div>
        <button type="button" onClick={onOpenCards} className="btn-ghost -mr-2 -mt-1.5">Card totals <ArrowRight size={13} /></button>
      </div>
      <p className="mt-2 text-[13px] text-ink-2">{salaryKnown ? 'Free before carry-over' : 'Bills next cycle'}</p>
      <p className={`text-2xl font-medium tabular-nums ${salaryKnown && plan.free < 0 ? 'text-bad' : 'text-ink'}`}>
        {salaryKnown ? formatSignedYen(plan.free) : formatYen(plan.obligationsTotal)}
      </p>
      <div className="mt-3 border-t border-line pt-1.5">
        <Row label="Salary" value={salaryKnown ? formatYen(plan.salary) : <span className="text-ink-3">At check-in</span>} muted />
        <Row label="Card bills" value={`−${formatYen(breakdown.cards)}`} muted />
        <Row label="Transfer bills" value={`−${formatYen(breakdown.bills)}`} muted />
        {plan.savings > 0 && <Row label="Savings" value={`−${formatYen(plan.savings)}`} muted />}
      </div>
      <p className="mt-2 text-xs leading-relaxed text-ink-3">{note}</p>
    </section>
  );
};

export const CycleHome: React.FC<CycleHomeProps> = ({
  plan, nextPlan, isConfigured, onCheckBalance, onOpenCards, onShiftCycle, onToday, onSetup, onCheckIn, onTogglePaid, onEditObligation, onAddCash, onOpenActivity, onEditTransaction,
}) => {
  const { cycle, record, status } = plan;
  const today = todayLocalDate();
  const confirmed = Boolean(record);
  const isMidCycleStart = Boolean(record?.trackingFrom) && plan.salary === 0;
  const awaitingCheckIn = status === 'current' && !record;
  const showCheckIn = awaitingCheckIn && isConfigured;
  const upcoming = plan.obligations.filter((obligation) => obligation.dueDate >= today);
  const joinedLate = plan.dayNumber > 3;
  const spentShare = plan.free > 0 ? Math.min(100, (plan.cashSpent / plan.free) * 100) : plan.cashSpent > 0 ? 100 : 0;
  const isLive = status === 'current' && confirmed;
  const todayLeft = plan.perDay - plan.spentToday;
  const todayShare = plan.perDay > 0 ? Math.min(100, (plan.spentToday / plan.perDay) * 100) : plan.spentToday > 0 ? 100 : 0;
  const recent = [...plan.cashTransactions]
    .sort((a, b) => b.date.localeCompare(a.date) || (b.created_at ?? '').localeCompare(a.created_at ?? ''))
    .slice(0, 6);

  const cycleNote = status === 'current'
    ? `Day ${plan.dayNumber} of ${plan.daysTotal}`
    : status === 'future' ? `Starts in ${diffDays(today, cycle.start)} days` : 'Ended';

  // Before a salary is known, a "free" figure would just be minus the bills.
  const salaryUnknown = !confirmed && plan.salary === 0;
  const heroLabel = salaryUnknown ? 'Bills this cycle' : status === 'past' ? 'Left at the end' : status === 'future' ? 'Free next cycle' : 'Left to spend';
  const heroNote = salaryUnknown
    ? `Salary is added at check-in on ${formatWeekdayDate(cycle.payday)}`
    : !confirmed && status !== 'past'
    ? status === 'future' ? `Estimate · starts ${formatWeekdayDate(cycle.start)}` : 'Estimate until you check in'
    : status === 'current'
      ? plan.left > 0 ? `${formatYen(plan.perDay)} a day for ${plan.daysLeft} ${plan.daysLeft === 1 ? 'day' : 'days'}` : 'Over budget for this cycle'
      : status === 'future' ? `Starts ${formatWeekdayDate(cycle.start)}` : `Cycle ended ${formatWeekdayDate(cycle.end)}`;

  return (
    <div className="space-y-4 pb-28">
      <section className="flex items-center justify-between gap-2">
        <button type="button" onClick={() => onShiftCycle(-1)} className="flex h-10 w-10 items-center justify-center rounded-full text-ink-2 transition hover:bg-card hover:text-ink" aria-label="Previous cycle">
          <ChevronLeft size={20} />
        </button>
        <div className="min-w-0 text-center">
          <p className="text-[13px] text-ink-2">Pay cycle · {cycleNote}</p>
          <p className="text-base font-medium text-ink">{formatShortDate(cycle.start)} – {formatShortDate(cycle.end)}</p>
        </div>
        <div className="flex items-center">
          {status !== 'current' && <button type="button" onClick={onToday} className="btn-ghost">Today</button>}
          <button type="button" onClick={() => onShiftCycle(1)} className="flex h-10 w-10 items-center justify-center rounded-full text-ink-2 transition hover:bg-card hover:text-ink" aria-label="Next cycle">
            <ChevronRight size={20} />
          </button>
        </div>
      </section>

      {!isConfigured && (
        <section className="card p-5">
          <div className="flex items-center gap-2 text-sm font-medium text-ink"><Sparkles size={16} className="text-accent" /> Set up your cards and bills</div>
          <p className="mt-2 text-sm leading-relaxed text-ink-2">
            {APP_NAME} plans each pay cycle from payday to payday. Add your cards and transfer bills once. On payday you enter the card bills, and {APP_NAME} shows what's free to spend.
          </p>
          <button type="button" onClick={onSetup} className="btn-primary mt-4">Set up cards and bills</button>
        </section>
      )}

      {showCheckIn && (
        <section className="card border-accent/50 p-4">
          <p className="text-sm font-medium text-ink">{joinedLate ? 'Start tracking this cycle' : 'Payday check-in'}</p>
          <p className="mt-1 text-sm leading-relaxed text-ink-2">
            {joinedLate
              ? `Enter today's balance and the bills still to come. Next payday is ${formatWeekdayDate(addDays(cycle.end, 1))}.`
              : `Salary day was ${formatWeekdayDate(cycle.payday)}. Confirm your salary and card bills to see what's free.`}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {joinedLate ? (
              <>
                <button type="button" onClick={() => onCheckIn('today')} className="btn-primary">Start from today</button>
                <button type="button" onClick={() => onCheckIn('payday')} className="btn">Full check-in</button>
              </>
            ) : (
              <button type="button" onClick={() => onCheckIn('payday')} className="btn-primary">Start check-in</button>
            )}
          </div>
        </section>
      )}

      {isConfigured && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-start">
          {awaitingCheckIn ? (
            <section className="card p-5">
              <h2 className="text-sm font-medium text-ink">Coming up before payday</h2>
              <p className="mt-0.5 text-xs text-ink-3">Check in to see what's free to spend.</p>
              {upcoming.length === 0 ? (
                <p className="pt-3 text-sm text-ink-2">No more bills this cycle.</p>
              ) : (
                <div className="mt-2">
                  {upcoming.map((obligation) => (
                    <ObligationRow key={obligation.key} obligation={obligation} trackOverdue={false} onTogglePaid={onTogglePaid} onEdit={onEditObligation} />
                  ))}
                </div>
              )}
            </section>
          ) : (
          <section className="card p-5">
            <div className="flex items-start justify-between gap-3">
              <p className="text-[13px] text-ink-2">{heroLabel}</p>
              {record && status === 'current' && (
                <button type="button" onClick={() => onCheckIn(isMidCycleStart ? 'today' : 'payday')} className="btn-ghost -mr-2 -mt-1.5">Edit check-in</button>
              )}
            </div>
            <p className={`mt-0.5 text-[34px] font-medium leading-tight tabular-nums ${salaryUnknown ? 'text-ink' : plan.left < 0 ? 'text-bad' : 'text-good'}`}>
              {salaryUnknown ? formatYen(plan.obligationsTotal) : formatSignedYen(plan.left)}
            </p>
            <p className="text-sm text-ink-2">{heroNote}</p>
            {isLive && plan.left > 0 ? (
              <div className="mb-4 mt-4 rounded-lg bg-subtle px-3 py-2.5">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-ink-2">Today</span>
                  {todayLeft >= 0 ? (
                    <span className="tabular-nums"><span className="text-ink">{formatYen(todayLeft)} left</span> <span className="text-ink-3">of {formatYen(plan.perDay)}</span></span>
                  ) : (
                    <span className="tabular-nums text-bad">{formatYen(-todayLeft)} over today's budget</span>
                  )}
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-card" aria-hidden="true">
                  <div className={`h-full rounded-full ${todayLeft < 0 ? 'bg-bad' : 'bg-ink-2'}`} style={{ width: `${todayShare}%` }} />
                </div>
              </div>
            ) : (
              <div className="mb-4 mt-4 h-1.5 overflow-hidden rounded-full bg-subtle" aria-hidden="true">
                <div className={`h-full rounded-full ${plan.left < 0 ? 'bg-bad' : 'bg-ink-2'}`} style={{ width: `${spentShare}%` }} />
              </div>
            )}

            <div className="border-t border-line pt-2">
              {isMidCycleStart ? (
                <Row label={`Balance on ${formatShortDate(plan.countFrom)}`} value={formatYen(plan.carryover)} />
              ) : (
                <>
                  <Row label={`Salary · ${formatShortDate(cycle.payday)}`} value={salaryUnknown ? <span className="text-ink-3">At check-in</span> : formatYen(plan.salary)} />
                  {(plan.carryover > 0 || confirmed) && <Row label="Carried over" value={`${plan.carryover > 0 ? "+" : ""}${formatYen(plan.carryover)}`} muted />}
                </>
              )}
              {plan.otherIncome > 0 && <Row label="Other income" value={`+${formatYen(plan.otherIncome)}`} muted />}
              {plan.savings > 0 && <Row label="Set aside for savings" value={`−${formatYen(plan.savings)}`} muted />}
              <div className="my-1">
                {plan.obligations.map((obligation) => (
                  <ObligationRow key={obligation.key} obligation={obligation} trackOverdue={status === 'current'} onTogglePaid={onTogglePaid} onEdit={onEditObligation} />
                ))}
              </div>
              <div className="mt-1 border-t border-line pt-1">
                {salaryUnknown
                  ? <Row label="Bills this cycle" value={`−${formatYen(plan.obligationsTotal)}`} strong />
                  : <Row label="Free this cycle" value={formatSignedYen(plan.free)} strong />}
                <button type="button" onClick={onOpenActivity} className="flex w-full items-center justify-between gap-3 py-1.5 text-sm text-ink-2 transition hover:text-ink">
                  <span className="flex items-center gap-1">Cash spent so far <ArrowRight size={13} /></span>
                  <span className="tabular-nums">{plan.cashSpent > 0 ? '−' : ''}{formatYen(plan.cashSpent)}</span>
                </button>
                {isLive && (
                  <button type="button" onClick={onCheckBalance} className="mt-1 flex w-full items-center justify-between gap-3 rounded-lg bg-subtle px-3 py-2 text-left text-[13px] text-ink-2 transition hover:text-ink">
                    <span>Does this match your bank balance?</span>
                    <span className="flex shrink-0 items-center gap-1 text-ink">Check <ArrowRight size={13} /></span>
                  </button>
                )}
              </div>
            </div>
          </section>
          )}

          <div className="space-y-4">
          {isLive && <NextCycleCard plan={nextPlan} onOpenCards={onOpenCards} />}
          <section className="card p-5">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h2 className="text-sm font-medium text-ink">Cash spending</h2>
              {recent.length > 0 && <button type="button" onClick={onOpenActivity} className="btn-ghost -mr-2">See all <ArrowRight size={13} /></button>}
            </div>
            {recent.length === 0 ? (
              <div className="py-2">
                <p className="text-sm leading-relaxed text-ink-2">Log what you pay in cash or by debit. Card purchases are covered by the card bill.</p>
                {status === 'current' && <button type="button" onClick={onAddCash} className="btn mt-3"><Plus size={16} /> Add cash expense</button>}
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {recent.map((transaction) => (
                  <li key={transaction.id}>
                    <button type="button" onClick={() => onEditTransaction(transaction)} className="flex w-full items-center gap-3 py-2.5 text-left">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-subtle text-ink-2"><CategoryIcon category={transaction.category} size={15} /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-ink">{transaction.description || transaction.category}</span>
                        <span className="block text-xs text-ink-3">{formatWeekdayDate(fromDate(new Date(transaction.date)))}</span>
                      </span>
                      <span className={`shrink-0 text-sm tabular-nums ${transaction.type === 'income' ? 'text-good' : 'text-ink'}`}>
                        {transaction.type === 'income' ? '+' : '−'}{formatYen(transaction.amount)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          </div>
        </div>
      )}
    </div>
  );
};

