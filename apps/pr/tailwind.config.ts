import type { Config } from "tailwindcss";

/**
 * PR.FYLYM design tokens — dark-first, monochrome, no gradients. The palette
 * is deliberately tiny: two surfaces, two text colors, one border, one accent
 * (white). Premium comes from spacing and typography, not decoration.
 */
const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "hsl(240 6% 4%)",
        surface: "hsl(240 5% 7%)",
        raised: "hsl(240 5% 10%)",
        border: "hsl(240 5% 16%)",
        foreground: "hsl(0 0% 96%)",
        muted: "hsl(240 4% 60%)",
        faint: "hsl(240 4% 42%)",
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "Inter",
          "Segoe UI",
          "sans-serif",
        ],
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.25rem",
      },
    },
  },
  plugins: [],
};

export default config;
