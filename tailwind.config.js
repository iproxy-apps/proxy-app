/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './App.{js,jsx,ts,tsx}',
    './src/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        background: 'hsl(60, 20%, 97%)',
        foreground: 'hsl(160, 30%, 10%)',
        card: {
          DEFAULT: 'hsl(0, 0%, 100%)',
          foreground: 'hsl(160, 30%, 10%)',
        },
        primary: {
          DEFAULT: 'hsl(158, 55%, 14%)',
          foreground: 'hsl(75, 70%, 92%)',
          glow: 'hsl(158, 45%, 22%)',
        },
        accent: {
          DEFAULT: 'hsl(78, 75%, 62%)',
          foreground: 'hsl(158, 55%, 12%)',
        },
        secondary: {
          DEFAULT: 'hsl(60, 15%, 94%)',
          foreground: 'hsl(160, 30%, 14%)',
        },
        muted: {
          DEFAULT: 'hsl(60, 12%, 92%)',
          foreground: 'hsl(160, 8%, 42%)',
        },
        destructive: {
          DEFAULT: 'hsl(358, 70%, 52%)',
          foreground: 'hsl(0, 0%, 100%)',
        },
        success: {
          DEFAULT: 'hsl(152, 60%, 38%)',
          foreground: 'hsl(0, 0%, 100%)',
        },
        warning: {
          DEFAULT: 'hsl(38, 92%, 52%)',
          foreground: 'hsl(30, 50%, 12%)',
        },
        info: {
          DEFAULT: 'hsl(215, 80%, 52%)',
          foreground: 'hsl(0, 0%, 100%)',
        },
        purple: {
          DEFAULT: 'hsl(262, 60%, 58%)',
          foreground: 'hsl(0, 0%, 100%)',
        },
        border: 'hsl(60, 10%, 88%)',
        input: 'hsl(60, 10%, 88%)',
        ring: 'hsl(158, 55%, 22%)',
        status: {
          available: 'hsl(220, 8%, 55%)',
          accepted: 'hsl(215, 80%, 52%)',
          onway: 'hsl(262, 60%, 58%)',
          progress: 'hsl(42, 92%, 52%)',
          validating: 'hsl(22, 92%, 56%)',
          done: 'hsl(152, 60%, 38%)',
          cancelled: 'hsl(358, 70%, 52%)',
        },
      },
      borderRadius: {
        lg: '14px',
        md: '10px',
        sm: '6px',
      },
    },
  },
  plugins: [],
}
