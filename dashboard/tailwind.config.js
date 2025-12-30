/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'wa-green': '#25D366',
        'wa-dark': '#075E54',
        'wa-light': '#128C7E',
        'wa-teal': '#34B7F1',
      },
    },
  },
  plugins: [],
}
