import React from 'react';
import { Cloud, CloudOff, Download, LogOut, RefreshCw, Repeat, Trash2 } from 'lucide-react';
import { RecurringTransaction } from '../types';
import type { SyncSnapshot } from '../services/storageService';

interface SettingsPanelProps {
  email: string | null;
  sync: SyncSnapshot;
  recurringRules: RecurringTransaction[];
  onRetrySync: () => void;
  onDeleteRecurring: (id: string) => void;
  onExport: () => void;
  onSignOut: () => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  email,
  sync,
  recurringRules,
  onRetrySync,
  onDeleteRecurring,
  onExport,
  onSignOut,
}) => {
  const isLocalOnly = !email;
  const isHealthy = !isLocalOnly && !sync.lastError && sync.pendingCount === 0;
  const syncLabel = isLocalOnly
    ? 'Stored on this device'
    : sync.isSyncing
    ? 'Syncing…'
    : sync.pendingCount > 0
      ? `${sync.pendingCount} change${sync.pendingCount === 1 ? '' : 's'} waiting`
      : sync.lastError
        ? 'Needs attention'
        : 'Up to date';

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
              {sync.lastSyncedAt && (
                <p className="text-[10px] text-zinc-600 mt-1">Last synced {new Date(sync.lastSyncedAt).toLocaleString()}</p>
              )}
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
                <button onClick={() => onDeleteRecurring(rule.id)} className="p-2 text-zinc-600 hover:text-red-400" aria-label="Delete recurring transaction">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="grid grid-cols-2 gap-3">
        <button onClick={onExport} className="h-11 rounded-lg border border-zinc-800 bg-zinc-950 text-zinc-300 text-[10px] uppercase tracking-wide font-bold flex items-center justify-center gap-2">
          <Download size={14} /> Export backup
        </button>
        {email && (
          <button onClick={onSignOut} className="h-11 rounded-lg border border-zinc-800 bg-zinc-950 text-zinc-400 text-[10px] uppercase tracking-wide font-bold flex items-center justify-center gap-2">
            <LogOut size={14} /> Sign out
          </button>
        )}
      </section>
    </div>
  );
};
