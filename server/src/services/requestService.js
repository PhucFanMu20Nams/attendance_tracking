import mongoose from 'mongoose';
import Request from '../models/Request.js';
import User from '../models/User.js';
import Attendance from '../models/Attendance.js';
import Holiday from '../models/Holiday.js';
import { getDateKey, getDateRange, countWorkdays, isWeekend } from '../utils/dateUtils.js';
import { getHolidayDatesForMonth } from '../utils/holidayUtils.js';

/**
 * Validate and parse a date value.
 * Throws 400 error if the value is present but cannot be parsed as a valid Date.
 * 
 * @param {*} value - Value to parse (string, Date, or null/undefined)
 * @param {string} fieldName - Field name for error message
 * @returns {Date|null} Parsed Date or null if value is falsy
 */
const toValidDate = (value, fieldName) => {
  if (!value) return null;

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    const error = new Error(`${fieldName} is invalid`);
    error.statusCode = 400;
    throw error;
  }
  return d;
};

/**
 * Create a new request for attendance adjustment.
 * Validates date format, ensures at least one time field, and checks time ordering.
 * 
 * @param {string} userId - User's ObjectId
 * @param {string} date - Date in "YYYY-MM-DD" format (GMT+7)
 * @param {Date|null} requestedCheckInAt - Requested check-in time (optional)
 * @param {Date|null} requestedCheckOutAt - Requested check-out time (optional)
 * @param {string} reason - Reason for the request
 * @returns {Promise<Object>} Created request
 */
export const createRequest = async (userId, date, requestedCheckInAt, requestedCheckOutAt, reason) => {
  // Validation 0: userId must be valid ObjectId (P1 defensive fix for consistency)
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    const error = new Error('Invalid userId');
    error.statusCode = 400;
    throw error;
  }

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const error = new Error('Invalid date format. Expected YYYY-MM-DD');
    error.statusCode = 400;
    throw error;
  }

  // Validate and parse time fields early (prevents Invalid Date bugs)
  const checkIn = toValidDate(requestedCheckInAt, 'requestedCheckInAt');
  const checkOut = toValidDate(requestedCheckOutAt, 'requestedCheckOutAt');

  if (!checkIn && !checkOut) {
    const error = new Error('At least one of requestedCheckInAt or requestedCheckOutAt is required');
    error.statusCode = 400;
    throw error;
  }

  if (!reason || reason.trim().length === 0) {
    const error = new Error('Reason is required');
    error.statusCode = 400;
    throw error;
  }

  // Security: Limit reason length to prevent DoS (1000 chars is enough for a detailed explanation)
  const MAX_REASON_LENGTH = 1000;
  if (reason.length > MAX_REASON_LENGTH) {
    const error = new Error(`Reason must be ${MAX_REASON_LENGTH} characters or less`);
    error.statusCode = 400;
    throw error;
  }

  // If both times provided, check-out must be after check-in
  if (checkIn && checkOut) {
    if (checkOut <= checkIn) {
      const error = new Error('requestedCheckOutAt must be after requestedCheckInAt');
      error.statusCode = 400;
      throw error;
    }
  }

  // MVP: No overnight shifts - timestamps must be on the same date as request.date
  if (checkIn) {
    const checkInDateKey = getDateKey(checkIn);
    if (checkInDateKey !== date) {
      const error = new Error('requestedCheckInAt must be on the same date as request date (GMT+7)');
      error.statusCode = 400;
      throw error;
    }
  }

  if (checkOut) {
    const checkOutDateKey = getDateKey(checkOut);
    if (checkOutDateKey !== date) {
      const error = new Error('requestedCheckOutAt must be on the same date as request date (GMT+7)');
      error.statusCode = 400;
      throw error;
    }
  }

  // Business rule: If attendance doesn't exist for this date, checkInAt is required
  // (because Attendance.checkInAt is a required field)
  // Also validate partial requests against existing attendance data
  const existingAttendance = await Attendance.findOne({ userId, date })
    .select('checkInAt checkOutAt')
    .lean();

  if (!checkIn && !existingAttendance) {
    const error = new Error('Cannot create new attendance without check-in time. Please include requestedCheckInAt');
    error.statusCode = 400;
    throw error;
  }

  // Validate checkOut-only: must be > existing checkInAt
  if (checkOut && !checkIn && existingAttendance) {
    const existingCheckIn = existingAttendance.checkInAt;
    if (existingCheckIn && checkOut <= new Date(existingCheckIn)) {
      const error = new Error('requestedCheckOutAt must be after existing check-in time');
      error.statusCode = 400;
      throw error;
    }
  }

  // Validate checkIn-only: must be < existing checkOutAt (if exists)
  if (checkIn && !checkOut && existingAttendance) {
    const existingCheckOut = existingAttendance.checkOutAt;
    if (existingCheckOut && checkIn >= new Date(existingCheckOut)) {
      const error = new Error('requestedCheckInAt must be before existing check-out time');
      error.statusCode = 400;
      throw error;
    }
  }

  // Prevent duplicate PENDING requests for the same date (Overlapping fix)
  const existingPendingRequest = await Request.findOne({
    userId,
    date,
    type: 'ADJUST_TIME',
    status: 'PENDING'
  }).select('_id');

  if (existingPendingRequest) {
    const error = new Error('You already have a pending request for this date. Please wait for approval or cancel the existing request.');
    error.statusCode = 409;
    throw error;
  }

  // Race condition guard: If concurrent requests pass the findOne check,
  // the partial unique index will reject the duplicate with E11000
  try {
    const request = await Request.create({
      userId,
      date,
      type: 'ADJUST_TIME',
      requestedCheckInAt: checkIn,
      requestedCheckOutAt: checkOut,
      reason: reason.trim(),
      status: 'PENDING'
    });

    return request;
  } catch (err) {
    // Catch MongoDB duplicate key error (E11000) from partial unique index
    if (err?.code === 11000) {
      const error = new Error('You already have a pending request for this date. Please wait for approval or cancel the existing request.');
      error.statusCode = 409;
      throw error;
    }
    throw err;
  }
};

