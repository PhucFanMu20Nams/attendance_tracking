import mongoose from 'mongoose';
import Request from '../models/Request.js';
import User from '../models/User.js';
import Attendance from '../models/Attendance.js';
import Holiday from '../models/Holiday.js';
import { getDateKey, getDateRange, countWorkdays, isWeekend } from '../utils/dateUtils.js';
import { getHolidayDatesForMonth } from '../utils/holidayUtils.js';
import {
  getCheckoutGraceMs, getCheckoutGraceHours,
  getAdjustRequestMaxMs, getAdjustRequestMaxDays
} from '../utils/graceConfig.js';

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
 * Assert that a value includes timezone information if it's a string.
 * Prevents timezone ambiguity for string inputs while allowing Date objects.
 * 
 * Bug #1 Fix: Only validates strings - Date objects are already timezone-aware.
 * 
 * @param {*} value - Value to check (string, Date, or null/undefined)
 * @param {string} fieldName - Field name for error message
 * @throws {Error} 400 if value is a string without timezone
 */
const assertHasTzIfString = (value, fieldName) => {
  if (!value) return;

  // Only validate string inputs (Date objects are already timezone-aware)
  if (typeof value === 'string') {
    const trimmed = value.trim();
    // Accept ISO 8601: +07:00, +0700, Z
    if (!/(Z|[+-]\d{2}:?\d{2})$/.test(trimmed)) {
      const error = new Error(
        `${fieldName} must include timezone (e.g., +07:00 or Z)`
      );
      error.statusCode = 400;
      throw error;
    }
  }
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

  // Validate reason (trim to prevent whitespace padding)
  // Bug #1 Fix: Use nullish coalescing to prevent TypeError if reason is null/undefined
  const trimmedReason = (reason ?? '').trim();

  if (!trimmedReason) {
    const error = new Error('Reason is required');
    error.statusCode = 400;
    throw error;
  }

  // Security: Limit reason length to prevent DoS (1000 chars is enough for a detailed explanation)
  // Issue #7 Fix: Check trimmed length for consistency
  const MAX_REASON_LENGTH = 1000;
  if (trimmedReason.length > MAX_REASON_LENGTH) {
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

  // Cross-midnight OT: Validate checkIn is on request.date
  if (checkIn) {
    // Bug #1 Fix: Validate timezone BEFORE parsing to provide clear error message
    assertHasTzIfString(requestedCheckInAt, 'requestedCheckInAt');

    const checkInDateKey = getDateKey(checkIn);
    if (checkInDateKey !== date) {
      const error = new Error('requestedCheckInAt must be on the same date as request date (GMT+7)');
      error.statusCode = 400;
      throw error;
    }
  }

  // Business rule: If attendance doesn't exist for this date, checkInAt is required
  // (because Attendance.checkInAt is a required field)
  // Also validate partial requests against existing attendance data
  // NOTE: Fetch BEFORE 2-rule validation to access checkInAt for anchor time
  const existingAttendance = await Attendance.findOne({ userId, date })
    .select('checkInAt checkOutAt')
    .lean();

  // Issue #5: Block weekend/holiday requests early for better UX
  // (Same validation as approveRequest, but fail-fast at creation)
  const month = date.substring(0, 7);
  const holidayDates = await getHolidayDatesForMonth(month);
  if (isWeekend(date) || holidayDates.has(date)) {
    const error = new Error('Cannot create time adjustment request for weekend or holiday');
    error.statusCode = 400;
    throw error;
  }

  // Load grace config for 2-rule validation
  const sessionGraceMs = getCheckoutGraceMs();
  const sessionGraceHours = getCheckoutGraceHours();
  const submitMaxMs = getAdjustRequestMaxMs();
  const submitMaxDays = getAdjustRequestMaxDays();

  // Determine anchor time for BOTH rules (checkIn reference point)
  // Bug #2 Fix: Extract anchor outside checkOut block to validate ALL requests
  let anchorTime = null;
  if (checkIn) {
    anchorTime = checkIn;
  } else if (existingAttendance?.checkInAt) {
    anchorTime = new Date(existingAttendance.checkInAt);
  }

  // Rule 2: Submission window (applies to ALL requests with anchor)
  // Bug #2 Fix: Moved outside checkOut block - now validates checkIn-only requests too
  if (anchorTime) {
    const timeSinceCheckIn = Date.now() - anchorTime;
    if (timeSinceCheckIn > submitMaxMs) {
      const error = new Error(
        `Cannot submit request >${submitMaxDays} days after check-in`
      );
      error.statusCode = 400;
      throw error;
    }
  }

  // Rule 1: Session length validation (only applies when checkOut exists)
  if (checkOut) {
    // Bug #1 Fix: Use helper to validate timezone only for string inputs
    assertHasTzIfString(requestedCheckOutAt, 'requestedCheckOutAt');

    // Issue #3: Block future checkout (tolerance: 1 minute for clock skew)
    // EXCEPT for cross-midnight sessions (validated by session length instead)
    const now = Date.now();
    const tolerance = 60 * 1000; // 1 minute
    
    // Detect cross-midnight: checkout date > checkin date
    const isCrossMidnight = anchorTime && getDateKey(checkOut) > getDateKey(anchorTime);
    
    if (!isCrossMidnight && checkOut.getTime() > now + tolerance) {
      const error = new Error('requestedCheckOutAt cannot be in the future');
      error.statusCode = 400;
      throw error;
    }

    // Require anchor for checkout validation
    if (!anchorTime) {
      const error = new Error('Cannot validate checkout without check-in reference');
      error.statusCode = 400;
      throw error;
    }

    // Rule 1: Session length validation
    const sessionLength = checkOut - anchorTime;
    if (sessionLength > sessionGraceMs) {
      const error = new Error(
        `Session length exceeds ${sessionGraceHours}h limit`
      );
      error.statusCode = 400;
      throw error;
    }

    // checkOut must be after checkIn (basic sanity check)
    if (checkOut <= anchorTime) {
      const error = new Error('requestedCheckOutAt must be after check-in');
      error.statusCode = 400;
      throw error;
    }
  }

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

  // P0 Fix: Compute dates with correct semantics for cross-midnight support
  const computedCheckInDate = date; // date = anchor check-in date
  const computedCheckOutDate = checkOut ? getDateKey(checkOut) : null;

  // P0 Fix: Validate cross-midnight ordering (checkOut cannot be before checkIn date)
  if (computedCheckOutDate && computedCheckOutDate < computedCheckInDate) {
    const error = new Error('requestedCheckOutAt must be on or after check-in date (GMT+7)');
    error.statusCode = 400;
    throw error;
  }

  // Prevent duplicate PENDING requests (P2 Fix: use checkInDate to match unique index)
  const existingPendingRequest = await Request.findOne({
    userId,
    checkInDate: computedCheckInDate,
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
      date: computedCheckInDate,  // Backward compat
      checkInDate: computedCheckInDate,  // P0 Fix: Explicit for unique index + invariant
      checkOutDate: computedCheckOutDate, // P0 Fix: Computed from requestedCheckOutAt (null or D+1)
      type: 'ADJUST_TIME',
      requestedCheckInAt: checkIn,
      requestedCheckOutAt: checkOut,
      reason: trimmedReason,
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
    .sort({ createdAt: -1 })  // Newest first (consistent with employee view)
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

  // Step 6: Revalidate ADJUST_TIME requests with 2-rule validation (defense-in-depth)
  // Cross-midnight OT: Replace cross-day validation with anchor-based validation
  if (existingRequest.type === 'ADJUST_TIME') {
    // Validate checkIn is on request.date (cross-midnight: only checkIn must match date)
    if (existingRequest.requestedCheckInAt) {
      const checkInDateKey = getDateKey(new Date(existingRequest.requestedCheckInAt));
      if (checkInDateKey !== existingRequest.date) {
        const error = new Error('requestedCheckInAt must be on the same date as request date (GMT+7)');
        error.statusCode = 400;
        throw error;
      }
    }

    // Bug #3 Fix: Validate cross-midnight OT with 2-rule validation (defense-in-depth)
    // Extract anchor determination to apply Rule 2 for ALL requests (checkIn-only + checkOut-only)

    // Load grace config
    const sessionGraceMs = getCheckoutGraceMs();
    const sessionGraceHours = getCheckoutGraceHours();
    const submitMaxMs = getAdjustRequestMaxMs();
    const submitMaxDays = getAdjustRequestMaxDays();

    // Determine anchor time (needed for both Rule 1 and Rule 2)
    let anchorTime = null;
    if (existingRequest.requestedCheckInAt) {
      anchorTime = new Date(existingRequest.requestedCheckInAt);
    } else {
      // Fetch existing attendance to get checkIn
      // Critical: Use _id explicitly - userId is populated User object
      const att = await Attendance.findOne({
        userId: existingRequest.userId._id,
        date: existingRequest.date
      }).select('checkInAt').lean();
      anchorTime = att?.checkInAt ? new Date(att.checkInAt) : null;
    }

    // Bug #2 Fix: Require anchor for ALL ADJUST_TIME requests (defense-in-depth)
    // Prevents approving corrupt requests (missing checkIn in both request and attendance)
    if (!anchorTime) {
      const error = new Error('Cannot approve: missing check-in reference');
      error.statusCode = 400;
      throw error;
    }

    // Rule 2: Submission window validation (applies to ALL requests)
    // Now runs unconditionally since anchorTime is guaranteed to exist
    const requestCreated = new Date(existingRequest.createdAt);
    const submissionDelay = requestCreated - anchorTime;
    if (submissionDelay > submitMaxMs) {
      const error = new Error(
        `Request invalid: submitted >${submitMaxDays}d after check-in`
      );
      error.statusCode = 400;
      throw error;
    }

    // Rule 1: Session length validation (only for checkOut requests)
    if (existingRequest.requestedCheckOutAt) {
      const checkOut = new Date(existingRequest.requestedCheckOutAt);

      // Session length validation
      const sessionLength = checkOut - anchorTime;
      if (sessionLength > sessionGraceMs) {
        const error = new Error(
          `Request invalid: session exceeds ${sessionGraceHours}h limit`
        );
        error.statusCode = 400;
        throw error;
      }

      // Basic sanity: checkOut must be after checkIn
      if (checkOut <= anchorTime) {
        const error = new Error('Request invalid: checkOut must be after check-in');
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

  // P1 Fix: Extract ObjectId safely (handle both populated and non-populated userId)
  const userObjectId = userId?._id ?? userId;

  const updateFields = {};

  if (requestedCheckInAt) {
    updateFields.checkInAt = requestedCheckInAt;
  }

  if (requestedCheckOutAt) {
    updateFields.checkOutAt = requestedCheckOutAt;
  }

  // Defensive check: cannot create new attendance without checkInAt
  // (validation in createRequest should prevent this, but guard here for safety)
  const exists = await Attendance.exists({ userId: userObjectId, date });

  if (!exists && !requestedCheckInAt) {
    const error = new Error('Cannot create attendance without check-in time');
    error.statusCode = 400;
    throw error;
  }

  // Atomic upsert: create if not exists, update if exists
  await Attendance.findOneAndUpdate(
    { userId: userObjectId, date },
    {
      $set: updateFields,
      $setOnInsert: {
        userId: userObjectId,
        date
      }
    },
    { upsert: true, new: true, runValidators: true }  // P0 Fix: Add runValidators for defense-in-depth
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
  // Bug #1 Fix: Use nullish coalescing + trim for consistency
  const trimmedReason = (reason ?? '').trim();

  if (!trimmedReason) {
    const error = new Error('Reason is required');
    error.statusCode = 400;
    throw error;
  }

  const MAX_REASON_LENGTH = 1000;
  if (trimmedReason.length > MAX_REASON_LENGTH) {
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
      reason: trimmedReason,
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
