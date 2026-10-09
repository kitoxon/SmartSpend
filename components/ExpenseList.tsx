import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, SlidersHorizontal, XCircle } from 'lucide-react';
import { Category, Transaction } from '../types';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../constants';
import { CategoryIcon } from './ui/CategoryIcon';
import { cashOutflowFor, isTransferLike } from '../utils/transactions';
import { formatShortDate, formatWeekdayDate, fromDate } from '../utils/jpCalendar';
import { formatYen } from '../utils/format';

interface DateRange {
  start: string;
  end: string;
}

interface ExpenseListProps {
  expenses: Transaction[];
  onEdit: (tx: Transaction) => void;
  currentCycle: DateRange;
  previousCycle: DateRange;
}

type SortOption = 'date-new' | 'date-old' | 'amount-high' | 'amount-low';
type RangeOption = 'cycle' | 'lastCycle' | 'all' | 'custom';
type TypeFilterOption = 'all' | 'income' | 'expense';

const RANGE_LABELS: Record<RangeOption, string> = { cycle: 'This cycle', lastCycle: 'Last cycle', all: 'All', custom: 'Custom' };
const SORT_LABELS: Record<SortOption, string> = { 'date-new': 'Newest', 'date-old': 'Oldest', 'amount-high': 'Highest', 'amount-low': 'Lowest' };

const localDateOf = (transaction: Transaction) => fromDate(new Date(transaction.date));

