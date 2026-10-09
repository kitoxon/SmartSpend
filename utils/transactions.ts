import { Category, Transaction } from '../types';

type SpendingRecord = Pick<Transaction, 'type' | 'category' | 'amount' | 'description'>;

export const isLegacyPrincipalPayment = (transaction: SpendingRecord) =>
  transaction.category === Category.Debt && /^Debt Payment:/i.test(transaction.description);

export const isTransferLike = (transaction: SpendingRecord) =>
  transaction.category === Category.Savings || isLegacyPrincipalPayment(transaction);

/** Category names that were renamed; entries saved before the rename show the new one. */
const RENAMED_CATEGORIES: Record<string, Category> = { 'Sports and hobbies': Category.Hobbies };

export const currentCategoryName = (name: string) => RENAMED_CATEGORIES[name] ?? name;

export const withCurrentCategory = <T extends { category: Category }>(item: T): T =>
  RENAMED_CATEGORIES[item.category] ? { ...item, category: RENAMED_CATEGORIES[item.category] } : item;

/** Note on entries created by a balance check to match the real bank balance. */
export const BALANCE_ADJUSTMENT_NOTE = 'Balance adjustment';

export const isBalanceAdjustment = (transaction: Pick<Transaction, 'description'>) => transaction.description === BALANCE_ADJUSTMENT_NOTE;

/** Money that actually left the account. Moving money into savings goals does not count. */
export const cashOutflowFor = (transaction: SpendingRecord) =>
  transaction.type === 'expense' && transaction.category !== Category.Savings ? transaction.amount : 0;

export const spendingAmountFor = (transaction: SpendingRecord) => {
  if (transaction.type !== 'expense') return 0;
  if (transaction.category === Category.Savings) return 0;
  if (isLegacyPrincipalPayment(transaction)) {
    const interestMatch = transaction.description.match(/interest\s+¥([\d,]+)/i);
    return interestMatch ? Number(interestMatch[1].replace(/,/g, '')) || 0 : 0;
  }
  return transaction.amount;
};
