/**
 * Grace configuration utilities for cross-midnight OT feature
 * 
 * These functions read from environment variables and provide defaults:
 * - CHECKOUT_GRACE_HOURS: Max session length (default: 24 hours, range: 1-48)
 * - ADJUST_REQUEST_MAX_DAYS: Max submission window from checkIn (default: 7 days, range: 1-30)
 */

/**
 * Safely read and validate an integer environment variable
 * @param {string} name - Environment variable name
 * @param {number} defaultValue - Default value if invalid/missing
 * @param {Object} options - Validation options
 * @param {number} options.min - Minimum allowed value (inclusive)
 * @param {number} options.max - Maximum allowed value (inclusive)
 * @returns {number} Validated integer value
 */
const readIntEnv = (name, defaultValue, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) => {
    const raw = process.env[name];

    // Handle missing/empty
    if (raw == null || raw === '') {
        return defaultValue;
    }

    // Strict validation: reject trailing garbage (e.g., "12abc", "12.5")
    if (!/^\d+$/.test(raw.trim())) {
        return defaultValue;
    }

    const n = Number.parseInt(raw, 10);

    // Handle NaN (redundant after regex check, but kept for safety)
    if (Number.isNaN(n)) {
        return defaultValue;
    }

    // Enforce range
    if (n < min || n > max) {
        return defaultValue;
    }

    return n;
};

/**
 * Get checkout grace period in hours
 * @returns {number} Grace period in hours (1-48, default: 24)
 */
export const getCheckoutGraceHours = () =>
    readIntEnv('CHECKOUT_GRACE_HOURS', 24, { min: 1, max: 48 });

/**
 * Get checkout grace period in milliseconds
 * @returns {number} Grace period in milliseconds
 */
export const getCheckoutGraceMs = () =>
    getCheckoutGraceHours() * 60 * 60 * 1000;

/**
 * Get adjust request max window in days
 * @returns {number} Max submission window in days (1-30, default: 7)
 */
export const getAdjustRequestMaxDays = () =>
    readIntEnv('ADJUST_REQUEST_MAX_DAYS', 7, { min: 1, max: 30 });

/**
 * Get adjust request max window in milliseconds
 * @returns {number} Max submission window in milliseconds
 */
export const getAdjustRequestMaxMs = () =>
    getAdjustRequestMaxDays() * 24 * 60 * 60 * 1000;
