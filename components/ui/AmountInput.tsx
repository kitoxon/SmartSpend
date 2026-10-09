import React from 'react';

interface AmountInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'size'> {
  value: string;
  onChange: (value: string) => void;
  size?: 'md' | 'lg';
}

/** Yen amount field: digits only, numeric keyboard on phones. */
export const AmountInput: React.FC<AmountInputProps> = ({ value, onChange, size = 'md', className = '', ...rest }) => (
  <div className={`relative ${className}`}>
    <span className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3 ${size === 'lg' ? 'text-lg' : 'text-sm'}`}>¥</span>
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={value}
      onChange={(event) => onChange(event.target.value.replace(/[^\d]/g, '').slice(0, 10))}
      className={`field pl-7 tabular-nums ${size === 'lg' ? 'h-12 text-lg font-medium' : ''}`}
      {...rest}
    />
  </div>
);
