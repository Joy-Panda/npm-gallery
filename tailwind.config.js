/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    "./src/webview/**/*.{ts,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "var(--vscode-widget-border)",
        input: "var(--vscode-input-background)",
        ring: "var(--vscode-focusBorder)",
        background: "var(--vscode-editor-background)",
        foreground: "var(--vscode-foreground)",
        primary: {
          DEFAULT: "var(--vscode-button-background)",
          foreground: "var(--vscode-button-foreground)",
          hover: "var(--vscode-button-hoverBackground)",
        },
        secondary: {
          DEFAULT: "var(--vscode-button-secondaryBackground)",
          foreground: "var(--vscode-button-secondaryForeground)",
          hover: "var(--vscode-button-secondaryHoverBackground)",
        },
        destructive: {
          DEFAULT: "var(--vscode-errorForeground)",
          foreground: "var(--vscode-button-foreground)",
        },
        muted: {
          DEFAULT: "var(--vscode-editor-inactiveSelectionBackground)",
          foreground: "var(--vscode-descriptionForeground)",
        },
        accent: {
          DEFAULT: "var(--vscode-list-hoverBackground)",
          foreground: "var(--vscode-foreground)",
        },
        card: {
          DEFAULT: "var(--vscode-sideBar-background)",
          foreground: "var(--vscode-foreground)",
        },
        success: {
          DEFAULT: "var(--vscode-testing-iconPassed)",
        },
        warning: {
          DEFAULT: "var(--vscode-editorWarning-foreground)",
        },
        link: {
          DEFAULT: "var(--vscode-textLink-foreground)",
        },
        badge: {
          DEFAULT: "var(--vscode-badge-background)",
          foreground: "var(--vscode-badge-foreground)",
        },
      },
      borderRadius: {
        lg: "8px",
        md: "6px",
        sm: "4px",
      },
      fontSize: {
        xs: "11px",
        sm: "12px",
        base: "13px",
        lg: "14px",
        xl: "16px",
        "2xl": "20px",
        "3xl": "24px",
      },
    },
  },
  plugins: [],
};
