/** @type {import('tailwindcss').Config} */
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './index.tsx', './App.tsx', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'Hiragino Sans', 'Noto Sans JP', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        page: token('page'),
        card: token('card'),
        subtle: token('subtle'),
        line: token('line'),
        'line-strong': token('line-strong'),
        ink: token('ink'),
        'ink-2': token('ink-2'),
        'ink-3': token('ink-3'),
        'on-ink': token('on-ink'),
        accent: token('accent'),
        'accent-soft': token('accent-soft'),
        good: token('good'),
        'good-soft': token('good-soft'),
        'good-mark': token('good-mark'),
        bad: token('bad'),
        'bad-soft': token('bad-soft'),
        warn: token('warn'),
        'warn-soft': token('warn-soft'),
        'series-1': token('series-1'),
        'series-2': token('series-2'),
        'series-3': token('series-3'),
        'series-4': token('series-4'),
        'series-5': token('series-5'),
      },
    },
  },
  plugins: [],
};
