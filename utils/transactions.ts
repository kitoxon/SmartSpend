import { Category, Transaction } from '../types';

type SpendingRecord = Pick<Transaction, 'type' | 'category' | 'amount' | 'description'>;

export const isLegacyPrincipalPayment = (transaction: SpendingRecord) =>
  transaction.category === Category.Debt && /^Debt Payment:/i.test(transaction.description);

export const isTransferLike = (transaction: SpendingRecord) =>
  transaction.category === Category.Savings || isLegacyPrincipalPayment(transaction);

export const spendingAmountFor = (transaction: SpendingRecord) => {
  if (transaction.type !== 'expense') return 0;
  if (transaction.category === Category.Savings) return 0;
  if (isLegacyPrincipalPayment(transaction)) {
    const interestMatch = transaction.description.match(/interest\s+¥([\d,]+)/i);
    return interestMatch ? Number(interestMatch[1].replace(/,/g, '')) || 0 : 0;
  }
  return transaction.amount;
};