/**
 * Get all requests for a specific user with pagination.
 * Returns only items - use countMyRequests for total count.
 * 
 * @param {string} userId - User's ObjectId
 * @param {Object} options - { skip, limit, status }
 * @returns {Promise<Array>} Array of request items
 */
export const getMyRequests = async (userId, options = {}) => {
  const { skip = 0, limit = 20, status } = options;

  // Build filter
  const filter = { userId };

  // Optional status filter (PENDING, APPROVED, REJECTED)
  if (status && ['PENDING', 'APPROVED', 'REJECTED'].includes(status.toUpperCase())) {
    filter.status = status.toUpperCase();
  }

  // Query items only (count is done separately by countMyRequests)
  const items = await Request.find(filter)
    .populate('approvedBy', 'name employeeCode')
    .sort({ createdAt: -1 })  // Newest first
    .skip(skip)
    .limit(limit)
    .lean();

  return items;
};

/**
 * Count requests for a user (without fetching items).
 * Used for pagination to get total count efficiently.
 * 
 * @param {string} userId - User's ObjectId
 * @param {Object} options - { status }
 * @returns {Promise<number>} Total count
 */
export const countMyRequests = async (userId, options = {}) => {
  const { status } = options;

  // Build filter
  const filter = { userId };

  // Optional status filter (PENDING, APPROVED, REJECTED)
  if (status && ['PENDING', 'APPROVED', 'REJECTED'].includes(status.toUpperCase())) {
    filter.status = status.toUpperCase();
  }

  return Request.countDocuments(filter);
};

/**
 * Build RBAC filter for pending requests.
 * Shared by both count and query functions.
 * 
 * @param {Object} user - Current user (req.user)
 * @returns {Promise<Object>} MongoDB query filter
 */
