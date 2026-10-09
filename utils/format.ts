export const formatYen = (amount: number) => `¥${Math.round(Math.abs(amount)).toLocaleString('ja-JP')}`;

export const formatSignedYen = (amount: number) => (Math.round(amount) < 0 ? `−${formatYen(amount)}` : formatYen(amount));

export const formatMonthName = (monthKey: string) => {
  const [year, month] = monthKey.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: 'long' });
};

/** Parses a typed amount, accepting thousands separators. Empty or invalid input gives null. */
export const parseAmount = (value: string) => {
  const cleaned = value.replace(/[,\s¥]/g, '');
  if (!cleaned) return null;
  const amount = Number(cleaned);
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount) : null;
};
