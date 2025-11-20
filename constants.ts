
import { Category, Debt, Goal } from './types';

// Stoic "Moonlight" Palette: Very pale, desaturated tints that glow on black.
export const CATEGORY_COLORS: Record<Category, string> = {
  // Expenses (Subtle Tints)
  [Category.Food]: '#ffedd5',      // Orange 100 (Cream)
  [Category.Transport]: '#e0f2fe', // Sky 100 (Ice)
  [Category.Housing]: '#f1f5f9',   // Slate 100 (Steel)
  [Category.Utilities]: '#fef3c7', // Amber 100 (Pale Gold)
  [Category.Entertainment]: '#fae8ff', // Fuchsia 100 (Mist)
  [Category.Health]: '#dcfce7',    // Emerald 100 (Mint)
  [Category.Shopping]: '#f3e8ff',  // Purple 100 (Lavender)
  [Category.Groceries]: '#ecfccb', // Lime 100 (Tea)
  [Category.Debt]: '#fee2e2',      // Red 100 (Pale Rose)
  [Category.Savings]: '#ccfbf1',   // Teal 100 (Aqua)
  [Category.Other]: '#f4f4f5',     // Zinc 100 (White Smoke)
  
  // Incomes (Keep clean/bright)
  [Category.Salary]: '#ffffff',    
  [Category.Overtime]: '#fafafa', 
  [Category.Allowance]: '#f4f4f5', 
  [Category.Freelance]: '#e4e4e7', 
  [Category.Gift]: '#d4d4d8', 
  [Category.Investment]: '#a1a1aa', 
};

export const INCOME_CATEGORIES = [
  Category.Salary, 
  Category.Overtime, 
  Category.Allowance, 
  Category.Freelance, 
  Category.Gift, 
  Category.Investment, 
  Category.Other
];

export const EXPENSE_CATEGORIES = [
  Category.Food, Category.Transport, Category.Housing, Category.Utilities, 
  Category.Entertainment, Category.Health, Category.Shopping, Category.Groceries, 
  Category.Debt, Category.Savings, Category.Other
];

export const MOCK_DATA_IF_EMPTY = [
  { id: '1', amount: 1500, category: Category.Food, date: new Date().toISOString(), description: 'Feast at Ramen Shop', type: 'expense' },
  { id: '2', amount: 5000, category: Category.Transport, date: new Date(Date.now() - 86400000).toISOString(), description: 'Chariot (Suica)', type: 'expense' },
  { id: '3', amount: 450000, category: Category.Salary, date: new Date(Date.now() - 86400000 * 2).toISOString(), description: 'Imperial Stipend', type: 'income' },
];

export const MOCK_DEBTS_IF_EMPTY: Debt[] = [
  { 
    id: '1', 
    person: 'Iron Bank (Card A)', 
    amount: 230000, 
    description: 'Revolving Payment', 
    dueDate: new Date(new Date().getFullYear(), new Date().getMonth(), 26).toISOString(), 
    type: 'payable', 
    debtCategory: 'Credit Card', 
    isPaid: false,
    interestRate: 15.0,
    minimumPayment: 50000 
  },
  { 
    id: '2', 
    person: 'Merchant Guild (Card B)', 
    amount: 180000, 
    description: 'Supplies', 
    dueDate: new Date(new Date().getFullYear(), new Date().getMonth(), 27).toISOString(), 
    type: 'payable', 
    debtCategory: 'Credit Card', 
    isPaid: false,
    interestRate: 18.0,
    minimumPayment: 30000 
  },
];

export const MOCK_GOALS_IF_EMPTY: Goal[] = [
  {
    id: '1',
    name: 'Conquer Europe',
    targetAmount: 800000,
    currentAmount: 0,
    deadline: new Date(new Date().setFullYear(new Date().getFullYear() + 1, 11, 31)).toISOString(),
    icon: '✈️',
    monthlyContribution: 50000
  },
  {
    id: '2',
    name: 'Trading Bot Empire',
    targetAmount: 1000000,
    currentAmount: 0,
    deadline: new Date(new Date().setMonth(new Date().getMonth() + 24)).toISOString(),
    icon: '🤖',
    monthlyContribution: 20000
  }
];
