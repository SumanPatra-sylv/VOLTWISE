/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./App.tsx",
        "./index.tsx",
        "./screens/**/*.{ts,tsx}",
        "./components/**/*.{ts,tsx}",
        "./contexts/**/*.{ts,tsx}",
        "./hooks/**/*.{ts,tsx}",
        "./services/**/*.{ts,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                glass: "rgba(255, 255, 255, 0.6)",
                glassBorder: "rgba(255, 255, 255, 0.4)",
                primary: "#0ea5e9",   // Sky 500
                accent: "#f59e0b",    // Amber 500
                danger: "#ef4444",    // Red 500
                success: "#10b981",   // Emerald 500
            },
            animation: {
                'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
            },
            boxShadow: {
                'soft': '0 4px 20px -2px rgba(0, 0, 0, 0.05)',
                'glow': '0 0 15px rgba(14, 165, 233, 0.3)',
            },
        },
    },
    plugins: [],
};
