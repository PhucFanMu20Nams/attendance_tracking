import Attendance from '../models/Attendance.js';
import User from '../models/User.js';
import { getTodayDateKey, isWeekend } from '../utils/dateUtils.js';
import { computeAttendance } from '../utils/attendanceCompute.js';

/**
 * Check-in: Create or update today's attendance with checkInAt timestamp.
 * Business rule: One check-in per day, block if already checked in.
 * 
 * @param {string} userId - User's ObjectId
 * @returns {Promise<Object>} Attendance record
 */
export const checkIn = async (userId) => {
  const dateKey = getTodayDateKey();

  const existing = await Attendance.findOne({ userId, date: dateKey });

  if (existing && existing.checkInAt) {
    const error = new Error('Already checked in');
    error.statusCode = 400;
    throw error;
  }

  // Atomic upsert prevents race conditions from concurrent check-ins
  const attendance = await Attendance.findOneAndUpdate(
    { userId, date: dateKey },
    {
      $set: {
        checkInAt: new Date(),
        userId,
        date: dateKey
      }
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true
    }
  );

  return {
    userId: attendance.userId,
    date: attendance.date,
    checkInAt: attendance.checkInAt,
    checkOutAt: attendance.checkOutAt
  };
};

/**
 * Check-out: Update today's attendance with checkOutAt timestamp.
 * Business rule: Must check-in first, block if already checked out.
 * 
 * @param {string} userId - User's ObjectId
 * @returns {Promise<Object>} Attendance record
 */
export const checkOut = async (userId) => {
  const dateKey = getTodayDateKey();

  const attendance = await Attendance.findOne({ userId, date: dateKey });

  if (!attendance || !attendance.checkInAt) {
    const error = new Error('Must check in first');
    error.statusCode = 400;
    throw error;
  }

  if (attendance.checkOutAt) {
    const error = new Error('Already checked out');
    error.statusCode = 400;
    throw error;
  }

  attendance.checkOutAt = new Date();
  await attendance.save();

  return {
    userId: attendance.userId,
    date: attendance.date,
    checkInAt: attendance.checkInAt,
    checkOutAt: attendance.checkOutAt
  };
};

/**
 * Get monthly attendance history for a user with computed fields.
 * Returns all attendance records for the specified month with status, minutes calculated.
 * 
 * @param {string} userId - User's ObjectId
 * @param {string} month - "YYYY-MM" format (e.g., "2026-01")
 * @param {Set<string>} holidayDates - Set of holiday dateKeys (optional)
 * @returns {Promise<Array>} Array of attendance records with computed fields
 */
export const getMonthlyHistory = async (userId, month, holidayDates = new Set()) => {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    const error = new Error('Invalid month format. Expected YYYY-MM');
    error.statusCode = 400;
    throw error;
  }

  const records = await Attendance.find({
    userId,
    date: { $regex: `^${month}` }
  }).sort({ date: 1 });

  return records.map(record => {
    const computed = computeAttendance(
      {
        date: record.date,
        checkInAt: record.checkInAt,
        checkOutAt: record.checkOutAt
      },
      holidayDates
    );

    return {
      date: record.date,
      checkInAt: record.checkInAt,
      checkOutAt: record.checkOutAt,
      status: computed.status,
      lateMinutes: computed.lateMinutes,
      workMinutes: computed.workMinutes,
      otMinutes: computed.otMinutes
    };
  });
};

/**
 * Get today's activity for multiple users (Member Management).
 * Performance: N+1 safe - Query users -> Query attendances -> Map in memory.
 * 
 * Status Logic (RULES.md Priority):
 * 1. WEEKEND-HOLIDAY if today is weekend/holiday
 * 2. null if no attendance record
 * 3. WORKING/LATE/ON_TIME if record exists
 * 
 * @param {string} scope - 'team' or 'company'
 * @param {string|null} teamId - Required if scope is 'team'
 * @param {Set<string>} holidayDates - Set of holiday dateKeys
 * @returns {Promise<Object>} { date, items: [{ user, attendance, computed }] }
 */

export const getTodayActivity = async (scope, teamId, holidayDates = new Set()) => {
  const todayKey = getTodayDateKey();

  // Validate scope (consistent with reportService pattern)
  if (!scope || !['team', 'company'].includes(scope)) {
    const error = new Error('Invalid scope. Expected "team" or "company"');
    error.statusCode = 400;
    throw error;
  }

  // Step 1: Query users based on scope (active only)
  const userQuery = { isActive: true };
  if (scope === 'team') {
    if (!teamId) {
      const error = new Error('Team ID is required for team scope');
      error.statusCode = 400;
      throw error;
    }
    userQuery.teamId = teamId;
  }

  const users = await User.find(userQuery)
    .select('_id employeeCode name email username startDate role teamId isActive')
    .sort({ employeeCode: 1 })
    .lean();

  if (users.length === 0) {
    return { date: todayKey, items: [] };
  }

  // Step 2: Query today's attendance (N+1 safe)
  const userIds = users.map(u => u._id);
  const attendanceRecords = await Attendance.find({
    userId: { $in: userIds },
    date: todayKey
  })
    .select('userId date checkInAt checkOutAt')
    .lean();

  // Step 3: Map attendance to user in memory
  const attendanceMap = new Map();
  for (const record of attendanceRecords) {
    attendanceMap.set(String(record.userId), record);
  }

  // Step 4: Compute status for each user
  const items = users.map(user => {
    const attendance = attendanceMap.get(String(user._id)) || null;

    // Compute status following RULES.md priority
    let status = null;
    let lateMinutes = 0;

    // Priority 1: Weekend/Holiday check first
    if (isWeekend(todayKey) || holidayDates.has(todayKey)) {
      status = 'WEEKEND_OR_HOLIDAY';
    }
    // Priority 2: No attendance record = null (NOT ABSENT for today)
    else if (!attendance) {
      status = null;
    }
    // Priority 3: Has attendance record, compute status
    else {
      const computed = computeAttendance(
        { date: todayKey, checkInAt: attendance.checkInAt, checkOutAt: attendance.checkOutAt },
        holidayDates
      );
      status = computed.status;
      lateMinutes = computed.lateMinutes;
    }

    return {
      user: {
        _id: user._id,
        employeeCode: user.employeeCode,
        name: user.name,
        email: user.email,
        username: user.username,
        startDate: user.startDate,
        role: user.role,
        teamId: user.teamId,
        isActive: user.isActive
      },
      attendance: attendance ? {
        date: attendance.date,
        checkInAt: attendance.checkInAt,
        checkOutAt: attendance.checkOutAt
      } : null,
      computed: {
        status,
        lateMinutes
      }
    };
  });

  return { date: todayKey, items };
};

