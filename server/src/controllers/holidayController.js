import Holiday from '../models/Holiday.js';
import { getTodayDateKey } from '../utils/dateUtils.js';

/**
 * Validate that dateStr represents a real calendar date.
 * Prevents invalid dates like "2026-02-30" which JavaScript auto-rolls to March.
 * @param {string} dateStr - Date in YYYY-MM-DD format
 * @returns {boolean} True if valid calendar date
 */
function isValidCalendarDate(dateStr) {
    const date = new Date(dateStr + 'T00:00:00Z');
    return !isNaN(date.getTime()) && date.toISOString().startsWith(dateStr);
}

/**
 * Holiday Controller
 * Per API_SPEC.md#L402-L412
 * 
 * Endpoints:
 * - POST /api/admin/holidays - ADMIN only, create holiday
 * - GET /api/admin/holidays?year=YYYY - ADMIN only, list holidays by year
 */

/**
 * POST /api/admin/holidays
 * ADMIN only - Create new holiday
 * 
 * Request body:
 * - date: "YYYY-MM-DD" [required]
 * - name: string [required]
 * 
 * Response:
 * - 201: { _id, date, name }
 * - 400: Validation error
 * - 403: Access denied (non-ADMIN)
 * - 409: Duplicate date
 */
export async function createHoliday(req, res) {
    try {
        // RBAC: ADMIN only
        if (req.user.role !== 'ADMIN') {
            return res.status(403).json({ message: 'Access denied' });
        }

        const { date, name } = req.body;

        // Validation: date required
        if (!date) {
            return res.status(400).json({ message: 'Date is required' });
        }

        // Validation: date format YYYY-MM-DD
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return res.status(400).json({ message: 'Date must be in YYYY-MM-DD format' });
        }

        // Validation: date is a real calendar date (consistency with createHolidayRange)
        if (!isValidCalendarDate(date)) {
            return res.status(400).json({ message: 'Date is not a valid calendar date' });
        }

        // Validation: name required, trim whitespace
        if (!name || !name.trim()) {
            return res.status(400).json({ message: 'Name is required' });
        }

        // Create holiday
        const holiday = await Holiday.create({
            date,
            name: name.trim()
        });

        // Return sanitized response (no __v, timestamps)
        return res.status(201).json({
            _id: holiday._id,
            date: holiday.date,
            name: holiday.name
        });
    } catch (error) {
        // Handle duplicate key error (MongoDB 11000)
        if (error.code === 11000) {
            return res.status(409).json({ message: 'Holiday already exists for this date' });
        }
        console.error('createHoliday error:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
}

/**
 * GET /api/admin/holidays?year=YYYY
 * ADMIN only - Get holidays by year
 * 
 * Query params:
 * - year: YYYY (optional, defaults to current year in GMT+7)
 * 
 * Response:
 * - 200: { items: [{ _id, date, name }] }
 * - 400: Invalid year format
 * - 403: Access denied (non-ADMIN)
 */
export async function getHolidays(req, res) {
    try {
        // RBAC: ADMIN only
        if (req.user.role !== 'ADMIN') {
            return res.status(403).json({ message: 'Access denied' });
        }

        // Default to current year in GMT+7 using existing dateUtils
        const todayKey = getTodayDateKey();
        const currentYear = todayKey.substring(0, 4);

        const year = req.query.year || currentYear.toString();

        // Validate year format
        if (!/^\d{4}$/.test(year)) {
            return res.status(400).json({ message: 'Year must be in YYYY format' });
        }

        // Query holidays for the year: date starts with "YYYY-"
        const holidays = await Holiday.find({
            date: { $regex: `^${year}-` }
        })
            .select('_id date name')
            .sort({ date: 1 })
            .lean();

        return res.status(200).json({ items: holidays });
    } catch (error) {
        console.error('getHolidays error:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
}

/**
 * POST /api/admin/holidays/range
 * ADMIN only - Create holidays in date range
 * 
 * Request body:
 * - startDate: "YYYY-MM-DD" [required]
 * - endDate: "YYYY-MM-DD" [required, >= startDate]
 * - name: string [required]
 * 
 * Rules (per API_SPEC.md L441-458):
 * - Max range: 30 days
 * - Skip existing dates (no error)
 * 
 * Response:
 * - 201: { created: 5, skipped: 2, dates: ["2026-01-01", ...] }
 * - 400: Validation error
 * - 403: Access denied
 */
export async function createHolidayRange(req, res) {
    try {
        // RBAC: ADMIN only
        if (req.user.role !== 'ADMIN') {
            return res.status(403).json({ message: 'Access denied' });
        }

        const { startDate, endDate, name } = req.body;

        // Validation: startDate required + format
        if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
            return res.status(400).json({
                message: 'startDate is required in YYYY-MM-DD format'
            });
        }

        // Validation: endDate required + format
        if (!endDate || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
            return res.status(400).json({
                message: 'endDate is required in YYYY-MM-DD format'
            });
        }

        // Validation: startDate is a real calendar date (P1 fix)
        if (!isValidCalendarDate(startDate)) {
            return res.status(400).json({
                message: 'startDate is not a valid calendar date'
            });
        }

        // Validation: endDate is a real calendar date (P1 fix)
        if (!isValidCalendarDate(endDate)) {
            return res.status(400).json({
                message: 'endDate is not a valid calendar date'
            });
        }

        // Validation: endDate >= startDate
        if (endDate < startDate) {
            return res.status(400).json({
                message: 'endDate must be >= startDate'
            });
        }

        // Validation: name required
        if (!name || !name.trim()) {
            return res.status(400).json({ message: 'Name is required' });
        }

        // Validation: max 30 days (use UTC to avoid timezone issues)
        const start = new Date(startDate + 'T00:00:00Z');
        const end = new Date(endDate + 'T00:00:00Z');
        const diffDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
        if (diffDays > 30) {
            return res.status(400).json({
                message: 'Range cannot exceed 30 days'
            });
        }

        // Generate date strings in range using UTC methods (P3 fix)
        const dates = [];
        const current = new Date(startDate + 'T00:00:00Z');
        while (current <= end) {
            const dateStr = current.toISOString().split('T')[0];
            dates.push(dateStr);
            current.setUTCDate(current.getUTCDate() + 1);
        }

        // Insert individually, catching duplicate errors (11000)
        const docs = dates.map(d => ({ date: d, name: name.trim() }));
        let created = 0, skipped = 0;
        const createdDates = [];

        for (const doc of docs) {
            try {
                await Holiday.create(doc);
                created++;
                createdDates.push(doc.date);
            } catch (err) {
                if (err.code === 11000) {
                    skipped++;
                } else {
                    throw err;
                }
            }
        }

        return res.status(201).json({
            created,
            skipped,
            dates: createdDates
        });
    } catch (error) {
        console.error('createHolidayRange error:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
}
