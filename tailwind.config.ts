import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f5f9ff',
          100: '#e8f0ff',
          200: '#c9dbff',
          300: '#9bbcff',
          400: '#6d9dff',
          500: '#3f7fff',
          600: '#1f63ed',
          700: '#144bbf',
          800: '#0d3591',
          900: '#09246b',
        },
      },
      boxShadow: {
        card: '0 10px 30px -15px rgba(15, 23, 42, 0.2)',
      },
    },
  },
  plugins: [],
};

export default config;
