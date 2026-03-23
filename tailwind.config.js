/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#f4f7ff',
        card: '#ffffff',
        border: '#dbe4ff',
        text: '#0f172a',
        muted: '#5b6b8a',
        accent: '#4f46e5',
        accent2: '#7c3aed',
        accent3: '#0ea5e9',
      },
      borderRadius: {
        xl2: '16px',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'Segoe UI', 'Roboto', 'Arial', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 10px 30px rgba(79, 70, 229, 0.12)',
      },
    },
  },
  plugins: [],
};