const buildPendingFilter = async (user) => {
  const filter = { status: 'PENDING' };

  // RBAC: Manager only sees team members' requests
  if (user.role === 'MANAGER') {
    if (!user.teamId) {
      const error = new Error('Manager must be assigned to a team');
      error.statusCode = 403;
      throw error;
    }

    // Find all users in the same team (exclude soft-deleted users)
    // PATCH: Use $or to handle legacy users without deletedAt field (pre-migration)
    const teamMembers = await User.find({
      teamId: user.teamId,
      $or: [
        { deletedAt: null },              // Migrated users (not deleted)
        { deletedAt: { $exists: false } }  // Legacy users (no field yet)
      ]
    }).select('_id');
    const teamMemberIds = teamMembers.map(member => member._id);

    filter.userId = { $in: teamMemberIds };
  }

  // ADMIN sees all pending requests (no additional filter)
  return filter;
};

/**
 * Count pending requests with RBAC scope enforcement.
 * Used for pagination total count.
 * 
 * @param {Object} user - Current user (req.user)
 * @returns {Promise<number>} Total count
 */
export const countPendingRequests = async (user) => {
  const filter = await buildPendingFilter(user);
  return Request.countDocuments(filter);
};

/**
 * Get pending requests with RBAC scope enforcement and pagination.
 * MANAGER: Only requests from users in the same team
 * ADMIN: All pending requests company-wide
 * 
 * @param {Object} user - Current user (req.user)
 * @param {Object} options - { skip, limit }
 * @returns {Promise<Array>} Array of pending requests
 */
export const getPendingRequests = async (user, options = {}) => {
  const { skip = 0, limit = 20 } = options;

  const filter = await buildPendingFilter(user);

  const requests = await Request.find(filter)
    .populate('userId', 'name employeeCode email teamId')
    .sort({ createdAt: 1 })  // Oldest first for approval queue
    .skip(skip)
    .limit(limit)
    .lean();

  return requests;
};

/**
 * Approve a request and update/create attendance record.
 * Uses atomic findOneAndUpdate to prevent race conditions.
 * RBAC: MANAGER can only approve requests from users in the same team.
 *       ADMIN can approve any request across the company.
 * 
 * @param {string} requestId - Request's ObjectId
 * @param {Object} approver - Approver user object (req.user)
 * @returns {Promise<Object>} Updated request
 */
export const approveRequest = async (requestId, approver) => {
  if (!mongoose.Types.ObjectId.isValid(requestId)) {
    const error = new Error('Invalid request ID');
    error.statusCode = 400;
    throw error;
  }

  // First, fetch the request to validate RBAC and business rules
  const existingRequest = await Request.findById(requestId)
    .populate('userId', 'teamId');

  if (!existingRequest) {
    const error = new Error('Request not found');
    error.statusCode = 404;
    throw error;
  }

  // RBAC check must happen BEFORE the atomic update
  if (approver.role === 'MANAGER') {
    if (!approver.teamId) {
      const error = new Error('Manager must be assigned to a team');
      error.statusCode = 403;
      throw error;
    }

    if (!existingRequest.userId.teamId) {
      const error = new Error('Request user is not assigned to any team');
      error.statusCode = 403;
      throw error;
    }

    if (!approver.teamId.equals(existingRequest.userId.teamId)) {
      const error = new Error('You can only approve requests from your team');
      error.statusCode = 403;
      throw error;
    }
  }

  // P0 Fix: Only validate timestamps for ADJUST_TIME requests (LEAVE has date=null)
  if (existingRequest.type === 'ADJUST_TIME') {
    // MVP: Validate timestamps are on request.date (defense-in-depth)
    if (existingRequest.requestedCheckInAt) {
      const checkInDateKey = getDateKey(new Date(existingRequest.requestedCheckInAt));
      if (checkInDateKey !== existingRequest.date) {
        const error = new Error('requestedCheckInAt must be on the same date as request date (GMT+7)');
        error.statusCode = 400;
        throw error;
      }
    }

    if (existingRequest.requestedCheckOutAt) {
      const checkOutDateKey = getDateKey(new Date(existingRequest.requestedCheckOutAt));
      if (checkOutDateKey !== existingRequest.date) {
        const error = new Error('requestedCheckOutAt must be on the same date as request date (GMT+7)');
        error.statusCode = 400;
        throw error;
      }
    }
  }

  // Atomic update: Only succeeds if status is still PENDING (prevents race condition)
  const updatedRequest = await Request.findOneAndUpdate(
    {
      _id: requestId,
      status: 'PENDING'  // Condition: must be PENDING to update
    },
    {
      $set: {
        status: 'APPROVED',
        approvedBy: approver._id,
        approvedAt: new Date()
      }
    },
    { new: true }
  ).populate('userId', 'teamId');

  // If no document was updated, it means status was not PENDING (race condition lost)
  if (!updatedRequest) {
    // Re-fetch to get current status for better error message
    const currentRequest = await Request.findById(requestId);
    const currentStatus = currentRequest ? currentRequest.status.toLowerCase() : 'unknown';
    const error = new Error(`Request already ${currentStatus}`);
    error.statusCode = 409;
    throw error;
  }

  // Update or create attendance ONLY for ADJUST_TIME requests
  // LEAVE requests don't create attendance records
  if (updatedRequest.type === 'ADJUST_TIME') {
    // Validate: Block approve for weekend/holiday (defense-in-depth)
    const requestDate = updatedRequest.date;
    const month = requestDate.substring(0, 7);
    const holidayDates = await getHolidayDatesForMonth(month);
    
    if (isWeekend(requestDate) || holidayDates.has(requestDate)) {
      const error = new Error('Cannot approve time adjustment request for weekend/holiday');
      error.statusCode = 400;
      throw error;
    }
    
    await updateAttendanceFromRequest(updatedRequest);
  }

  return updatedRequest;
};

