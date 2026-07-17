import React, { useRef, useState } from 'react';
import { Bell, BellOff, ChevronDown, Cloud, CloudOff, Download, LogOut, RefreshCw, Repeat, Trash2, Upload } from 'lucide-react';
import { RecurringTransaction } from '../types';
import type { HabitPattern } from '../services/habitService';
import type { SyncSnapshot } from '../services/storageService';

interface SettingsPanelProps {
  email: string | null;
  sync: SyncSnapshot;
  recurringRules: RecurringTransaction[];
  habitPatterns: HabitPattern[];
  remindersEnabled: boolean;
  onRetrySync: () => void;
  onDeleteRecurring: (id: string) => void;
  onExport: () => void;
  onImport: (file: File) => Promise<string>;
  onToggleReminders: () => void;
  onToggleHabit: (habitId: string) => void;
  onSignOut: () => void;
}

const scheduleLabel = (pattern: HabitPattern) => {
  if (pattern.intervalType === 'weekly') {
    const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const mostLikelyDay = pattern.dowProb.indexOf(Math.max(...pattern.dowProb));
    return `Weekly · usually ${weekdays[mostLikelyDay]}`;
  }
  if (pattern.intervalType === 'monthly') return `Monthly · about every ${pattern.intervalDaysMedian ?? 30} days`;
  if (pattern.intervalType === 'daily') return 'Frequent · on usual days and time';
  return 'No reliable schedule';
};

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  email,
  sync,
  recurringRules,
  habitPatterns,
  remindersEnabled,
  onRetrySync,
  onDeleteRecurring,
  onExport,
  onImport,
  onToggleReminders,
  onToggleHabit,
  onSignOut,
}) => {
  const importInput = useRef<HTMLInputElement | null>(null);
  const [importStatus, setImportStatus] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [showAllReminders, setShowAllReminders] = useState(false);
  const isLocalOnly = !email;
  const isHealthy = !isLocalOnly && !sync.lastError && sync.pendingCount === 0;
  const scheduledHabits = [...habitPatterns]
    .filter((pattern) => pattern.intervalType !== 'unknown')
    .sort((a, b) => Number(b.active) - Number(a.active) || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  const visibleHabits = showAllReminders ? scheduledHabits : scheduledHabits.slice(0, 5);
  const syncLabel = isLocalOnly
    ? 'Stored on this device'
    : sync.isSyncing
      ? 'Syncing…'
      : sync.pendingCount > 0
        ? `${sync.pendingCount} change${sync.pendingCount === 1 ? '' : 's'} waiting`
        : sync.lastError
          ? 'Needs attention'
          : 'Up to date';

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setIsImporting(true);
    setImportStatus(null);
    try {
      const message = await onImport(file);
      setImportStatus({ kind: 'success', message });
    } catch (error) {
      setImportStatus({ kind: 'error', message: error instanceof Error ? error.message : 'Could not import this backup.' });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-wider font-bold text-zinc-500">Cloud account</p>
            <p className="text-sm text-zinc-200 mt-1 truncate max-w-[240px]">{email ?? 'Local-only mode'}</p>
          </div>
          {isHealthy ? <Cloud size={20} className="text-emerald-400" /> : <CloudOff size={20} className={isLocalOnly ? 'text-zinc-600' : 'text-amber-400'} />}
        </div>
        <div className="rounded-lg bg-zinc-950 border border-zinc-800 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-zinc-200">{syncLabel}</p>
              {sync.lastSyncedAt && <p className="text-[10px] text-zinc-600 mt-1">This device last synced {new Date(sync.lastSyncedAt).toLocaleString()}</p>}
            </div>
            {!isLocalOnly && (
              <button onClick={onRetrySync} disabled={sync.isSyncing} className="h-9 px-3 rounded-md bg-zinc-800 text-[10px] font-bold uppercase tracking-wide text-zinc-300 flex items-center gap-1.5 disabled:opacity-50">
                <RefreshCw size={12} className={sync.isSyncing ? 'animate-spin' : ''} /> Retry
              </button>
            )}
          </div>
          {isLocalOnly && <p className="text-[10px] text-zinc-600 mt-2">Add Supabase environment values to enable PC and smartphone sync.</p>}
          {sync.lastError && <p className="text-[10px] text-amber-400 mt-2 break-words">{sync.lastError}</p>}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">{remindersEnabled ? <Bell size={12} /> : <BellOff size={12} />} Learned reminders <span className="text-zinc-700">{scheduledHabits.length}</span></p>
            <p className="mt-1 text-[10px] text-zinc-600">Automatic reminder master switch for this device</p>
          </div>
          <button type="button" role="switch" aria-checked={remindersEnabled} onClick={onToggleReminders} className={`relative h-7 w-12 shrink-0 rounded-full border transition ${remindersEnabled ? 'border-emerald-400/40 bg-emerald-400/20' : 'border-zinc-700 bg-zinc-900'}`}>
            <span className={`absolute top-1 h-5 w-5 rounded-full transition-all ${remindersEnabled ? 'left-6 bg-emerald-300' : 'left-1 bg-zinc-600'}`} />
          </button>
        </div>
        {scheduledHabits.length === 0 ? (
          <p className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 text-xs text-zinc-600">No reliable reminder patterns learned yet.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-zinc-800">
            {visibleHabits.map((pattern) => (
              <div key={pattern.habitId} className="flex items-center justify-between gap-3 border-b border-zinc-800 bg-zinc-950 p-3 last:border-b-0">
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold text-zinc-200">{pattern.merchantKey ?? pattern.category}</p>
                  <p className="mt-1 text-[10px] text-zinc-600">{scheduleLabel(pattern)} · around ¥{pattern.amountMedian.toLocaleString()}</p>
                </div>
                <button type="button" role="switch" aria-label={`${pattern.active ? 'Pause' : 'Enable'} ${pattern.merchantKey ?? pattern.category} reminder`} aria-checked={pattern.active} onClick={() => onToggleHabit(pattern.habitId)} className={`relative h-6 w-10 shrink-0 rounded-full border transition ${pattern.active ? 'border-zinc-500 bg-zinc-700' : 'border-zinc-800 bg-black'}`}>
                  <span className={`absolute top-0.5 h-4 w-4 rounded-full transition-all ${pattern.active ? 'left-5 bg-white' : 'left-0.5 bg-zinc-700'}`} />
                </button>
              </div>
            ))}
            {scheduledHabits.length > 5 && (
              <button type="button" onClick={() => setShowAllReminders((value) => !value)} className="flex min-h-11 w-full items-center justify-center gap-1.5 bg-zinc-950 text-[10px] font-bold text-zinc-500 transition hover:text-zinc-300">
                {showAllReminders ? 'Show less' : `Show ${scheduledHabits.length - 5} more`}
                <ChevronDown size={13} className={`transition-transform ${showAllReminders ? 'rotate-180' : ''}`} />
              </button>
            )}
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] uppercase tracking-wider font-bold text-zinc-500 flex items-center gap-1.5"><Repeat size={12} /> Recurring transactions</p>
          <span className="text-[10px] text-zinc-600">{recurringRules.length}</span>
        </div>
        {recurringRules.length === 0 ? (
          <p className="text-xs text-zinc-600 rounded-lg border border-zinc-800 bg-zinc-950 p-4">No recurring transactions.</p>
        ) : (
          <div className="rounded-lg border border-zinc-800 overflow-hidden">
            {recurringRules.map((rule) => (
              <div key={rule.id} className="flex items-center justify-between gap-3 p-3 bg-zinc-950 border-b border-zinc-800 last:border-b-0">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-zinc-200 truncate">{rule.transactionTemplate.description.replace(/^\(Recurring\)\s*/i, '')}</p>
                  <p className="text-[10px] text-zinc-600 mt-1 capitalize">{rule.frequency} · next {new Date(rule.nextDue).toLocaleDateString()}</p>
                </div>
                <button onClick={() => onDeleteRecurring(rule.id)} className="p-2 text-zinc-600 hover:text-red-400" aria-label="Delete recurring transaction"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Backup & recovery</p>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={onExport} className="h-11 rounded-lg border border-zinc-800 bg-zinc-950 text-zinc-300 text-[10px] uppercase tracking-wide font-bold flex items-center justify-center gap-2"><Download size={14} /> Export</button>
          <button onClick={() => importInput.current?.click()} disabled={isImporting} className="h-11 rounded-lg border border-zinc-800 bg-zinc-950 text-zinc-300 text-[10px] uppercase tracking-wide font-bold flex items-center justify-center gap-2 disabled:opacity-50"><Upload size={14} /> {isImporting ? 'Importing…' : 'Merge backup'}</button>
          <input ref={importInput} type="file" accept="application/json,.json" onChange={handleImportFile} className="hidden" />
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-zinc-600">Merge backup keeps current records and updates matching IDs. It does not erase newer data.</p>
        {importStatus && <p className={`mt-2 rounded-lg px-3 py-2 text-xs ${importStatus.kind === 'success' ? 'bg-emerald-500/10 text-emerald-300' : 'bg-rose-500/10 text-rose-300'}`}>{importStatus.message}</p>}
      </section>

      {email && (
        <button onClick={onSignOut} className="h-11 w-full rounded-lg border border-zinc-800 bg-zinc-950 text-zinc-400 text-[10px] uppercase tracking-wide font-bold flex items-center justify-center gap-2"><LogOut size={14} /> Sign out</button>
      )}
    </div>
  );
};
