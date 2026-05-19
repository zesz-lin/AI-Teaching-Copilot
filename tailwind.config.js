/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./packages/extension/src/sidepanel/**/*.{ts,tsx,html}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        panel: {
          bg: "var(--panel-bg)",
          surface: "var(--panel-surface)",
          border: "var(--panel-border)",
          text: "var(--panel-text)",
          muted: "var(--panel-muted)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          hover: "var(--accent-hover)",
          surface: "var(--accent-surface)",
        },
        danger: {
          DEFAULT: "var(--danger)",
          surface: "var(--danger-surface)",
        },
        success: {
          DEFAULT: "var(--success)",
          surface: "var(--success-surface)",
        },
        warn: {
          DEFAULT: "var(--warn)",
          surface: "var(--warn-surface)",
        },
      },
      maxWidth: {
        "sidepanel": "400px",
      },
    },
  },
  plugins: [],
};
