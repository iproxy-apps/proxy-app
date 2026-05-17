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
        background: 'hsl(40, 20%, 97%)',
        foreground: 'hsl(220, 10%, 12%)',
        card: {
          DEFAULT: 'hsl(0, 0%, 100%)',
          foreground: 'hsl(220, 10%, 12%)',
        },
        primary: {
          DEFAULT: 'hsl(220, 10%, 12%)',
          foreground: 'hsl(40, 20%, 96%)',
          glow: 'hsl(220, 10%, 18%)',
        },
        accent: {
          DEFAULT: 'hsl(45, 95%, 55%)',
          foreground: 'hsl(220, 12%, 11%)',
        },
        secondary: {
          DEFAULT: 'hsl(40, 15%, 94%)',
          foreground: 'hsl(220, 10%, 14%)',
        },
        muted: {
          DEFAULT: 'hsl(40, 12%, 92%)',
          foreground: 'hsl(220, 8%, 42%)',
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
        border: 'hsl(40, 10%, 88%)',
        input: 'hsl(40, 10%, 88%)',
        ring: 'hsl(220, 10%, 22%)',
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
