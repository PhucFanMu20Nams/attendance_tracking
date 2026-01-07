import Attendance from '../models/Attendance.js';
import { getTodayDateKey } from '../utils/dateUtils.js';
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
