import * as timesheetService from '../services/timesheetService.js';
import { getTodayDateKey } from '../utils/dateUtils.js';

/**
 * GET /api/timesheet/team?month=YYYY-MM
 * Get timesheet matrix for a team.
 * RBAC: Manager sees their own team, Admin can specify teamId via query param.
 */
export const getTeamTimesheet = async (req, res) => {
    try {
        let month = req.query.month;
        if (!month) {
            const today = getTodayDateKey();
            month = today.substring(0, 7);
        }

        if (!/^\d{4}-\d{2}$/.test(month)) {
            return res.status(400).json({
                message: 'Invalid month format. Expected YYYY-MM (e.g., 2026-01)'
            });
        }

        let teamId;

        if (req.user.role === 'ADMIN' && req.query.teamId) {
            teamId = req.query.teamId;
        } else if (req.user.role === 'MANAGER') {
            if (!req.user.teamId) {
                return res.status(403).json({
                    message: 'Manager must be assigned to a team'
                });
            }
            teamId = req.user.teamId;
        } else if (req.user.role === 'ADMIN') {
            return res.status(400).json({
                message: 'Admin must specify teamId query parameter for team timesheet'
            });
        } else {
            return res.status(403).json({
                message: 'Insufficient permissions'
            });
        }

        // TODO: Fetch holidays from database in future
        const holidayDates = new Set();

        const result = await timesheetService.getTeamTimesheet(teamId, month, holidayDates);

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({
            message: error.message || 'Failed to fetch team timesheet'
        });
    }
};

/**
 * GET /api/timesheet/company?month=YYYY-MM
 * Get timesheet matrix for entire company.
 * RBAC: Admin only.
 */
export const getCompanyTimesheet = async (req, res) => {
    try {
        let month = req.query.month;
        if (!month) {
            const today = getTodayDateKey();
            month = today.substring(0, 7);
        }

        if (!/^\d{4}-\d{2}$/.test(month)) {
            return res.status(400).json({
                message: 'Invalid month format. Expected YYYY-MM (e.g., 2026-01)'
            });
        }

        // TODO: Fetch holidays from database in future
        const holidayDates = new Set();

        const result = await timesheetService.getCompanyTimesheet(month, holidayDates);

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({
            message: error.message || 'Failed to fetch company timesheet'
        });
    }
};
