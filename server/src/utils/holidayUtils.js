import Holiday from '../models/Holiday.js';

/**
 * Holiday Utility Functions
 * Per Implementation Plan Stage 1.5
 */

/**
 * Validate month format "YYYY-MM" with valid month range 01-12.
 * @param {string} month
 * @throws {Error} if invalid
 */
function validateMonthFormat(month) {
    if (!month || typeof month !== 'string') {
        const error = new Error('Month is required');
        error.statusCode = 400;
        throw error;
    }

    const trimmed = month.trim();

    // Validate format YYYY-MM (zero-padded)
    if (!/^\d{4}-\d{2}$/.test(trimmed)) {
        const error = new Error('Month must be in YYYY-MM format (e.g., 2026-01)');
        error.statusCode = 400;
        throw error;
    }

    // Validate month range 01-12
    const monthNum = parseInt(trimmed.substring(5, 7), 10);
    if (monthNum < 1 || monthNum > 12) {
        const error = new Error('Month must be between 01 and 12');
        error.statusCode = 400;
        throw error;
    }

    return trimmed;
}

/**
 * Get holiday dates for a specific month as a Set.
 * @param {string} month - "YYYY-MM" (zero-padded, 01-12)
 * @returns {Promise<Set<string>>} Set of date strings "YYYY-MM-DD"
 * @throws {Error} if month format is invalid
 */
export async function getHolidayDatesForMonth(month) {
    // Defensive validation per RULES.md and API_SPEC.md
    const validMonth = validateMonthFormat(month);

    // Calculate date range using [startDate, nextMonthStart) pattern
    // Avoids "magic number" -31 and handles all month lengths correctly
    const [year, monthNum] = validMonth.split('-').map(Number);
    const nextYear = monthNum === 12 ? year + 1 : year;
    const nextMonth = monthNum === 12 ? 1 : monthNum + 1;

    const startDate = `${validMonth}-01`;
    const nextMonthStart = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

    // Per API_SPEC.md: "Never return raw DB objects" - exclude _id
    const holidays = await Holiday.find({
        date: { $gte: startDate, $lt: nextMonthStart }
    }).select('date -_id').lean();

    return new Set(holidays.map(h => h.date));
}

