/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './index.tsx', './App.tsx', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Manrope', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        primary: {
          500: '#ffffff',
          600: '#d4d4d8',
        },
        danger: '#ef4444',
        success: '#10b981',
      },
    },
  },
  plugins: [],
};
