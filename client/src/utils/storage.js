/**
 * Safe localStorage utilities with error handling.
 * Prevents crashes in private mode, strict CSP, or SSR environments.
 */

/**
 * Safely get item from localStorage with fallback.
 * @param {string} key - localStorage key
 * @param {string} defaultValue - fallback value if access fails
 * @returns {string} - stored value or defaultValue
 */
export const safeGetItem = (key, defaultValue) => {
    try {
        const value = localStorage.getItem(key);
        return value !== null ? value : defaultValue;
    } catch {
        // localStorage blocked (private mode, CSP, etc.)
        return defaultValue;
    }
};

/**
 * Safely set item to localStorage.
 * @param {string} key - localStorage key
 * @param {string} value - value to store
 */
export const safeSetItem = (key, value) => {
    try {
        localStorage.setItem(key, value);
    } catch {
        // Silent fail - app continues without persistence
    }
};
