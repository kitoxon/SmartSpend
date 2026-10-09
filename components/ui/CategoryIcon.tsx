
import React from 'react';
import { Category } from '../../types';
import {
  Utensils, CarFront, Home, Zap, Film, HeartPulse, ShoppingBag,
  ShoppingCart, PiggyBank, CircleDashed, Banknote,
  Clock, Wallet, Laptop, Gift, TrendingUp, Medal
} from 'lucide-react';
import { CreditCardIcon } from './CreditCardIcon';

interface CategoryIconProps {
  category: Category;
  size?: number;
  className?: string;
  color?: string;
}

export const CategoryIcon: React.FC<CategoryIconProps> = ({ category, size = 18, className = "", color }) => {
  const icons: Record<Category, React.ElementType> = {
    // Expenses
    [Category.Food]: Utensils,
    [Category.Transport]: CarFront,
    [Category.Housing]: Home,
    [Category.Utilities]: Zap,
    [Category.Entertainment]: Film,
    [Category.Sports]: Medal,
    [Category.Health]: HeartPulse,
    [Category.Shopping]: ShoppingBag,
    [Category.Groceries]: ShoppingCart,
    [Category.Debt]: CreditCardIcon,
    [Category.Savings]: PiggyBank,
    [Category.Other]: CircleDashed,
    
    // Incomes
    [Category.Salary]: Banknote,
    [Category.Overtime]: Clock,
    [Category.Allowance]: Wallet,
    [Category.Freelance]: Laptop,
    [Category.Gift]: Gift,
    [Category.Investment]: TrendingUp,
  };

  const Icon = icons[category] || CircleDashed;

  return <Icon size={size} className={className} color={color} strokeWidth={1.5} />;
};
