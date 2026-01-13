import User from '../models/User.js';
import Attendance from '../models/Attendance.js';
import { computeAttendance } from '../utils/attendanceCompute.js';

/**
 * Get monthly report with summary per user.
 * RBAC: Manager (team only), Admin (team or company).
 * 
 * @param {string} scope - 'team' or 'company'
 * @param {string} month - "YYYY-MM" format
 * @param {string} teamId - Required if scope is 'team'
 * @param {Set<string>} holidayDates - Set of holiday dateKeys (optional)
 * @returns {Promise<Object>} { summary: Array }
 */
export const getMonthlyReport = async (scope, month, teamId, holidayDates = new Set()) => {
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
        const error = new Error('Invalid month format. Expected YYYY-MM');
        error.statusCode = 400;
        throw error;
    }

    if (!scope || !['team', 'company'].includes(scope)) {
        const error = new Error('Invalid scope. Expected "team" or "company"');
        error.statusCode = 400;
        throw error;
    }

    if (scope === 'team' && !teamId) {
        const error = new Error('Team ID is required for team scope');
        error.statusCode = 400;
        throw error;
    }

    // Query users based on scope
    const userQuery = scope === 'team'
        ? { teamId, isActive: true }
        : { isActive: true };

    const users = await User.find(userQuery)
        .select('_id name employeeCode')
        .sort({ employeeCode: 1 })
        .lean();

    if (users.length === 0) {
        return { summary: [] };
    }

    // Query attendance records for the month
    const userIds = users.map(u => u._id);
    const attendanceRecords = await Attendance.find({
        userId: { $in: userIds },
        date: { $gte: `${month}-01`, $lte: `${month}-31` }
    })
        .select('userId date checkInAt checkOutAt otApproved')
        .lean();

    // Group attendance by userId for efficient processing
    const attendanceByUser = new Map();
    for (const record of attendanceRecords) {
        const key = String(record.userId);
        if (!attendanceByUser.has(key)) {
            attendanceByUser.set(key, []);
        }
        attendanceByUser.get(key).push(record);
    }

    // Compute summary for each user
    const summary = users.map(user => {
        const userRecords = attendanceByUser.get(String(user._id)) || [];
        const computed = computeUserMonthlySummary(userRecords, holidayDates);

        return {
            user: {
                _id: user._id,
                name: user.name,
                employeeCode: user.employeeCode
            },
            totalWorkMinutes: computed.totalWorkMinutes,
            totalLateCount: computed.totalLateCount,
            totalOtMinutes: computed.totalOtMinutes,
            approvedOtMinutes: computed.approvedOtMinutes
        };
    });

    return { summary };
};

/**
 * Compute monthly summary for a single user from their attendance records.
 */
function computeUserMonthlySummary(records, holidayDates) {
    let totalWorkMinutes = 0;
    let totalLateCount = 0;
    let totalOtMinutes = 0;
    let approvedOtMinutes = 0;

    for (const record of records) {
        const computed = computeAttendance(
            {
                date: record.date,
                checkInAt: record.checkInAt,
                checkOutAt: record.checkOutAt
            },
            holidayDates
        );

        totalWorkMinutes += computed.workMinutes || 0;
        totalOtMinutes += computed.otMinutes || 0;

        // Count late by lateMinutes, not status
        // This ensures WORKING and MISSING_CHECKOUT records are counted if late
        if (computed.lateMinutes > 0) {
            totalLateCount += 1;
        }

        // Track approved OT separately
        if (record.otApproved && computed.otMinutes > 0) {
            approvedOtMinutes += computed.otMinutes;
        }
    }

    return {
        totalWorkMinutes,
        totalLateCount,
        totalOtMinutes,
        approvedOtMinutes
    };
}