/**
 * Reject a request.
 * Uses atomic findOneAndUpdate to prevent race conditions.
 * RBAC: MANAGER can only reject requests from users in the same team.
 *       ADMIN can reject any request across the company.
 * 
 * @param {string} requestId - Request's ObjectId
 * @param {Object} approver - Approver user object (req.user)
 * @returns {Promise<Object>} Updated request
 */
export const rejectRequest = async (requestId, approver) => {
  if (!mongoose.Types.ObjectId.isValid(requestId)) {
    const error = new Error('Invalid request ID');
    error.statusCode = 400;
    throw error;
  }

  // First, fetch the request to validate RBAC
  const existingRequest = await Request.findById(requestId)
    .populate('userId', 'teamId');

  if (!existingRequest) {
    const error = new Error('Request not found');
    error.statusCode = 404;
    throw error;
  }

  // RBAC check must happen BEFORE the atomic update
  if (approver.role === 'MANAGER') {
    if (!approver.teamId) {
      const error = new Error('Manager must be assigned to a team');
      error.statusCode = 403;
      throw error;
    }

    if (!existingRequest.userId.teamId) {
      const error = new Error('Request user is not assigned to any team');
      error.statusCode = 403;
      throw error;
    }

    if (!approver.teamId.equals(existingRequest.userId.teamId)) {
      const error = new Error('You can only reject requests from your team');
      error.statusCode = 403;
      throw error;
    }
  }

  // Atomic update: Only succeeds if status is still PENDING (prevents race condition)
  const updatedRequest = await Request.findOneAndUpdate(
    {
      _id: requestId,
      status: 'PENDING'  // Condition: must be PENDING to update
    },
    {
      $set: {
        status: 'REJECTED',
        approvedBy: approver._id,
        approvedAt: new Date()
      }
    },
    { new: true }
  ).populate('userId', 'name employeeCode email teamId');

  // If no document was updated, it means status was not PENDING (race condition lost)
  if (!updatedRequest) {
    // Re-fetch to get current status for better error message
    const currentRequest = await Request.findById(requestId);
    const currentStatus = currentRequest ? currentRequest.status.toLowerCase() : 'unknown';
    const error = new Error(`Request already ${currentStatus}`);
    error.statusCode = 409;
    throw error;
  }

  return updatedRequest;
};

