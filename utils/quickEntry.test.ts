import { describe, expect, it } from 'vitest';
import { Category, Transaction } from '../types';
import { summarizeNotes, usualPrice } from './quickEntry';

const at = (day: string, time: string) => new Date(`${day}T${time}:00`).toISOString();

let nextId = 0;
const expense = (description: string, amount: number, day: string, time: string, category = Category.Food): Transaction => ({
  id: String(nextId++), type: 'expense', category, description, amount, date: at(day, '12:00'), created_at: at(day, time),
});

describe('usual price', () => {
  it('is the amount most recent entries share', () => {
    expect(usualPrice([450, 450])).toBe(450);
    expect(usualPrice([450, 500, 450])).toBe(450);
    expect(usualPrice([480, 480, 480, 450, 450, 450])).toBe(480); // Only the last five count
  });

  it('is missing when the amount changes from day to day', () => {
    expect(usualPrice([850, 900, 780])).toBeNull();
    expect(usualPrice([850, 850, 900, 780, 1200])).toBeNull(); // 2 of 5
    expect(usualPrice([450])).toBeNull();
  });
});

describe('note suggestions', () => {
  const entries = [
    expense('Coffee', 450, '2026-10-12', '08:10'),
    expense('coffee', 450, '2026-10-09', '08:25'),
    expense('Lunch', 850, '2026-10-12', '12:30'),
    expense('Lunch', 900, '2026-10-11', '12:15'),
    expense('Lunch', 780, '2026-10-10', '12:40'),
    expense('Dinner', 1200, '2026-10-11', '19:30'),
  ];
  const order = (time: string) => {
    const [hours, minutes] = time.split(':').map(Number);
    return summarizeNotes(entries, hours * 60 + minutes).map((use) => use.note);
  };

  it('puts what is usually logged around now first', () => {
    expect(order('08:00')).toEqual(['Coffee', 'Lunch', 'Dinner']);
    expect(order('12:00')).toEqual(['Lunch', 'Coffee', 'Dinner']);
    expect(order('19:00')).toEqual(['Dinner', 'Lunch', 'Coffee']);
  });

  it('groups spellings and keeps the newest amounts first', () => {
    const coffee = summarizeNotes(entries, 8 * 60).find((use) => use.note === 'Coffee');
    expect(coffee?.amounts).toEqual([450, 450]);
    expect(summarizeNotes(entries, 12 * 60).find((use) => use.note === 'Lunch')?.amounts).toEqual([850, 900, 780]);
  });
});
