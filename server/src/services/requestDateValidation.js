/**
 * Shared date validation helpers for request services.
 * Used by adjustTimeService.js and otService.js.
 */

/**
 * Validate and parse a date value.
 * Throws 400 error if the value is present but cannot be parsed as a valid Date.
 *
 * @param {*} value - Value to parse (string, Date, or null/undefined)
 * @param {string} fieldName - Field name for error message
 * @returns {Date|null} Parsed Date or null if value is falsy
 */
export const toValidDate = (value, fieldName) => {
  if (!value) return null;

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    const error = new Error(`${fieldName} is invalid`);
    error.statusCode = 400;
    throw error;
  }
  return d;
};

/**
 * Assert that a value includes timezone information if it's a string.
 * Prevents timezone ambiguity for string inputs while allowing Date objects.
 *
 * Bug #1 Fix: Only validates strings - Date objects are already timezone-aware.
 *
 * @param {*} value - Value to check (string, Date, or null/undefined)
 * @param {string} fieldName - Field name for error message
 * @throws {Error} 400 if value is a string without timezone
 */
export const assertHasTzIfString = (value, fieldName) => {
  if (!value) return;

  // Only validate string inputs (Date objects are already timezone-aware)
  if (typeof value === 'string') {
    const trimmed = value.trim();
    // Accept ISO 8601: +07:00, +0700, Z
    if (!/(Z|[+-]\d{2}:?\d{2})$/.test(trimmed)) {
      const error = new Error(
        `${fieldName} must include timezone (e.g., +07:00 or Z)`
      );
      error.statusCode = 400;
      throw error;
    }
  }
};
