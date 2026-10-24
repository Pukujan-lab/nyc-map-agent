import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  // Theme classes are set at runtime (`theme-${id}`), so keep their token blocks.
  safelist: ["theme-ivory", "theme-ink", "theme-mta", "theme-neon", "theme-dusk", "theme-night"],
  theme: {
    container: {
      center: true,
      padding: "1rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      fontFamily: { serif: ["var(--serif)"] },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        acc: {
          DEFAULT: "hsl(var(--acc))",
          foreground: "hsl(var(--acc-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "pulse-ring": {
          "0%, 100%": { opacity: "0.35", transform: "scale(0.9)" },
          "50%": { opacity: "1", transform: "scale(1.15)" },
        },
        // The hands-free voice orb (#370): a slow breath, its glow, and three drifting waves.
        "orb-pulse": { "0%, 100%": { transform: "scale(1)" }, "50%": { transform: "scale(1.06)" } },
        "orb-glow": { "0%, 100%": { opacity: "0.7" }, "50%": { opacity: "1" } },
        "orb-wave": { "0%, 100%": { transform: "translateX(0)" }, "50%": { transform: "translateX(-6px)" } },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "pulse-ring": "pulse-ring 1.4s ease-in-out infinite",
        "orb-pulse": "orb-pulse 2.4s ease-in-out infinite",
        "orb-glow": "orb-glow 2.4s ease-in-out infinite",
        "orb-wave-1": "orb-wave 1.8s ease-in-out infinite",
        "orb-wave-2": "orb-wave 2.2s ease-in-out infinite reverse",
        "orb-wave-3": "orb-wave 2.6s ease-in-out infinite",
      },
    },
  },
  plugins: [animate],
} satisfies Config;
