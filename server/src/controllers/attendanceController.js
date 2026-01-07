import * as attendanceService from '../services/attendanceService.js';
import { getTodayDateKey } from '../utils/dateUtils.js';

/**
 * POST /api/attendance/check-in
 * Check in for today (GMT+7)
 */
export const checkIn = async (req, res) => {
  try {
    const userId = req.user._id;

    const attendance = await attendanceService.checkIn(userId);

    return res.status(200).json({
      attendance
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      message: error.message || 'Failed to check in'
    });
  }
};

/**
 * POST /api/attendance/check-out
 * Check out for today (GMT+7)
 */
export const checkOut = async (req, res) => {
  try {
    const userId = req.user._id;

    const attendance = await attendanceService.checkOut(userId);

    return res.status(200).json({
      attendance
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      message: error.message || 'Failed to check out'
    });
  }
};

/**
 * GET /api/attendance/me?month=YYYY-MM
 * Get monthly attendance history with computed fields
 */
export const getMyAttendance = async (req, res) => {
  try {
    const userId = req.user._id;

    let month = req.query.month;
    if (!month) {
      const today = getTodayDateKey();
      month = today.substring(0, 7); // Extract "YYYY-MM"
    }

    // Validate month format
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({
        message: 'Invalid month format. Expected YYYY-MM (e.g., 2026-01)'
      });
    }

    // TODO: Fetch holidays from database in future
    // For MVP, pass empty Set (no holidays configured yet)
    const holidayDates = new Set();

    const items = await attendanceService.getMonthlyHistory(userId, month, holidayDates);

    return res.status(200).json({
      items
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      message: error.message || 'Failed to fetch attendance history'
    });
  }
};
