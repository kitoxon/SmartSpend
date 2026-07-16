
import { Category } from './types';

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
