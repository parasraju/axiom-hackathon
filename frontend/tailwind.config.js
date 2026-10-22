/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        safe: {
          green: "#10b981",
          amber: "#f59e0b",
          red: "#ef4444",
          blue: "#3b82f6",
          dark: "#0f172a",
        }
      }
    },
  },
  plugins: [],
}
