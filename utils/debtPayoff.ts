import { Debt } from '../types';

export type DebtPayoffStrategy = 'avalanche' | 'snowball' | 'dueDate';

export interface DebtPayoffSimulationOptions {
  strategy: DebtPayoffStrategy;
  extraPrincipalBudget?: number;
  startDate?: Date;
  maxMonths?: number;
  minPaymentFallback?: (debt: Debt) => number;
}

export interface DebtPayoffPerDebtResult {
  payoffMonth: number; // 1-based month index within the simulation
  payoffDate: Date;
  totalInterestPaid: number;
}

export interface DebtPayoffSimulationResult {
  warning: string | null;
  months: number | null;
  payoffDate: Date | null;
  payoffDateLabel: string | null;
  monthlyPrincipalBudget: number;
  totalInterestPaid: number;
  perDebt: Record<string, DebtPayoffPerDebtResult>;
}

const addMonths = (base: Date, months: number) => new Date(base.getFullYear(), base.getMonth() + months, base.getDate());

const getOrderComparator = (strategy: DebtPayoffStrategy) => {
  if (strategy === 'avalanche') return (a: SimDebt, b: SimDebt) => (b.rate || 0) - (a.rate || 0);
  if (strategy === 'snowball') return (a: SimDebt, b: SimDebt) => a.balance - b.balance;
  return (a: SimDebt, b: SimDebt) => {
    const ad = a.dueDate?.getTime() ?? Number.POSITIVE_INFINITY;
    const bd = b.dueDate?.getTime() ?? Number.POSITIVE_INFINITY;
    if (ad !== bd) return ad - bd;
    return a.id.localeCompare(b.id);
  };
};

type SimDebt = {
  id: string;
  balance: number;
  rate: number;
  minPay: number;
  dueDate?: Date;
};

/**
 * Simulates payoff under SmartSpend's payment model:
 * - Debt `amount` is principal balance (does not grow).
 * - Monthly interest is paid as an expense (not added to principal).
 * - Each debt has a fixed monthly principal payment (`minimumPayment`), and any unused principal budget
 *   (from paying off a debt early or from extra budget) rolls into the remaining debts in the same month.
 */
export const simulateDebtPayoff = (debts: Debt[], options: DebtPayoffSimulationOptions): DebtPayoffSimulationResult => {
  const maxMonths = options.maxMonths ?? 600;
  const startDate = options.startDate ?? new Date();
  const extraPrincipalBudget = Math.max(0, options.extraPrincipalBudget ?? 0);
  const minFallback = options.minPaymentFallback ?? (() => 0);

  const scheduled: SimDebt[] = debts
    .filter((d) => d.type === 'payable' && !d.isPaid && d.amount > 0)
    .map((d) => ({
      id: d.id,
      balance: d.amount,
      rate: d.interestRate ?? 0,
      minPay: Math.max(0, d.minimumPayment ?? minFallback(d)),
      dueDate: d.dueDate ? new Date(d.dueDate) : undefined,
    }));

  if (scheduled.length === 0) {
    return {
      warning: null,
      months: 0,
      payoffDate: startDate,
      payoffDateLabel: startDate.toLocaleDateString('default', { month: 'long', year: 'numeric' }),
      monthlyPrincipalBudget: 0,
      totalInterestPaid: 0,
      perDebt: {},
    };
  }

  const baseMinTotal = scheduled.reduce((sum, d) => sum + d.minPay, 0);
  const monthlyPrincipalBudget = baseMinTotal + extraPrincipalBudget;
  if (monthlyPrincipalBudget <= 0) {
    return {
      warning: 'Set monthly payments to project payoff',
      months: null,
      payoffDate: null,
      payoffDateLabel: null,
      monthlyPrincipalBudget: 0,
      totalInterestPaid: 0,
      perDebt: {},
    };
  }

  const perDebtResult: DebtPayoffSimulationResult['perDebt'] = {};
  const perDebtInterest: Record<string, number> = Object.fromEntries(scheduled.map((d) => [d.id, 0]));
  let totalInterestPaid = 0;

  const comparator = getOrderComparator(options.strategy);
  const payoffMonthToDate = (payoffMonth: number) => addMonths(startDate, Math.max(0, payoffMonth - 1));

  let months = 0;
  while (months < maxMonths && scheduled.some((d) => d.balance > 0.5)) {
    months++;
    let remainingPrincipal = monthlyPrincipalBudget;

    // Interest is paid monthly based on the opening balance (tracked as expense, not added to principal).
    for (const d of scheduled) {
      if (d.balance <= 0.5) continue;
      const monthlyRate = (d.rate / 100) / 12;
      const interest = monthlyRate > 0 ? Math.round(d.balance * monthlyRate) : 0;
      perDebtInterest[d.id] += interest;
      totalInterestPaid += interest;
    }

    // Pay fixed minimum principal payments first.
    for (const d of scheduled) {
      if (d.balance <= 0.5) continue;
      if (remainingPrincipal <= 0) break;
      const pay = Math.min(d.minPay, d.balance, remainingPrincipal);
      d.balance -= pay;
      remainingPrincipal -= pay;
      if (d.balance <= 0.5 && !perDebtResult[d.id]) {
        const payoffDate = payoffMonthToDate(months);
        perDebtResult[d.id] = {
          payoffMonth: months,
          payoffDate,
          totalInterestPaid: perDebtInterest[d.id] ?? 0,
        };
      }
    }

    // Roll any surplus principal into the remaining debts following the strategy.
    if (remainingPrincipal > 0.5) {
      const ordered = [...scheduled].filter((d) => d.balance > 0.5).sort(comparator);
      for (const d of ordered) {
        if (remainingPrincipal <= 0) break;
        const pay = Math.min(d.balance, remainingPrincipal);
        d.balance -= pay;
        remainingPrincipal -= pay;
        if (d.balance <= 0.5 && !perDebtResult[d.id]) {
          const payoffDate = payoffMonthToDate(months);
          perDebtResult[d.id] = {
            payoffMonth: months,
            payoffDate,
            totalInterestPaid: perDebtInterest[d.id] ?? 0,
          };
        }
      }
    }
  }

  if (scheduled.some((d) => d.balance > 0.5)) {
    return {
      warning: 'Payment plan too long; increase payments',
      months: null,
      payoffDate: null,
      payoffDateLabel: null,
      monthlyPrincipalBudget,
      totalInterestPaid,
      perDebt: perDebtResult,
    };
  }

  const payoffDate = payoffMonthToDate(months);
  return {
    warning: null,
    months,
    payoffDate,
    payoffDateLabel: payoffDate.toLocaleDateString('default', { month: 'long', year: 'numeric' }),
    monthlyPrincipalBudget,
    totalInterestPaid,
    perDebt: perDebtResult,
  };
};
