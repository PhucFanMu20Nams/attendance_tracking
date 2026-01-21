import flowbite from "flowbite/plugin";

/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
        "node_modules/flowbite-react/lib/esm/**/*.js",
    ],
    theme: {
        extend: {
            // Brand Colors - Professional Blue/Teal palette
            colors: {
                primary: {
                    50: '#f0f9ff',
                    100: '#e0f2fe',
                    200: '#bae6fd',
                    300: '#7dd3fc',
                    400: '#38bdf8',
                    500: '#0ea5e9',  // Main primary
                    600: '#0284c7',  // Primary buttons
                    700: '#0369a1',  // Hover state
                    800: '#075985',
                    900: '#0c4a6e',
                },
                // Semantic colors for status badges (per RULES.md)
                status: {
                    ontime: '#16a34a',      // green-600 - ON_TIME
                    late: '#f59e0b',         // amber-500 - LATE
                    absent: '#dc2626',       // red-600 - ABSENT
                    working: '#3b82f6',      // blue-500 - WORKING
                    missing: '#eab308',      // yellow-500 - MISSING_CHECKOUT
                    weekend: '#9ca3af',      // gray-400 - WEEKEND_OR_HOLIDAY
                },
            },
            // Modern typography
            fontFamily: {
                sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
            },
            // Consistent border radius
            borderRadius: {
                DEFAULT: '0.5rem',  // 8px modern feel
            },
            // Card shadows
            boxShadow: {
                'card': '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
                'card-hover': '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
            },
        },
    },
    plugins: [
        flowbite,
    ],
};

