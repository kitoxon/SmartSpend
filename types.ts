
export enum Category {
  // Expenses
  Food = 'Food',
  Transport = 'Transport',
  Housing = 'Housing',
  Utilities = 'Utilities',
  Entertainment = 'Entertainment',
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
  transactionTemplate: Omit<Transaction, 'id' | 'date'>;
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

export type ViewState = 'dashboard' | 'list' | 'debts' | 'goals';
