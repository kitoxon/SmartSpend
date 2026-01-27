
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Transaction, Category } from '../types';
import { CATEGORY_COLORS, EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../constants';
import { CategoryIcon } from './ui/CategoryIcon';
import { Trash2, Search, Filter, XCircle, Calendar, ArrowUpDown } from 'lucide-react';

interface ExpenseListProps {
  expenses: Transaction[];
  onDelete: (id: string) => void;
  onEdit: (tx: Transaction) => void;
}

type SortOption = 'date-new' | 'date-old' | 'amount-high' | 'amount-low';
type DateRangeOption = 'all' | 'thisMonth' | 'lastMonth' | 'custom';
type TypeFilterOption = 'all' | 'income' | 'expense';

export const ExpenseList: React.FC<ExpenseListProps> = ({ expenses: transactions, onDelete, onEdit }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<Category | 'All'>('All');
  const [sortBy, setSortBy] = useState<SortOption>('date-new');
  const [showFilters, setShowFilters] = useState(false);
  const [visibleCount, setVisibleCount] = useState(20);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  
  // Filters
  const [dateRange, setDateRange] = useState<DateRangeOption>('thisMonth');
  const [typeFilter, setTypeFilter] = useState<TypeFilterOption>('all');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const processedTransactions = useMemo(() => {
    let result = [...transactions];

    if (searchTerm) {
      const lowerTerm = searchTerm.toLowerCase();
      result = result.filter(t => 
        t.description.toLowerCase().includes(lowerTerm) || 
        t.amount.toString().includes(lowerTerm)
      );
    }

    if (selectedCategory !== 'All') {
      result = result.filter(t => t.category === selectedCategory);
    }

    if (typeFilter !== 'all') {
      result = result.filter(t => t.type === typeFilter);
    }

    if (dateRange !== 'all') {
      const now = new Date();
      let start: Date | null = null;
      let end: Date | null = null;

      if (dateRange === 'thisMonth') {
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      } else if (dateRange === 'lastMonth') {
        start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      } else if (dateRange === 'custom' && customStart && customEnd) {
        start = new Date(customStart);
        end = new Date(customEnd);
        end.setHours(23, 59, 59, 999);
      }

      if (start && end) {
        result = result.filter(t => {
          const d = new Date(t.date);
          return d >= start! && d <= end!;
        });
      }
    }

    result.sort((a, b) => {
      switch (sortBy) {
        case 'date-new': return new Date(b.date).getTime() - new Date(a.date).getTime();
        case 'date-old': return new Date(a.date).getTime() - new Date(b.date).getTime();
        case 'amount-high': return b.amount - a.amount;
        case 'amount-low': return a.amount - b.amount;
        default: return 0;
      }
    });

    return result;
  }, [transactions, searchTerm, selectedCategory, sortBy, dateRange, typeFilter, customStart, customEnd]);

  const displayTransactions = useMemo(
    () => processedTransactions.slice(0, visibleCount),
    [processedTransactions, visibleCount]
  );

  const displayTotalAmount = useMemo(
    () => displayTransactions.reduce((sum, t) => sum + t.amount, 0),
    [displayTransactions]
  );
  const totalFilteredAmount = useMemo(
    () => processedTransactions.reduce((sum, t) => sum + t.amount, 0),
    [processedTransactions]
  );

  const groupedTransactions = useMemo(() => {
    if (sortBy.includes('amount')) return null;

    return displayTransactions.reduce((acc, t) => {
      const dateKey = new Date(t.date).toLocaleDateString(undefined, {
        weekday: 'short', month: 'short', day: 'numeric'
      });
      if (!acc[dateKey]) acc[dateKey] = [];
      acc[dateKey].push(t);
      return acc;
    }, {} as Record<string, Transaction[]>);
  }, [displayTransactions, sortBy]);

  // Reset pagination when filters change
  useEffect(() => {
    setVisibleCount(20);
  }, [searchTerm, selectedCategory, sortBy, dateRange, typeFilter, customStart, customEnd, transactions]);

  // Infinite scroll observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first.isIntersecting) {
          setVisibleCount((prev) => Math.min(prev + 20, processedTransactions.length));
        }
      },
      { threshold: 1 }
    );
    const current = loadMoreRef.current;
    if (current) observer.observe(current);
    return () => {
      if (current) observer.unobserve(current);
      observer.disconnect();
    };
  }, [processedTransactions.length]);

  const totalFilteredCount = processedTransactions.length;

  const renderItem = (item: Transaction, showDateLabel = false) => (
    <div
      key={item.id}
      className="flex items-center p-4 hover:bg-zinc-900/80 transition-colors group border-b border-zinc-800 last:border-0 cursor-pointer"
      onClick={() => onEdit(item)}
    >
      <div 
        className="w-10 h-10 rounded-lg bg-zinc-950 flex items-center justify-center shrink-0 mr-4 border border-zinc-800"
      >
        <CategoryIcon 
          category={item.category} 
          size={18} 
          color={CATEGORY_COLORS[item.category]}
        />
      </div>
      
      <div className="flex-1 min-w-0">
        <p className="font-bold text-sm text-zinc-200 truncate">{item.description}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <p className="text-[10px] font-medium uppercase tracking-wide truncate" style={{ color: CATEGORY_COLORS[item.category] }}>{item.category}</p>
          {showDateLabel && (
            <>
              <span className="text-zinc-800 text-[10px]">•</span>
              <p className="text-[10px] text-zinc-600">{new Date(item.date).toLocaleDateString()}</p>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-col items-end ml-3 shrink-0">
        <span className={`font-bold text-sm tabular-nums ${item.type === 'income' ? 'text-white' : 'text-zinc-500'}`}>
          {item.type === 'income' ? '+' : ''}¥{item.amount.toLocaleString()}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
          className="text-zinc-600 hover:text-red-400 transition-all mt-1 p-1"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4 pb-24">
      {/* Search & Filters */}
      <div className="sticky top-0 z-10 bg-black/90 backdrop-blur-md pb-2 pt-1 border-b border-zinc-900/50 -mx-4 px-4">
        <div className="flex gap-2 mb-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 text-zinc-600" size={16} />
            <input 
              type="text"
              placeholder="Search history..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-200 placeholder-zinc-600 focus:border-zinc-600 outline-none transition-colors focus:bg-zinc-800"
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} className="absolute right-3 top-2.5 text-zinc-500 hover:text-white">
                <XCircle size={16} />
              </button>
            )}
          </div>
          <button 
            onClick={() => setShowFilters(!showFilters)}
            className={`p-2 rounded-lg border transition-all ${showFilters ? 'bg-zinc-100 text-black border-zinc-200' : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'}`}
          >
            <Filter size={18} />
          </button>
        </div>

        <div className="flex items-center justify-between text-[10px] text-zinc-500 px-1 mb-2">
          <span className="font-bold">Showing {displayTransactions.length} of {totalFilteredCount}</span>
          <div className="flex items-center gap-3">
            <span className="text-zinc-400 font-bold tabular-nums">Total (range) ¥{totalFilteredAmount.toLocaleString()}</span>
            <span className="text-zinc-600">Page ¥{displayTotalAmount.toLocaleString()}</span>
            {selectedCategory !== 'All' && <span className="text-zinc-500">{selectedCategory}</span>}
          </div>
        </div>

        {showFilters && (
           <div className="flex flex-col gap-4 p-4 bg-zinc-900 rounded-xl border border-zinc-800 shadow-2xl animate-fade-in mb-4">
              {/* Type Toggle */}
              <div className="flex gap-2 bg-zinc-950 p-1 rounded-lg border border-zinc-900">
                 {(['all', 'income', 'expense'] as TypeFilterOption[]).map(f => (
                   <button
                     key={f}
                     onClick={() => setTypeFilter(f)}
                     className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wide rounded-md transition-all ${
                        typeFilter === f 
                        ? 'bg-zinc-800 text-white shadow-sm' 
                        : 'text-zinc-600 hover:text-zinc-400'
                     }`}
                   >
                     {f}
                   </button>
                 ))}
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Date Range */}
                <div className="col-span-2 sm:col-span-1">
                  <label className="text-[9px] uppercase tracking-wider text-zinc-500 mb-1.5 block ml-1 font-bold flex items-center gap-1">
                    <Calendar size={10} /> Period
                  </label>
                  <select 
                      value={dateRange}
                      onChange={(e) => setDateRange(e.target.value as DateRangeOption)}
                      className="w-full p-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-300 outline-none focus:border-zinc-600 appearance-none font-medium"
                    >
                      <option value="all">All History</option>
                      <option value="thisMonth">Current Month</option>
                      <option value="lastMonth">Last Month</option>
                      <option value="custom">Custom Range</option>
                  </select>
                </div>

                {/* Category */}
                <div className="col-span-2 sm:col-span-1">
                   <label className="text-[9px] uppercase tracking-wider text-zinc-500 mb-1.5 block ml-1 font-bold">Category</label>
                   <select 
                      value={selectedCategory}
                      onChange={(e) => setSelectedCategory(e.target.value as Category | 'All')}
                      className="w-full p-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-300 outline-none focus:border-zinc-600 appearance-none font-medium"
                    >
                      <option value="All">All Categories</option>
                      {INCOME_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                   </select>
                </div>

                {/* Custom Range Inputs */}
                {dateRange === 'custom' && (
                  <div className="col-span-2 flex gap-2 animate-slide-up">
                    <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-xs text-zinc-400 outline-none" />
                    <span className="text-zinc-600 self-center">-</span>
                    <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-xs text-zinc-400 outline-none" />
                  </div>
                )}

                {/* Sort */}
                <div className="col-span-2">
                   <label className="text-[9px] uppercase tracking-wider text-zinc-500 mb-1.5 block ml-1 font-bold flex items-center gap-1">
                      <ArrowUpDown size={10} /> Sort By
                   </label>
                   <div className="flex gap-2 overflow-x-auto pb-1">
                      {[
                        { id: 'date-new', label: 'Newest' },
                        { id: 'date-old', label: 'Oldest' },
                        { id: 'amount-high', label: 'Highest' },
                        { id: 'amount-low', label: 'Lowest' }
                      ].map((opt) => (
                        <button
                          key={opt.id}
                          onClick={() => setSortBy(opt.id as SortOption)}
                          className={`px-3 py-1.5 rounded-md border text-[10px] font-bold uppercase tracking-wide whitespace-nowrap transition-colors ${
                             sortBy === opt.id 
                             ? 'bg-zinc-800 border-zinc-700 text-white' 
                             : 'bg-zinc-950 border-zinc-900 text-zinc-600 hover:border-zinc-800'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                   </div>
                </div>
              </div>
           </div>
        )}
      </div>

      {/* Transaction List */}
      <div className="min-h-[300px]">
        {processedTransactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-zinc-700">
            <div className="w-12 h-12 rounded-full bg-zinc-900 flex items-center justify-center mb-3 border border-zinc-800">
               <Search size={20} className="opacity-50" />
            </div>
            <p className="text-sm font-medium">No transactions found.</p>
            <p className="text-xs mt-1">Try adjusting filters or add a new one.</p>
          </div>
        ) : groupedTransactions ? (
          Object.entries(groupedTransactions).map(([dateLabel, txs]) => (
            <div key={dateLabel} className="animate-fade-in">
              <div className="sticky top-24 md:top-16 z-0 bg-black py-2 mb-1 border-b border-zinc-900/50">
                <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider pl-1">{dateLabel}</h3>
              </div>
              <div className="bg-zinc-900/30 rounded-xl border border-zinc-900/50 overflow-hidden">
                 {txs.map(t => renderItem(t, false))}
              </div>
            </div>
          ))
        ) : (
          <div className="bg-zinc-900/30 rounded-xl border border-zinc-900/50 overflow-hidden animate-fade-in">
            {displayTransactions.map(t => renderItem(t, true))}
          </div>
        )}
        <div ref={loadMoreRef} className="h-8" />
      </div>
    </div>
  );
};
