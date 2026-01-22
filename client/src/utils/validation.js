/**
 * Validation Utilities
 * 
 * Common validation functions for form inputs.
 * Used by AdminMembersPage (Create form) and EditMemberModal.
 */

/**
 * Validate email format using simple regex.
 * Checks for: local@domain.tld pattern
 * 
 * @param {string} email - Email to validate
 * @returns {boolean} - True if valid email format
 */
export const isValidEmail = (email) => {
    if (!email || typeof email !== 'string') return false;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
};

/**
 * Common max lengths for form fields.
 * Based on common practice and UX considerations.
 * Note: Backend does not enforce these limits - frontend-only protection.
 */
export const MAX_LENGTHS = Object.freeze({
    employeeCode: 20,
    name: 100,
    email: 255,
    username: 50,
    password: 128
});
