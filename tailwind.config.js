/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      animation: {
        'move-stars': 'move-stars 50s linear infinite',
      },
      keyframes: {
        'move-stars': {
          'from': { transform: 'translateY(0px)' },
          'to': { transform: 'translateY(-1000px)' },
        }
      }
    },
  },
  plugins: [],
}

