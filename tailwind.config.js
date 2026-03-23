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
        canvas: {
          page: '#f5f5f5',
          nav: '#394b58',
          navHover: '#2d3b45',
          border: '#e0e0e0',
          primary: '#0374b7',
          primaryHover: '#03659f',
          navActive: '#4a5f6e',
        },
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
