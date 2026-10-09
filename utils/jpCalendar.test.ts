import { describe, expect, it } from 'vitest';
import { isBankBusinessDay, isNationalHoliday, nationalHolidays, shiftToBusinessDay } from './jpCalendar';

describe('Japanese national holidays', () => {
  it('includes the September 2026 citizens\' holiday between two holidays', () => {
    expect(isNationalHoliday('2026-09-21')).toBe(true); // Respect for the Aged Day
    expect(isNationalHoliday('2026-09-22')).toBe(true); // Citizens' holiday
    expect(isNationalHoliday('2026-09-23')).toBe(true); // Autumnal Equinox Day
  });

  it('moves a Sunday holiday to the next weekday', () => {
    // Vernal Equinox Day 2027 is Sunday, March 21.
    expect(isNationalHoliday('2027-03-21')).toBe(true);
    expect(isNationalHoliday('2027-03-22')).toBe(true);
  });

  it('places Happy Monday holidays correctly', () => {
    expect(isNationalHoliday('2026-10-12')).toBe(true); // Sports Day
    expect(isNationalHoliday('2027-09-20')).toBe(true); // Respect for the Aged Day
    expect(isNationalHoliday('2027-01-11')).toBe(true); // Coming of Age Day
  });

  it('has the expected number of 2026 holidays', () => {
    // 16 fixed and moving holidays, plus the May 6 substitute and Sep 22 citizens' holiday.
    expect(nationalHolidays(2026).size).toBe(18);
  });
});

describe('business days', () => {
  it('treats weekends, holidays and the bank new-year break as closed', () => {
    expect(isBankBusinessDay('2026-10-24')).toBe(false); // Saturday
    expect(isBankBusinessDay('2026-11-03')).toBe(false); // Culture Day
    expect(isBankBusinessDay('2026-12-31')).toBe(false);
    expect(isBankBusinessDay('2027-01-04')).toBe(true);
  });

  it('shifts in the requested direction', () => {
    expect(shiftToBusinessDay('2026-12-26', 'next')).toBe('2026-12-28');
    expect(shiftToBusinessDay('2026-12-20', 'previous')).toBe('2026-12-18');
    expect(shiftToBusinessDay('2026-12-31', 'next')).toBe('2027-01-04');
    expect(shiftToBusinessDay('2026-10-31', 'none')).toBe('2026-10-31');
  });
});
