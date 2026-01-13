import mongoose from 'mongoose';
import * as reportService from '../services/reportService.js';
import { getTodayDateKey } from '../utils/dateUtils.js';

/**
 * GET /api/reports/monthly?month=YYYY-MM&scope=team|company&teamId?
 * Monthly report with summary per user.
 * RBAC: Manager (team only), Admin (team or company).
 */
export const getMonthlyReport = async (req, res) => {
    try {
        const user = req.user;
        let { month, scope, teamId } = req.query;

        // Defense-in-depth: Only Manager/Admin can access reports
        if (!['MANAGER', 'ADMIN'].includes(user.role)) {
            return res.status(403).json({
                message: 'Only Manager and Admin can access reports'
            });
        }

        // Default month to current month if not provided
        if (!month) {
            const today = getTodayDateKey();
            month = today.slice(0, 7); // "YYYY-MM"
        }

        // Validate month format
        if (!/^\d{4}-\d{2}$/.test(month)) {
            return res.status(400).json({
                message: 'Invalid month format. Expected YYYY-MM (e.g., 2026-01)'
            });
        }

        // Default scope based on role
        if (!scope) {
            scope = user.role === 'ADMIN' ? 'company' : 'team';
        }

        // Validate scope value
        if (!['team', 'company'].includes(scope)) {
            return res.status(400).json({
                message: 'Invalid scope. Expected "team" or "company"'
            });
        }

        // RBAC: Manager can only view team scope
        if (user.role === 'MANAGER') {
            if (scope !== 'team') {
                return res.status(403).json({
                    message: 'Manager can only view team reports'
                });
            }

            // Manager must use their own team
            if (!user.teamId) {
                return res.status(403).json({
                    message: 'Manager must be assigned to a team'
                });
            }

            // Force teamId to manager's team (ignore any provided teamId)
            teamId = user.teamId;
        }

        // RBAC: Admin can view company or specify teamId
        if (user.role === 'ADMIN') {
            if (scope === 'team') {
                if (!teamId) {
                    return res.status(400).json({
                        message: 'Admin must specify teamId for team scope report'
                    });
                }
                // Validate teamId is valid ObjectId
                if (!mongoose.Types.ObjectId.isValid(teamId)) {
                    return res.status(400).json({
                        message: 'Invalid teamId format'
                    });
                }
            }
            // If scope is 'company', teamId is ignored
        }

        // TODO: In future, fetch holiday dates from Holiday model
        const holidayDates = new Set();

        const result = await reportService.getMonthlyReport(scope, month, teamId, holidayDates);

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({
            message: error.message || 'Failed to fetch monthly report'
        });
    }
};
