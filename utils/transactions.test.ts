import { describe, expect, it } from 'vitest';
import { Category, Transaction } from '../types';
import { currentCategoryName, withCurrentCategory } from './transactions';

describe('renamed categories', () => {
  it('shows entries saved under an old category name under the new one', () => {
    const saved = { id: 't', amount: 3000, category: 'Sports and hobbies' as Category, date: '', description: 'Karate exam', type: 'expense' } as Transaction;
    expect(withCurrentCategory(saved).category).toBe(Category.Hobbies);
    expect(currentCategoryName('Sports and hobbies')).toBe('Hobbies');
    expect(currentCategoryName('Shopping')).toBe('Shopping');
  });
});
