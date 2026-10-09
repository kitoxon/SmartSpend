import React, { useState } from 'react';
import { CyclePlan, expectedBalance } from '../utils/payCycle';
import { formatYen, parseAmount } from '../utils/format';
import { AmountInput } from './ui/AmountInput';
import { APP_NAME } from '../constants';

interface BalanceCheckProps {
  plan: CyclePlan;
  savingsInAccount: boolean;
  /** Positive: more money than expected (income). Negative: unlogged spending. */
  onSave: (difference: number, savingsInAccount: boolean) => Promise<void>;
  onCancel: () => void;
}

export const BalanceCheck: React.FC<BalanceCheckProps> = ({ plan, savingsInAccount: initialSavingsInAccount, onSave, onCancel }) => {
  const [balance, setBalance] = useState('');
  const [savingsInAccount, setSavingsInAccount] = useState(initialSavingsInAccount);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const expected = expectedBalance(plan, savingsInAccount);
  const real = parseAmount(balance);
  const difference = real === null ? null : real - expected;

  const save = async () => {
    if (difference === null) return;
    setSaving(true);
    try {
      await onSave(difference, savingsInAccount);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save.');
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="real-balance" className="field-label">Your balance now, account and wallet</label>
        <AmountInput id="real-balance" value={balance} onChange={setBalance} size="lg" placeholder="0" autoFocus />
      </div>

      <div className="space-y-1.5 rounded-lg bg-subtle p-3 text-[13px]">
        <div className="flex justify-between text-ink-2"><span>Left to spend</span><span className="tabular-nums">{formatYen(plan.left)}</span></div>
        <div className="flex justify-between text-ink-2"><span>Bills not paid yet</span><span className="tabular-nums">{formatYen(plan.unpaidTotal)}</span></div>
        {plan.savings > 0 && (
          <label className="flex cursor-pointer items-center justify-between gap-3 text-ink-2">
            <span className="flex items-center gap-2">
              <input type="checkbox" checked={savingsInAccount} onChange={(event) => setSavingsInAccount(event.target.checked)} className="h-4 w-4 accent-[rgb(var(--accent))]" />
              Savings still in this account
            </span>
            <span className="tabular-nums">{savingsInAccount ? formatYen(plan.savings) : '—'}</span>
          </label>
        )}
        <div className="flex justify-between border-t border-line pt-1.5 font-medium text-ink"><span>{APP_NAME} expects</span><span className="tabular-nums">{formatYen(expected)}</span></div>
      </div>

      {difference !== null && (
        Math.abs(difference) < 1 ? (
          <p className="rounded-lg bg-good-soft px-3 py-2.5 text-[13px] text-good">It matches. Nothing to change.</p>
        ) : difference < 0 ? (
          <p className="text-[13px] leading-relaxed text-ink-2">
            You have {formatYen(difference)} less than expected, probably spending that wasn't logged. If a bill above is already paid, tick it on Home first.
          </p>
        ) : (
          <p className="text-[13px] leading-relaxed text-ink-2">You have {formatYen(difference)} more than expected. It can be added as income so the plan matches.</p>
        )
      )}

      {error && <p className="text-xs text-bad">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="btn flex-1">{difference !== null && Math.abs(difference) < 1 ? 'Close' : 'Cancel'}</button>
        {difference !== null && Math.abs(difference) >= 1 && (
          <button type="button" onClick={() => void save()} disabled={saving} className="btn-primary flex-[2]">
            {saving ? 'Saving…' : difference < 0 ? `Record ${formatYen(difference)} as spending` : `Add ${formatYen(difference)} as income`}
          </button>
        )}
      </div>
    </div>
  );
};
