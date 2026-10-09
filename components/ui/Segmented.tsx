import React from 'react';

interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}

/** A row of mutually exclusive choices, all visible at once. */
export const Segmented = <T extends string>({ label, value, options, onChange }: SegmentedProps<T>) => (
  <div
    role="radiogroup"
    aria-label={label}
    className="grid gap-1 rounded-lg bg-subtle p-1"
    style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
  >
    {options.map((option) => (
      <button
        key={option.value}
        type="button"
        role="radio"
        aria-checked={value === option.value}
        onClick={() => onChange(option.value)}
        className={`min-h-9 rounded-md px-2 text-[13px] transition ${value === option.value ? 'bg-card text-ink' : 'text-ink-2 hover:text-ink'}`}
      >
        {option.label}
      </button>
    ))}
  </div>
);