/**
 * Update or create attendance record based on approved request.
 * Uses findOneAndUpdate with upsert to handle both create and update atomically.
 * Only updates the time fields that were requested.
 */
async function updateAttendanceFromRequest(request) {
  const { userId, date, requestedCheckInAt, requestedCheckOutAt } = request;

  const updateFields = {};

  if (requestedCheckInAt) {
    updateFields.checkInAt = requestedCheckInAt;
  }

  if (requestedCheckOutAt) {
    updateFields.checkOutAt = requestedCheckOutAt;
  }

  // Defensive check: cannot create new attendance without checkInAt
  // (validation in createRequest should prevent this, but guard here for safety)
  const exists = await Attendance.exists({ userId, date });

  if (!exists && !requestedCheckInAt) {
    const error = new Error('Cannot create attendance without check-in time');
    error.statusCode = 400;
    throw error;
  }

  // Atomic upsert: create if not exists, update if exists
  await Attendance.findOneAndUpdate(
    { userId, date },
    {
      $set: updateFields,
      $setOnInsert: {
        userId,
        date
      }
    },
    { upsert: true, new: true }
  );
}
/**
 * Create a LEAVE request.
 * Validates:
 * - leaveStartDate <= leaveEndDate
 * - Max range: 30 days
 * - No attendance exists for ANY date in range
 * - No overlap with existing APPROVED or PENDING leave
 * 
 * Known Limitation (MVP): Small race condition window between findOne() and create().
 * Two concurrent LEAVE requests could both pass overlap check and create overlapping leaves.
 * Probability is very low; acceptable for MVP. Cannot use unique index for range overlap.
 * 
 * @param {string} userId - User's ObjectId
 * @param {string} leaveStartDate - "YYYY-MM-DD"
 * @param {string} leaveEndDate - "YYYY-MM-DD"
 * @param {string|null} leaveType - "ANNUAL" | "SICK" | "UNPAID" | null
 * @param {string} reason - Reason for leave
 * @returns {Promise<Object>} Created request with leaveDaysCount
 */
