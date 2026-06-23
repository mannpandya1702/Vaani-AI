import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';
import typography from '@tailwindcss/typography';

export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '1rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      colors: {
        // Vaani brand tokens (HSL via CSS vars in index.css)
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        // Vaani-named tokens (for direct use)
        'vaani-navy': '#0F1B3D',
        'vaani-saffron': '#FF9F1C',
        'vaani-green': '#2DBE7C',
        'vaani-red': '#E5484D',
        'vaani-paper': '#F7F4ED',
        'vaani-ink': '#1A1A1A',
        // Triage band semantic
        triage: {
          red: '#E5484D',
          amber: '#FF9F1C',
          green: '#2DBE7C',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        hind: ['Hind', 'Inter', 'sans-serif'], // Devanagari
        tamil: ['Noto Sans Tamil', 'sans-serif'],
        telugu: ['Noto Sans Telugu', 'sans-serif'],
        kannada: ['Noto Sans Kannada', 'sans-serif'],
        bengali: ['Noto Sans Bengali', 'sans-serif'],
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        'red-pulse': {
          '0%': { boxShadow: '0 0 0 0 rgba(229, 72, 77, 0.7)' },
          '100%': { boxShadow: '0 0 0 12px rgba(229, 72, 77, 0)' },
        },
        'saffron-pulse': {
          '0%': { boxShadow: '0 0 0 0 rgba(255, 159, 28, 0.7)' },
          '100%': { boxShadow: '0 0 0 16px rgba(255, 159, 28, 0)' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'red-pulse': 'red-pulse 1.2s ease-out infinite',
        'saffron-pulse': 'saffron-pulse 2s ease-out infinite',
      },
    },
  },
  plugins: [animate, typography],
} satisfies Config;
