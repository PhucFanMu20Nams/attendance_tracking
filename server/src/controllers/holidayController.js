import Holiday from '../models/Holiday.js';

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

        // Default to current year in GMT+7 (Asia/Ho_Chi_Minh)
        const now = new Date();
        const gmt7Now = new Date(now.getTime() + 7 * 60 * 60 * 1000);
        const currentYear = gmt7Now.getUTCFullYear();

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
