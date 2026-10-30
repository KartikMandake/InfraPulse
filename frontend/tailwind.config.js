/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "background": "#030407",
        "surface": "#121318",
        "surface-dim": "#121318",
        "surface-bright": "#38393e",
        "surface-container-lowest": "#030407",
        "surface-container-low": "#101116",
        "surface-container": "#171920",
        "surface-container-high": "#22252e",
        "surface-container-highest": "#33353a",
        "surface-variant": "#33353a",
        
        "on-surface": "#e2e2e9",
        "on-surface-variant": "#c5c9ad",
        "inverse-surface": "#e2e2e9",
        "inverse-on-surface": "#2f3035",
        
        "outline": "#8f9379",
        "outline-variant": "#272a33",
        "outline-focused": "#3a3e4d",
        "surface-tint": "#afd500",
        
        "primary": "#ffffff",
        "on-primary": "#2a3500",
        "primary-container": "#c8f30c",
        "on-primary-container": "#586c00",
        "inverse-primary": "#536600",
        "primary-fixed": "#d4ff24",
        "primary-fixed-dim": "#afd500",
        "on-primary-fixed": "#030407",
        "on-primary-fixed-variant": "#3e4c00",

        "secondary": "#b1c5ff",
        "on-secondary": "#002c71",
        "secondary-container": "#1558c9",
        "on-secondary-container": "#bbccff",
        "secondary-fixed": "#dae2ff",
        "secondary-fixed-dim": "#b1c5ff",
        "on-secondary-fixed": "#001946",
        "on-secondary-fixed-variant": "#00419f",

        "tertiary": "#ffffff",
        "on-tertiary": "#27313d",
        "tertiary-container": "#d8e3f3",
        "on-tertiary-container": "#5b6573",
        "tertiary-fixed": "#d8e3f3",
        "tertiary-fixed-dim": "#bcc7d7",
        "on-tertiary-fixed": "#121c28",
        "on-tertiary-fixed-variant": "#3d4854",

        "error": "#ff5364",
        "on-error": "#690005",
        "error-container": "#93000a",
        "on-error-container": "#ffdad6",
        "warning": "#ffb547",
        "success": "#50d890",

        "brand": {
          "black": "#030407",
          "surface": "#101116",
          "card": "#171920",
          "border": "#272a33",
          "border-focus": "#3a3e4d",
          "cobalt": "#1558C9",
          "lime": "#D4FF24",
          "text": "#F4F5F7",
          "muted": "#9296A3",
          "faint": "#5A5E6B",
          "danger": "#FF5364",
          "warn": "#FFB547",
          "ok": "#50D890",
        }
      },
      borderRadius: {
        "DEFAULT": "0.25rem",
        "sm": "0.125rem",
        "md": "0.25rem",
        "lg": "0.375rem",
        "xl": "0.5rem",
        "2xl": "0.75rem",
        "full": "9999px"
      },
      fontFamily: {
        sans: ["Geist", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"]
      }
    }
  },
  plugins: [],
}

