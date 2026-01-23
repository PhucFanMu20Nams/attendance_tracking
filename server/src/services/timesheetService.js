import User from '../models/User.js';
import Attendance from '../models/Attendance.js';
import { computeAttendance } from '../utils/attendanceCompute.js';
import { isWeekend, getTodayDateKey } from '../utils/dateUtils.js';

const STATUS_COLOR_MAP = {
    ON_TIME: 'green',
    LATE: 'red',
    EARLY_LEAVE: 'yellow',
    LATE_AND_EARLY: 'purple', // NEW v2.3: combined late check-in + early leave
    MISSING_CHECKOUT: 'yellow',
    MISSING_CHECKIN: 'orange', // Edge case: checkout without checkin
    WEEKEND_OR_HOLIDAY: 'gray',
    ABSENT: 'white',
    WORKING: 'white',
    UNKNOWN: 'white'
};

/**
 * Get timesheet matrix for a specific team.
 * RBAC: Manager sees their team, Admin can specify any teamId.
 * 
 * @param {string} teamId - Team's ObjectId
 * @param {string} month - "YYYY-MM" format
 * @param {Set<string>} holidayDates - Set of holiday dateKeys (optional)
 * @returns {Promise<Object>} { days: number[], rows: Array }
 */
export const getTeamTimesheet = async (teamId, month, holidayDates = new Set()) => {
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
        const error = new Error('Invalid month format. Expected YYYY-MM');
        error.statusCode = 400;
        throw error;
    }

    if (!teamId) {
        const error = new Error('Team ID is required');
        error.statusCode = 400;
        throw error;
    }

    const users = await User.find({ teamId, isActive: true })
        .select('_id name employeeCode')
        .sort({ employeeCode: 1 });

    return buildTimesheetMatrix(users, month, holidayDates);
};

/**
 * Get timesheet matrix for entire company.
 * RBAC: Admin only.
 * 
 * @param {string} month - "YYYY-MM" format
 * @param {Set<string>} holidayDates - Set of holiday dateKeys (optional)
 * @returns {Promise<Object>} { days: number[], rows: Array }
 */
export const getCompanyTimesheet = async (month, holidayDates = new Set()) => {
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
        const error = new Error('Invalid month format. Expected YYYY-MM');
        error.statusCode = 400;
        throw error;
    }

    const users = await User.find({ isActive: true })
        .select('_id name employeeCode')
        .sort({ employeeCode: 1 });

    return buildTimesheetMatrix(users, month, holidayDates);
};

/**
 * Build timesheet matrix for given users and month.
 * Each row = user, each cell = day status with color.
 */
async function buildTimesheetMatrix(users, month, holidayDates) {
    const [year, monthNum] = month.split('-').map(Number);
    const daysInMonth = new Date(year, monthNum, 0).getDate();
    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
    const todayDateKey = getTodayDateKey();

    const userIds = users.map(u => u._id);

    const attendanceRecords = await Attendance.find({
        userId: { $in: userIds },
        date: { $gte: `${month}-01`, $lte: `${month}-31` }
    })
        .select('userId date checkInAt checkOutAt')
        .lean();

    // Group attendance by "userId_date" for O(1) lookup
    const attendanceMap = new Map();
    for (const record of attendanceRecords) {
        const key = `${String(record.userId)}_${record.date}`;
        attendanceMap.set(key, record);
    }

    const rows = users.map(user => {
        const cells = days.map(day => {
            const dateKey = `${month}-${String(day).padStart(2, '0')}`;
            const mapKey = `${String(user._id)}_${dateKey}`;
            const attendance = attendanceMap.get(mapKey);

            const { status, colorKey } = computeCellStatus(
                dateKey,
                attendance,
                holidayDates,
                todayDateKey
            );

            return { date: dateKey, status, colorKey };
        });

        return {
            user: {
                _id: user._id,
                name: user.name,
                employeeCode: user.employeeCode
            },
            cells
        };
    });

    return { days, rows };
}

/**
 * Compute status and color for a single cell (one user, one day).
 * Handles: weekend/holiday, absent (no record), and existing attendance.
 */
function computeCellStatus(dateKey, attendance, holidayDates, todayDateKey) {
    // Weekend or Holiday check first
    if (isWeekend(dateKey) || holidayDates.has(dateKey)) {
        return {
            status: 'WEEKEND_OR_HOLIDAY',
            colorKey: STATUS_COLOR_MAP.WEEKEND_OR_HOLIDAY
        };
    }

    // No attendance record
    if (!attendance) {
        // Future date or today without check-in -> not ABSENT yet
        if (dateKey >= todayDateKey) {
            return {
                status: null,
                colorKey: STATUS_COLOR_MAP.ABSENT
            };
        }
        // Past workday with no record -> ABSENT
        return {
            status: 'ABSENT',
            colorKey: STATUS_COLOR_MAP.ABSENT
        };
    }

    // Has attendance record -> compute using existing utility
    const computed = computeAttendance(
        {
            date: dateKey,
            checkInAt: attendance.checkInAt,
            checkOutAt: attendance.checkOutAt
        },
        holidayDates
    );

    return {
        status: computed.status,
        colorKey: STATUS_COLOR_MAP[computed.status] || 'white'
    };
}