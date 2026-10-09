
export enum Category {
  // Expenses
  Food = 'Food',
  Transport = 'Transport',
  Housing = 'Housing',
  Utilities = 'Utilities',
  Entertainment = 'Entertainment',
  Sports = 'Sports and hobbies',
  Health = 'Health',
  Shopping = 'Shopping',
  Groceries = 'Groceries',
  Debt = 'Debt', // Repayment
  Savings = 'Savings', // Added for Goal funding
  Other = 'Other',
  // Incomes
  Salary = 'Salary',
  Overtime = 'Overtime', // Added
  Allowance = 'Allowance', // Added (Transportation etc)
  Freelance = 'Freelance',
  Gift = 'Gift',
  Investment = 'Investment',
}

export type TransactionType = 'expense' | 'income';

export interface Transaction {
  id: string;
  amount: number;
  category: Category;
  date: string; // ISO date string
  description: string;
  type: TransactionType;
  created_at?: string; // Creation timestamp (for ordering)
}

export interface RecurringTransaction {
  id: string;
  frequency: 'weekly' | 'monthly';
  nextDue: string;
  anchorDay?: number;
  transactionTemplate: Omit<Transaction, 'id' | 'date'> & {
    // Variable bills stay estimated until the user confirms their amount/date.
    // This lives in the JSON template, so it syncs without a schema migration.
    requiresConfirmation?: boolean;
  };
}

// Alias for backward compatibility
export type Expense = Transaction; 

export type DebtType = 'payable'; // Removed receivable

export type DebtCategory = 'Personal' | 'Credit Card' | 'Loan' | 'Bank' | 'Other';

export interface Debt {
  id: string;
  person: string; // Creditor Name
  amount: number; // Current Balance
  description: string;
  dueDate: string; // Next payment date
  type: DebtType;
  debtCategory: DebtCategory;
  isPaid: boolean; // True if balance is 0
  
  // New fields for Smart Handling
  interestRate?: number; // Annual Interest Rate (%)
  minimumPayment?: number; // Monthly commitment

  // Set when the debt is a split card bill. Its monthly payment is then
  // collected inside that card's bill instead of being paid separately.
  cardId?: string;
}

// ---------------------------------------------------------------------------
// Pay-cycle planner. Dates are local 'YYYY-MM-DD' strings; months are 'YYYY-MM'.

export type BusinessDayShift = 'none' | 'next' | 'previous';

export interface PlannerSettings {
  paydayDay: number;
  defaultSavings: number;
  defaultSavingsGoalId?: string;
  // Whether money set aside stays in the spending account (true) or is moved out.
  savingsInAccount?: boolean;
}

export interface Card {
  id: string;
  name: string;
  paymentDay: number; // Day of the month after usage; moves to the next business day
  sortOrder: number;
  archived?: boolean;
}

export interface CardStatement {
  id: string;
  cardId: string;
  usageMonth: string; // Month the purchases were made
  amount: number; // Total bill from the card company, installments included
  installment: number; // Part of `amount` that repays split debts on this card
  splitAmount: number; // Part of `amount` moved into a new installment debt
  splitDebtId?: string;
  paidAt?: string;
  // Principal taken off linked debts when this bill was marked paid, so that
  // un-marking it can restore their balances exactly.
  appliedPayments?: { debtId: string; principal: number; previousDueDate: string }[];
}

export interface Bill {
  id: string;
  name: string;
  amount: number; // Exact amount, or the estimate when `variable`
  dueDay: number | 'last';
  shift: BusinessDayShift;
  variable: boolean;
  active: boolean;
  sortOrder: number;
  // Monthly unless set. A yearly bill is due once, in `month` (1–12).
  frequency?: 'monthly' | 'yearly';
  month?: number;
}

export interface BillPayment {
  id: string;
  billId: string;
  dueDate: string;
  amount: number;
  confirmed: boolean;
  paidAt?: string;
}

export interface PayCycleRecord {
  id: string;
  key: string; // Payday month
  salary: number;
  carryover: number; // Money left before the salary arrived
  savings: number; // Set aside at check-in
  trackingFrom?: string; // Cycle joined part-way: ignore earlier bills and spending
  savingsGoalId?: string;
  // What this check-in added to a goal, so editing it can adjust the goal exactly.
  savingsApplied?: { goalId: string; amount: number };
  checkedInAt: string;
}

/** Latest "used so far" total for a card's purchases in a month, typed from the card's app. */
export interface CardUsage {
  id: string;
  cardId: string;
  usageMonth: string;
  amount: number;
  asOf: string;
}

/**
 * Where a card's month of purchases went, from an imported PayPay history or
 * Vpass card statement.
 * For understanding a bill only: it never becomes expenses in the plan.
 */
export interface CardBreakdown {
  id: string;
  cardId: string;
  usageMonth: string;
  source: 'paypay' | 'vpass';
  importedAt: string;
  firstDate: string;
  lastDate: string;
  payments: number;
  charged: number; // Purchases on this card
  paidOtherWays: number; // PayPay Points and Balance, not on the card
  billed?: number; // From a card statement: this month's payment
  revolving?: boolean; // Statement lines on リボ払い
  categories: { label: string; amount: number; count: number }[];
  places: { label: string; amount: number; count: number }[];
}

export interface PlannerData {
  settings: PlannerSettings;
  cards: Card[];
  bills: Bill[];
  statements: CardStatement[];
  billPayments: BillPayment[];
  cycles: PayCycleRecord[];
  cardUsage: CardUsage[];
  cardBreakdowns: CardBreakdown[];
}

export interface Goal {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  deadline: string;
  startDate?: string; // Added for timeline
  icon?: string;
  monthlyContribution?: number; // New field for projection
}

export interface SpendingInsight {
  summary: string;
  topCategory: string;
  savingsTip: string;
  unusualSpending: string[];
  projectedEndOfMonth: number;
}

export interface DebtForecast {
  estimatedDebtFreeDate: string;
  monthlyPaymentRecommendation: number;
  strategy: string;
  interestWarning?: string;
  actionPlan: string[];
}

export type ViewState = 'home' | 'list' | 'cards' | 'debts' | 'goals' | 'history';
