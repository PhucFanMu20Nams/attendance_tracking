import Attendance from '../models/Attendance.js';
import User from '../models/User.js';
import { getTodayDateKey, isWeekend } from '../utils/dateUtils.js';
import { computeAttendance } from '../utils/attendanceCompute.js';
import { clampPage } from '../utils/pagination.js';

/**
 * Check-in: Create or update today's attendance with checkInAt timestamp.
 * Business rule: One check-in per day, block if already checked in.
 * Race-safe: Atomic condition + E11000 handler prevents concurrent check-ins.
 * 
 * @param {string} userId - User's ObjectId
 * @returns {Promise<Object>} Attendance record
 */
export const checkIn = async (userId) => {
  const dateKey = getTodayDateKey();

  try {
    // Atomic upsert with condition: only set checkInAt if it's null
    // This prevents race condition - if checkInAt has value, update fails and returns null
    const attendance = await Attendance.findOneAndUpdate(
      { 
        userId, 
        date: dateKey,
        checkInAt: null // Only proceed if checkInAt is null (or missing)
      },
      {
        $set: {
          checkInAt: new Date()
        },
        $setOnInsert: {
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

    // If attendance is null, it means checkInAt already has a value (condition failed)
    if (!attendance) {
      const error = new Error('Already checked in');
      error.statusCode = 400;
      throw error;
    }

    return {
      userId: attendance.userId,
      date: attendance.date,
      checkInAt: attendance.checkInAt,
      checkOutAt: attendance.checkOutAt
    };
  } catch (err) {
    // Defense-in-depth: Handle duplicate key error from concurrent upserts
    // This can happen if two requests hit the upsert at exactly the same time
    // before either document exists (rare but possible race window)
    if (err?.code === 11000) {
      const error = new Error('Already checked in');
      error.statusCode = 400;
      throw error;
    }
    // Re-throw other errors (network, validation, etc.)
    throw err;
  }
};

/**
 * Check-out: Update today's attendance with checkOutAt timestamp.
 * Business rule: Must check-in first, block if already checked out.
 * Race-safe: Atomic condition prevents concurrent check-outs.
 * 
 * @param {string} userId - User's ObjectId
 * @returns {Promise<Object>} Attendance record
 */
export const checkOut = async (userId) => {
  const dateKey = getTodayDateKey();

  // Atomic update with condition: only set checkOutAt if checkInAt exists and checkOutAt is null
  // This prevents race condition - concurrent requests will only succeed once
  const attendance = await Attendance.findOneAndUpdate(
    {
      userId,
      date: dateKey,
      checkInAt: { $ne: null }, // checkInAt must have a value (not null)
      checkOutAt: null // checkOutAt must be null (not yet checked out)
    },
    {
      $set: {
        checkOutAt: new Date()
      }
    },
    {
      new: true
    }
  );

  // If attendance is null, either no check-in or already checked out
  // Query to determine the exact error (only on failure path)
  if (!attendance) {
    const existing = await Attendance.findOne({ userId, date: dateKey });
    
    if (!existing || !existing.checkInAt) {
      const error = new Error('Must check in first');
      error.statusCode = 400;
      throw error;
    }
    
    // If we get here, it means checkOutAt already has a value
    const error = new Error('Already checked out');
    error.statusCode = 400;
    throw error;
  }

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
 * 1. WEEKEND_OR_HOLIDAY if today is weekend/holiday
 * 2. null if no attendance record
 * 3. WORKING/LATE/ON_TIME if record exists
 * 
 * @param {string} scope - 'team' or 'company'
 * @param {string|null} teamId - Required if scope is 'team'
 * @param {Set<string>} holidayDates - Set of holiday dateKeys
 * @param {Object} pagination - { page, limit } from controller (v2.5)
 * @returns {Promise<Object>} { date, items, pagination }
 */

export const getTodayActivity = async (scope, teamId, holidayDates = new Set(), pagination = {}) => {
  const todayKey = getTodayDateKey();
  const { page = 1, limit = 20 } = pagination;

  // Validate scope (consistent with reportService pattern)
  if (!scope || !['team', 'company'].includes(scope)) {
    const error = new Error('Invalid scope. Expected "team" or "company"');
    error.statusCode = 400;
    throw error;
  }

  // Step 1: Build user query based on scope (active + soft delete filter)
  const userQuery = { isActive: true, deletedAt: null };
  if (scope === 'team') {
    if (!teamId) {
      const error = new Error('Team ID is required for team scope');
      error.statusCode = 400;
      throw error;
    }
    userQuery.teamId = teamId;
  }

  // Step 2: Count total FIRST (v2.5 pagination)
  const total = await User.countDocuments(userQuery);

  if (total === 0) {
    return {
      date: todayKey,
      items: [],
      pagination: { page: 1, limit, total: 0, totalPages: 0 }
    };
  }

  // Step 3: Clamp page and calculate skip (v2.5)
  const { page: clampedPage, totalPages, skip } = clampPage(page, total, limit);

  // Step 4: Query users with pagination
  const users = await User.find(userQuery)
    .select('_id employeeCode name email username startDate role teamId isActive')
    .sort({ employeeCode: 1 })
    .skip(skip)
    .limit(limit)
    .lean();

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

  return {
    date: todayKey,
    items,
    pagination: {
      page: clampedPage,
      limit,
      total,
      totalPages
    }
  };
};

