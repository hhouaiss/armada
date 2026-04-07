import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: '#FF8C42',
          foreground: '#FFFFFF',
          50: '#FFF4ED',
          100: '#FFE6D5',
          200: '#FFCAAA',
          300: '#FFA774',
          400: '#FF8C42',
          500: '#FF6B35',
          600: '#E85D04',
          700: '#C24C00',
          800: '#993C00',
          900: '#702C00',
        },
        secondary: {
          DEFAULT: '#FF6B35',
          foreground: '#FFFFFF',
        },
        tertiary: {
          DEFAULT: '#E85D04',
          foreground: '#FFFFFF',
        },
        success: {
          DEFAULT: '#2D6A4F',
          foreground: '#FFFFFF',
        },
        warning: {
          DEFAULT: '#F4A261',
          foreground: '#000000',
        },
        error: {
          DEFAULT: '#DC0032',
          foreground: '#FFFFFF',
        },
        info: {
          DEFAULT: '#0EA5E9',
          foreground: '#FFFFFF',
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
        armada: {
          primary:        'var(--armada-primary)',
          bg:             'var(--armada-bg)',
          text:           'var(--armada-text)',
          accent:         'var(--armada-accent)',
          surface:        'var(--armada-surface)',
          'surface-hover':'var(--armada-surface-hover)',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        serif: ['"Playfair Display"', 'ui-serif', 'Georgia', 'serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
