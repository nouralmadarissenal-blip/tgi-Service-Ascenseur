/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0f7fc',
          100: '#dcebf5',
          500: '#4682a9',
          700: '#315f7e',
          800: '#254d68',
          900: '#1b394f',
        },
        steel: {
          50: '#f0f7fc',
          100: '#dcebf5',
          200: '#b7d2e3',
          500: '#4682a9',
          600: '#386d91',
          700: '#315f7e',
          800: '#254d68',
          900: '#1b394f',
        },
        safety: {
          50: '#fff7ed',
          100: '#ffedd5',
          500: '#f28c28',
          600: '#df7214',
          700: '#b94f0a',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
