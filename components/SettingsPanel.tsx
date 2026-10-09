import React, { useRef, useState } from 'react';
import { Cloud, CloudOff, Download, LogOut, RefreshCw, Repeat, Trash2, Upload } from 'lucide-react';
import { RecurringTransaction } from '../types';
import type { SyncSnapshot } from '../services/storageService';

interface SettingsPanelProps {
  email: string | null;
  sync: SyncSnapshot;
  recurringRules: RecurringTransaction[];
  onRetrySync: () => void;
  onDeleteRecurring: (id: string) => void;
  onExport: () => void;
  onImport: (file: File) => Promise<string>;
  onSignOut: () => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  email, sync, recurringRules, onRetrySync, onDeleteRecurring, onExport, onImport, onSignOut,
}) => {
  const importInput = useRef<HTMLInputElement | null>(null);
  const [importStatus, setImportStatus] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const isLocalOnly = !email;
  const isHealthy = !isLocalOnly && !sync.lastError && sync.pendingCount === 0;
  const syncLabel = isLocalOnly
    ? 'Stored on this device'
    : sync.isSyncing
      ? 'Syncing…'
      : sync.pendingCount > 0
        ? `${sync.pendingCount} change${sync.pendingCount === 1 ? '' : 's'} waiting`
        : sync.lastError ? 'Needs attention' : 'Up to date';

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setIsImporting(true);
    setImportStatus(null);
    try {
      setImportStatus({ kind: 'success', message: await onImport(file) });
    } catch (error) {
      setImportStatus({ kind: 'error', message: error instanceof Error ? error.message : 'Could not import this backup.' });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h4 className="text-sm font-medium text-ink">Account and sync</h4>
        <div className="rounded-xl border border-line p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm text-ink">{email ?? 'Local-only mode'}</p>
              <p className={`mt-0.5 flex items-center gap-1.5 text-xs ${isHealthy ? 'text-good' : isLocalOnly ? 'text-ink-3' : 'text-warn'}`}>
                {isHealthy ? <Cloud size={13} /> : <CloudOff size={13} />} {syncLabel}
              </p>
            </div>
            {!isLocalOnly && (
              <button type="button" onClick={onRetrySync} disabled={sync.isSyncing} className="btn min-h-9 px-3 text-[13px]">
                <RefreshCw size={13} className={sync.isSyncing ? 'animate-spin' : ''} /> Sync now
              </button>
            )}
          </div>
          {sync.lastSyncedAt && <p className="mt-2 text-xs text-ink-3">Last synced {new Date(sync.lastSyncedAt).toLocaleString()}</p>}
          {isLocalOnly && <p className="mt-2 text-xs text-ink-3">Add the Supabase environment values to sync between your phone and computer.</p>}
          {sync.lastError && <p className="mt-2 break-words text-xs text-warn">{sync.lastError}</p>}
        </div>
      </section>

      <section className="space-y-2">
        <h4 className="text-sm font-medium text-ink">Backup</h4>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={onExport} className="btn"><Download size={15} /> Export</button>
          <button type="button" onClick={() => importInput.current?.click()} disabled={isImporting} className="btn"><Upload size={15} /> {isImporting ? 'Importing…' : 'Merge backup'}</button>
          <input ref={importInput} type="file" accept="application/json,.json" onChange={handleImportFile} className="hidden" />
        </div>
        <p className="text-xs leading-relaxed text-ink-3">Merging keeps your current records and updates matching ones. It never erases newer data.</p>
        {importStatus && <p className={`rounded-lg px-3 py-2 text-[13px] ${importStatus.kind === 'success' ? 'bg-good-soft text-good' : 'bg-bad-soft text-bad'}`}>{importStatus.message}</p>}
      </section>

      {recurringRules.length > 0 && (
        <section className="space-y-2">
          <div>
            <h4 className="flex items-center gap-1.5 text-sm font-medium text-ink"><Repeat size={14} /> Old recurring entries</h4>
            <p className="mt-0.5 text-xs leading-relaxed text-ink-3">From the previous version. Transfer bills now handle these, so they no longer add expenses once your bills are set up.</p>
          </div>
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
            {recurringRules.map((rule) => (
              <li key={rule.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm text-ink">{rule.transactionTemplate.description.replace(/^\(Recurring\)\s*/i, '')}</p>
                  <p className="text-xs capitalize text-ink-3">{rule.frequency} · ¥{rule.transactionTemplate.amount.toLocaleString('ja-JP')}</p>
                </div>
                <button type="button" onClick={() => onDeleteRecurring(rule.id)} className="rounded-lg p-2 text-ink-3 hover:bg-subtle hover:text-bad" aria-label="Delete recurring entry"><Trash2 size={15} /></button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {email && (
        <button type="button" onClick={onSignOut} className="btn w-full text-ink-2"><LogOut size={15} /> Sign out</button>
      )}
    </div>
  );
};
