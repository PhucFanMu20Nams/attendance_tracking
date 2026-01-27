import * as attendanceService from '../services/attendanceService.js';
import { getTodayDateKey } from '../utils/dateUtils.js';
import mongoose from 'mongoose';
import User from '../models/User.js';
import { getHolidayDatesForMonth } from '../utils/holidayUtils.js';
import { parsePaginationParams } from '../utils/pagination.js';

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
    // OWASP A09: Don't expose internal error details for 5xx errors
    const message = statusCode < 500
      ? (error.message || 'Failed to check in')
      : 'Failed to check in';
    return res.status(statusCode).json({ message });
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
    // OWASP A09: Don't expose internal error details for 5xx errors
    const message = statusCode < 500
      ? (error.message || 'Failed to check out')
      : 'Failed to check out';
    return res.status(statusCode).json({ message });
  }
};

/**
 * GET /api/attendance/me?month=YYYY-MM
 * Get monthly attendance history with computed fields
 */
export const getMyAttendance = async (req, res) => {
  try {
    const userId = req.user._id;

    // Normalize query param (handle whitespace + array edge cases)
    let month = req.query.month;
    if (Array.isArray(month)) month = month[0];
    month = typeof month === 'string' ? month.trim() : undefined;

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

    // Fetch holidays from database for this month
    const holidayDates = await getHolidayDatesForMonth(month);

    // Phase 3: Fetch approved leave dates for this user in this month
    const { getApprovedLeaveDates } = await import('../services/requestService.js');
    const leaveDates = await getApprovedLeaveDates(userId, month);

    const items = await attendanceService.getMonthlyHistory(userId, month, holidayDates, leaveDates);

    return res.status(200).json({
      items
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    // OWASP A09: Don't expose internal error details for 5xx errors
    const message = statusCode < 500
      ? (error.message || 'Failed to fetch attendance history')
      : 'Failed to fetch attendance history';
    return res.status(statusCode).json({ message });
  }
};

/**
 * GET /api/attendance/today?scope=team|company&teamId?
 * Get today's activity for Member Management.
 * 
 * RBAC:
 * - MANAGER: scope=team only (teamId ignored, uses token.user.teamId)
 * - ADMIN: scope=company (all users) OR scope=team (requires teamId)
 */
export const getTodayAttendance = async (req, res) => {
  try {
    const { role, teamId: userTeamId } = req.user;
    // Normalize query params (handle whitespace + array edge cases)
    let scope = req.query.scope;
    let teamId = req.query.teamId;
    if (Array.isArray(scope)) scope = scope[0];
    if (Array.isArray(teamId)) teamId = teamId[0];
    scope = typeof scope === 'string' ? scope.trim() : undefined;
    teamId = typeof teamId === 'string' ? teamId.trim() : undefined;

    // RBAC: Manager can only view team scope
    if (role === 'MANAGER') {
      scope = 'team'; // Force team scope for manager
      teamId = userTeamId; // Use manager's own team

      if (!teamId) {
        return res.status(403).json({
          message: 'Manager must be assigned to a team to view team activity'
        });
      }
    }
    // Admin validation
    else if (role === 'ADMIN') {
      // FIX #1: Scope invalid → 400 (not fallback to company)
      if (!scope) {
        scope = 'company'; // Default to company if not provided
      } else if (!['team', 'company'].includes(scope)) {
        return res.status(400).json({
          message: 'Invalid scope. Must be "team" or "company"'
        });
      }

      if (scope === 'team') {
        // FIX #2: Validate teamId is provided and is valid ObjectId
        if (!teamId) {
          return res.status(400).json({
            message: 'Admin must specify teamId for team scope'
          });
        }
        if (!mongoose.Types.ObjectId.isValid(teamId)) {
          return res.status(400).json({
            message: 'Invalid teamId format'
          });
        }
      } else {
        // Defense-in-depth: ensure teamId is not passed to service for company scope
        teamId = undefined;
      }
    }
    // Employee not allowed
    else {
      return res.status(403).json({
        message: 'Insufficient permissions. Manager or Admin required.'
      });
    }

    // Parse pagination params (v2.5)
    const { page, limit } = parsePaginationParams(req.query);

    // Fetch holidays for current month (GMT+7)
    const today = getTodayDateKey();
    const holidayDates = await getHolidayDatesForMonth(today.substring(0, 7));

    const result = await attendanceService.getTodayActivity(scope, teamId, holidayDates, { page, limit });

    return res.status(200).json(result);
  } catch (error) {
    // OWASP A05/A09: Verbose logging in dev, generic in prod
    if (process.env.NODE_ENV !== 'production') {
      console.error('Error fetching today activity:', error);
    } else {
      console.error('Error fetching today activity');
    }

    const statusCode = error.statusCode || 500;

    // FIX #4: 4xx returns message, 5xx returns generic (OWASP A09)
    const responseMessage = statusCode < 500
      ? (error.message || 'Request failed')
      : 'Internal server error';

    return res.status(statusCode).json({
      message: responseMessage
    });
  }
};

/**
 * GET /api/attendance/user/:id?month=YYYY-MM
 * Get monthly attendance history for a specific user (Member Management).
 * 
 * RBAC:
 * - MANAGER: can only access users in same team (Anti-IDOR, returns 403)
 * - ADMIN: can access any user
 * - EMPLOYEE: blocked (403)
 */
export const getAttendanceByUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { role, teamId: requestingUserTeamId } = req.user;
    // Normalize query param (handle whitespace + array edge cases)
    let month = req.query.month;
    if (Array.isArray(month)) month = month[0];
    month = typeof month === 'string' ? month.trim() : undefined;

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        message: 'Invalid user ID format'
      });
    }

    // Block Employee role
    if (role === 'EMPLOYEE') {
      return res.status(403).json({
        message: 'Insufficient permissions. Manager or Admin required.'
      });
    }

    // FIX C: Manager without teamId cannot access member management
    if (role === 'MANAGER' && !requestingUserTeamId) {
      return res.status(403).json({
        message: 'Manager must be assigned to a team'
      });
    }

    // Validate month format (default to current month if not provided)
    if (!month) {
      const today = getTodayDateKey();
      month = today.substring(0, 7); // Extract "YYYY-MM"
    } else if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({
        message: 'Invalid month format. Expected YYYY-MM (e.g., 2026-01)'
      });
    }

    // Query-level Anti-IDOR (cleaner pattern):
    // - MANAGER: query includes teamId to only verify same-team users
    // - ADMIN: can access any user
    let targetUser;

    if (role === 'MANAGER') {
      // Manager can only access users in same team (Anti-IDOR at query level)
      targetUser = await User.findOne({
        _id: id,
        teamId: requestingUserTeamId,
        deletedAt: null
      })
        .select('_id')
        .lean();

      // Not found OR different team => same 403 response (per RULES.md line 126)
      if (!targetUser) {
        return res.status(403).json({
          message: 'Access denied. You can only view users in your team.'
        });
      }
    } else {
      // Admin can access any user (but not soft-deleted)
      targetUser = await User.findOne({
        _id: id,
        deletedAt: null
      })
        .select('_id')
        .lean();

      // Not found
      if (!targetUser) {
        return res.status(404).json({
          message: 'User not found'
        });
      }
    }

    // Fetch holidays from database for this month
    const holidayDates = await getHolidayDatesForMonth(month);

    // Get monthly history using existing service
    const items = await attendanceService.getMonthlyHistory(id, month, holidayDates);

    return res.status(200).json({ items });
  } catch (error) {
    // OWASP A05/A09: Verbose logging in dev, generic in prod
    if (process.env.NODE_ENV !== 'production') {
      console.error('Error fetching user attendance history:', error);
    } else {
      console.error('Error fetching user attendance history');
    }

    const statusCode = error.statusCode || 500;

    // 4xx returns message, 5xx returns generic (OWASP A09)
    const responseMessage = statusCode < 500
      ? (error.message || 'Request failed')
      : 'Internal server error';

    return res.status(statusCode).json({
      message: responseMessage
    });
  }
};

