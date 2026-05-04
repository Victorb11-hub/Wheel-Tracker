import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

// Tokens defined in app/globals.css drive the Tailwind theme.
// Do NOT add hex literals here — extend by referencing var(--color-*).
const config: Config = {
  darkMode: ['class', '[data-theme="dark"]'],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '1.5rem',
      screens: { '2xl': '1800px' },
    },
    extend: {
      colors: {
        bg: 'var(--color-bg)',
        surface: 'var(--color-surface)',
        'surface-raised': 'var(--color-surface-raised)',
        'surface-hover': 'var(--color-surface-hover)',
        border: 'var(--color-border)',
        'border-strong': 'var(--color-border-strong)',
        text: 'var(--color-text)',
        'text-muted': 'var(--color-text-muted)',
        'text-faint': 'var(--color-text-faint)',
        'text-on-accent': 'var(--color-text-on-accent)',

        // Domain-semantic accents
        credit: 'var(--color-credit)',
        'credit-bg': 'var(--color-credit-bg)',
        'credit-bg-strong': 'var(--color-credit-bg-strong)',
        debit: 'var(--color-debit)',
        'debit-bg': 'var(--color-debit-bg)',
        'debit-bg-strong': 'var(--color-debit-bg-strong)',
        roll: 'var(--color-roll)',
        'roll-bg': 'var(--color-roll-bg)',
        'roll-bg-strong': 'var(--color-roll-bg-strong)',
        assignment: 'var(--color-assignment)',
        'assignment-bg': 'var(--color-assignment-bg)',
        'assignment-bg-strong': 'var(--color-assignment-bg-strong)',
      },
      fontFamily: {
        sans: 'var(--font-sans)',
        mono: 'var(--font-mono)',
      },
      fontSize: {
        xs: ['11px', { lineHeight: '1.35' }],
        sm: ['12px', { lineHeight: '1.5' }],
        base: ['14px', { lineHeight: '1.5' }],
        md: ['16px', { lineHeight: '1.5' }],
        lg: ['18px', { lineHeight: '1.35' }],
        xl: ['22px', { lineHeight: '1.2' }],
        '2xl': ['28px', { lineHeight: '1.2' }],
        '3xl': ['36px', { lineHeight: '1.1' }],
      },
      borderRadius: {
        sm: '4px',
        md: '6px',
        lg: '8px',
        xl: '12px',
        full: '9999px',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
      },
    },
  },
  plugins: [animate],
};

export default config;