export const ExpenseList: React.FC<ExpenseListProps> = ({ expenses: transactions, onEdit, currentCycle, previousCycle }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<Category | 'All'>('All');
  const [sortBy, setSortBy] = useState<SortOption>('date-new');
  const [showFilters, setShowFilters] = useState(false);
  const [visibleCount, setVisibleCount] = useState(30);
  const [range, setRange] = useState<RangeOption>('cycle');
  const [typeFilter, setTypeFilter] = useState<TypeFilterOption>('all');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const activeRange: DateRange | null = range === 'cycle'
    ? currentCycle
    : range === 'lastCycle'
      ? previousCycle
      : range === 'custom' && customStart && customEnd ? { start: customStart, end: customEnd } : null;

  const processed = useMemo(() => {
    const term = searchTerm.trim().toLocaleLowerCase();
    const result = transactions.filter((transaction) => {
      if (term && !`${transaction.description} ${transaction.category} ${transaction.amount}`.toLocaleLowerCase().includes(term)) return false;
      if (selectedCategory !== 'All' && transaction.category !== selectedCategory) return false;
      if (typeFilter !== 'all' && transaction.type !== typeFilter) return false;
      if (activeRange) {
        const date = localDateOf(transaction);
        if (date < activeRange.start || date > activeRange.end) return false;
      }
      return true;
    });
    return result.sort((a, b) => {
      switch (sortBy) {
        case 'date-old': return new Date(a.date).getTime() - new Date(b.date).getTime();
        case 'amount-high': return b.amount - a.amount;
        case 'amount-low': return a.amount - b.amount;
        default: return new Date(b.date).getTime() - new Date(a.date).getTime() || (b.created_at ?? '').localeCompare(a.created_at ?? '');
      }
    });
  }, [transactions, searchTerm, selectedCategory, typeFilter, activeRange?.start, activeRange?.end, sortBy]);

  const summary = useMemo(() => processed.reduce((totals, transaction) => {
    if (transaction.type === 'income') totals.income += transaction.amount;
    totals.spent += cashOutflowFor(transaction);
    return totals;
  }, { income: 0, spent: 0 }), [processed]);

  const visible = processed.slice(0, visibleCount);
  const groups = useMemo(() => {
    if (sortBy.startsWith('amount')) return null;
    const byDate = new Map<string, Transaction[]>();
    for (const transaction of visible) {
      const key = localDateOf(transaction);
      byDate.set(key, [...(byDate.get(key) ?? []), transaction]);
    }
    return [...byDate.entries()];
  }, [visible, sortBy]);

  useEffect(() => {
    setVisibleCount(30);
  }, [searchTerm, selectedCategory, sortBy, range, typeFilter, customStart, customEnd]);

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) setVisibleCount((count) => Math.min(count + 30, processed.length));
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [processed.length]);

  const rangeLabel = activeRange ? `${formatShortDate(activeRange.start)} – ${formatShortDate(activeRange.end)}` : range === 'custom' ? 'Pick dates' : 'All history';
  const filtersActive = typeFilter !== 'all' || selectedCategory !== 'All' || sortBy !== 'date-new';

  const renderItem = (item: Transaction, showDate: boolean) => (
    <li key={item.id}>
      <button type="button" onClick={() => onEdit(item)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-subtle/60">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-subtle text-ink-2"><CategoryIcon category={item.category} size={16} /></span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-ink">{item.description || item.category}</span>
          <span className="block truncate text-xs text-ink-3">
            {isTransferLike(item) ? `${item.category} · transfer` : item.category}
            {showDate && ` · ${formatWeekdayDate(localDateOf(item))}`}
          </span>
        </span>
        <span className={`shrink-0 text-sm tabular-nums ${item.type === 'income' ? 'text-good' : 'text-ink'}`}>
          {item.type === 'income' ? '+' : isTransferLike(item) ? '' : '−'}{formatYen(item.amount)}
        </span>
      </button>
    </li>
  );

  return (
    <div className="space-y-3 pb-28">
      <div className="sticky top-14 z-10 -mx-4 space-y-2 bg-page/95 px-4 pb-2 pt-1 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" size={16} />
            <input type="search" placeholder="Search" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} className="field pl-9 pr-9" aria-label="Search transactions" />
            {searchTerm && (
              <button type="button" onClick={() => setSearchTerm('')} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink">
                <XCircle size={16} />
              </button>
            )}
          </div>
          <button type="button" onClick={() => setShowFilters((value) => !value)} aria-label="Filters" aria-expanded={showFilters} className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border transition ${showFilters ? 'border-transparent bg-ink text-on-ink' : 'border-line bg-card text-ink-2 hover:text-ink'}`}>
            <SlidersHorizontal size={17} />
            {filtersActive && !showFilters && <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-accent" />}
          </button>
        </div>

        <div className="flex gap-1.5 overflow-x-auto">
          {(Object.keys(RANGE_LABELS) as RangeOption[]).map((option) => (
            <button key={option} type="button" onClick={() => setRange(option)} aria-pressed={range === option} className={`shrink-0 ${range === option ? 'chip-on' : 'chip'}`}>{RANGE_LABELS[option]}</button>
          ))}
        </div>

        {range === 'custom' && (
          <div className="flex items-center gap-2">
            <input type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} aria-label="From" className="field h-10 flex-1" />
            <span className="text-ink-3">–</span>
            <input type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} aria-label="To" className="field h-10 flex-1" />
          </div>
        )}

        {showFilters && (
          <div className="card space-y-3 p-3 animate-fade-in">
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-subtle p-1">
              {(['all', 'expense', 'income'] as TypeFilterOption[]).map((option) => (
                <button key={option} type="button" onClick={() => setTypeFilter(option)} className={`rounded-md py-1.5 text-[13px] capitalize transition ${typeFilter === option ? 'bg-card text-ink' : 'text-ink-2'}`}>
                  {option === 'all' ? 'All' : option === 'expense' ? 'Spending' : 'Income'}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <select value={selectedCategory} onChange={(event) => setSelectedCategory(event.target.value as Category | 'All')} aria-label="Category" className="field h-10 text-sm">
                <option value="All">All categories</option>
                {[...new Set([...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES])].map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
              <select value={sortBy} onChange={(event) => setSortBy(event.target.value as SortOption)} aria-label="Sort" className="field h-10 text-sm">
                {(Object.keys(SORT_LABELS) as SortOption[]).map((option) => <option key={option} value={option}>{SORT_LABELS[option]}</option>)}
              </select>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-baseline justify-between gap-x-3 px-1 text-xs text-ink-3">
          <span>{processed.length} {processed.length === 1 ? 'entry' : 'entries'} · {rangeLabel}</span>
          <span className="tabular-nums">Spent <span className="text-ink-2">{formatYen(summary.spent)}</span>{summary.income > 0 && <> · Income <span className="text-good">{formatYen(summary.income)}</span></>}</span>
        </div>
      </div>

      {processed.length === 0 ? (
        <div className="card px-6 py-12 text-center">
          <p className="text-sm text-ink">Nothing here yet</p>
          <p className="mt-1 text-[13px] text-ink-2">{range === 'cycle' ? 'Cash spending you log this cycle shows up here.' : 'Try another period or clear the filters.'}</p>
        </div>
      ) : groups ? (
        groups.map(([date, items]) => (
          <section key={date}>
            <h3 className="mb-1.5 px-1 text-xs text-ink-3">{formatWeekdayDate(date)}</h3>
            <ul className="card divide-y divide-line overflow-hidden">{items.map((item) => renderItem(item, false))}</ul>
          </section>
        ))
      ) : (
        <ul className="card divide-y divide-line overflow-hidden">{visible.map((item) => renderItem(item, true))}</ul>
      )}
      <div ref={loadMoreRef} className="h-8" />
    </div>
  );
};
