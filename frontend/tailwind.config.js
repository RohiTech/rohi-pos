/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          ink: '#1d1d1b',
          forest: '#173b30',
          moss: '#4c8c63',
          clay: '#c96b49',
          sand: '#e8d8bc',
          cream: '#f7f2e8'
        }
      },
      fontFamily: {
        sans: ['"Trebuchet MS"', '"Segoe UI"', 'sans-serif'],
        display: ['"Georgia"', 'serif']
      },
      boxShadow: {
        panel: '0 20px 45px rgba(23, 59, 48, 0.08)'
      }
    }
  },
  plugins: []
};
