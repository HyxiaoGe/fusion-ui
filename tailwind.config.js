/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        card: 'var(--card)',
        'card-foreground': 'var(--card-foreground)',
        popover: 'var(--popover)',
        'popover-foreground': 'var(--popover-foreground)',
        primary: 'var(--primary)',
        'primary-foreground': 'var(--primary-foreground)',
        secondary: 'var(--secondary)',
        'secondary-foreground': 'var(--secondary-foreground)',
        muted: 'var(--muted)',
        'muted-foreground': 'var(--muted-foreground)',
        accent: 'var(--accent)',
        'accent-foreground': 'var(--accent-foreground)',
        destructive: 'var(--destructive)',
        'destructive-foreground': 'var(--destructive-foreground)',
        border: 'var(--border)',
        input: 'var(--input)',
        ring: 'var(--ring)',
        // === Fusion Design System v2 — 语义色 + bg/fg 细分 ===
        info: {
          DEFAULT: 'var(--info)',
          bg: 'var(--info-bg)',
          border: 'var(--info-border)',
        },
        success: {
          DEFAULT: 'var(--success)',
          bg: 'var(--success-bg)',
          border: 'var(--success-border)',
        },
        warn: {
          DEFAULT: 'var(--warn)',
          bg: 'var(--warn-bg)',
          border: 'var(--warn-border)',
        },
        danger: {
          DEFAULT: 'var(--danger)',
          bg: 'var(--danger-bg)',
          border: 'var(--danger-border)',
        },
        teal: 'var(--teal)',
        fg: {
          secondary: 'var(--fg-secondary)',
          subtle: 'var(--fg-subtle)',
        },
        bg: {
          subtle: 'var(--bg-subtle)',
          elevated: 'var(--bg-elevated)',
        },
        'border-strong': 'var(--border-strong)',
      },
      fontSize: {
        '2xs': 'var(--text-2xs)',
        // 注意：xs/sm/base/lg/xl 等已被 Tailwind 默认占用，不重写以免破坏现有类
        // 新引入的 fdv2 命名空间避免冲突
        'fdv2-xs': 'var(--text-fdv2-xs)',
        'fdv2-sm': 'var(--text-fdv2-sm)',
        'fdv2-base': 'var(--text-fdv2-base)',
        md: 'var(--text-md)',
        'fdv2-lg': 'var(--text-fdv2-lg)',
        'fdv2-xl': 'var(--text-fdv2-xl)',
        'fdv2-2xl': 'var(--text-fdv2-2xl)',
        'fdv2-3xl': 'var(--text-fdv2-3xl)',
      },
      transitionDuration: {
        fast: 'var(--duration-fast)',
        // 注意：不写 DEFAULT 以避免覆盖 Tailwind 默认 transition-duration（150ms）
        // 后续若需要 base，用具体类名如 duration-200 即可
        slow: 'var(--duration-slow)',
      },
      transitionTimingFunction: {
        standard: 'var(--ease-standard)',
        'fdv2-out': 'var(--ease-fdv2-out)',
      },
      boxShadow: {
        xs: 'var(--shadow-xs)',
        'fdv2-sm': 'var(--shadow-fdv2-sm)',
        'fdv2-md': 'var(--shadow-fdv2-md)',
        'fdv2-lg': 'var(--shadow-fdv2-lg)',
        popover: 'var(--shadow-popover)',
      },
      animation: {
        'slide-in-from-top': 'slideInFromTop 0.3s ease-out',
        'blink': 'blink 1s infinite',
        'shine': 'shine 2s linear infinite',
      },
      keyframes: {
        slideInFromTop: {
          '0%': { transform: 'translateY(-100%)', opacity: 0 },
          '100%': { transform: 'translateY(0)', opacity: 1 },
        },
        blink: {
          '0%, 100%': { opacity: 1 },
          '50%': { opacity: 0 },
        },
        shine: {
          '0%': { backgroundPosition: '200% center' },
          '100%': { backgroundPosition: '-200% center' },
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      outlineColor: {
        ring: 'var(--ring)',
      },
      backgroundSize: {
        'auto': 'auto',
        'cover': 'cover',
        'contain': 'contain',
        '200%': '200%',
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}