export const createLeaveRequest = async (userId, leaveStartDate, leaveEndDate, leaveType, reason) => {
  // Validation 0: userId must be valid ObjectId (P1 defensive fix)
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    const error = new Error('Invalid userId');
    error.statusCode = 400;
    throw error;
  }

  // Validation 1: Date format
  if (!leaveStartDate || !/^\d{4}-\d{2}-\d{2}$/.test(leaveStartDate)) {
    const error = new Error('Invalid leaveStartDate format. Expected YYYY-MM-DD');
    error.statusCode = 400;
    throw error;
  }

  if (!leaveEndDate || !/^\d{4}-\d{2}-\d{2}$/.test(leaveEndDate)) {
    const error = new Error('Invalid leaveEndDate format. Expected YYYY-MM-DD');
    error.statusCode = 400;
    throw error;
  }

  // Validation 2: startDate <= endDate
  if (leaveStartDate > leaveEndDate) {
    const error = new Error('leaveStartDate must be before or equal to leaveEndDate');
    error.statusCode = 400;
    throw error;
  }

  // Validation 3: Max range 30 days
  const allDates = getDateRange(leaveStartDate, leaveEndDate);
  if (allDates.length > 30) {
    const error = new Error('Leave range cannot exceed 30 days');
    error.statusCode = 400;
    throw error;
  }

  // Validation 4: Reason required and length limit
  if (!reason || reason.trim().length === 0) {
    const error = new Error('Reason is required');
    error.statusCode = 400;
    throw error;
  }

  const MAX_REASON_LENGTH = 1000;
  if (reason.length > MAX_REASON_LENGTH) {
    const error = new Error(`Reason must be ${MAX_REASON_LENGTH} characters or less`);
    error.statusCode = 400;
    throw error;
  }

  // Validation 5: leaveType must be valid enum or null
  if (leaveType && !['ANNUAL', 'SICK', 'UNPAID'].includes(leaveType)) {
    const error = new Error('leaveType must be ANNUAL, SICK, or UNPAID');
    error.statusCode = 400;
    throw error;
  }

  // Validation 6: Check no attendance exists for any date in range
  const existingAttendance = await Attendance.findOne({
    userId,
    date: { $in: allDates }
  }).select('date').lean();

  if (existingAttendance) {
    const error = new Error(`Already checked in for ${existingAttendance.date}. Cannot request leave for dates with attendance. Use ADJUST_TIME instead.`);
    error.statusCode = 400;
    throw error;
  }

  // Validation 7: Check no overlap with existing APPROVED or PENDING leave
  // P0 Fix: Simplified overlap check covers all cases (including "new contains existing")
  // Overlap when: existingStart <= newEnd AND existingEnd >= newStart
  const existingLeave = await Request.findOne({
    userId,
    type: 'LEAVE',
    status: { $in: ['APPROVED', 'PENDING'] },
    leaveStartDate: { $lte: leaveEndDate },      // Existing starts before/on new end
    leaveEndDate: { $gte: leaveStartDate }       // Existing ends after/on new start
  }).select('leaveStartDate leaveEndDate status').lean();

  if (existingLeave) {
    const statusText = existingLeave.status === 'APPROVED' ? 'approved' : 'pending';
    const error = new Error(`Leave overlaps with existing ${statusText} leave (${existingLeave.leaveStartDate} to ${existingLeave.leaveEndDate})`);
    error.statusCode = 409;
    throw error;
  }

  // Calculate workdays (exclude weekends + holidays)
  // P1 Fix: Query holidays for exact date range (optimized from full-year query)
  const holidays = await Holiday.find({
    date: { $gte: leaveStartDate, $lte: leaveEndDate }
  }).select('date -_id').lean();

  const holidayDates = new Set(holidays.map(h => h.date));
  const leaveDaysCount = countWorkdays(leaveStartDate, leaveEndDate, holidayDates);

  // Create request
  try {
    const request = await Request.create({
      userId,
      type: 'LEAVE',
      date: null, // LEAVE doesn't use date field
      leaveStartDate,
      leaveEndDate,
      leaveType: leaveType || null,
      leaveDaysCount,
      reason: reason.trim(),
      status: 'PENDING'
    });

    return request;
  } catch (err) {
    // Handle any MongoDB errors
    throw err;
  }
};

/**
 * Get all approved leave dates for a user in a month.
 * Used by controllers to pass leaveDates to computeAttendance.
 * 
 * @param {string} userId - User's ObjectId
 * @param {string} monthStr - "YYYY-MM"
 * @returns {Promise<Set<string>>} Set of "YYYY-MM-DD" dates
 */
export const getApprovedLeaveDates = async (userId, monthStr) => {
  if (!monthStr || !/^\d{4}-\d{2}$/.test(monthStr)) {
    return new Set(); // Return empty set for invalid month (defensive)
  }

  // Calculate month boundaries
  const [year, month] = monthStr.split('-').map(Number);
  const monthStart = `${monthStr}-01`;

  // Calculate next month start (handles year boundary)
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextMonthStart = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

  // Query APPROVED LEAVE requests that overlap with this month
  const leaveRequests = await Request.find({
    userId,
    type: 'LEAVE',
    status: 'APPROVED',
    $or: [
      // Leave starts within month
      { leaveStartDate: { $gte: monthStart, $lt: nextMonthStart } },
      // Leave ends within month
      { leaveEndDate: { $gte: monthStart, $lt: nextMonthStart } },
      // Leave spans entire month
      { leaveStartDate: { $lt: monthStart }, leaveEndDate: { $gte: nextMonthStart } }
    ]
  }).select('leaveStartDate leaveEndDate').lean();

  // Expand ranges to individual dates and filter to month
  const leaveDates = new Set();

  for (const leave of leaveRequests) {
    const allDates = getDateRange(leave.leaveStartDate, leave.leaveEndDate);

    for (const dateKey of allDates) {
      // Only include dates within the requested month
      if (dateKey >= monthStart && dateKey < nextMonthStart) {
        leaveDates.add(dateKey);
      }
    }
  }

  return leaveDates;
};
