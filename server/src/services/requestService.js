import mongoose from 'mongoose';
import Request from '../models/Request.js';
import User from '../models/User.js';
import Attendance from '../models/Attendance.js';
import Holiday from '../models/Holiday.js';
import { getDateKey, getDateRange, countWorkdays, isWeekend, getTodayDateKey, isInOtPeriod, getOtDuration } from '../utils/dateUtils.js';
import { getHolidayDatesForMonth } from '../utils/holidayUtils.js';
import {
  getCheckoutGraceMs, getCheckoutGraceHours,
  getAdjustRequestMaxMs, getAdjustRequestMaxDays
} from '../utils/graceConfig.js';
import { 
  isReplicaSetAvailable, 
  getTransactionOptions 
} from '../config/database.js';

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
export const createAdjustTimeRequest = async (userId, date, requestedCheckInAt, requestedCheckOutAt, reason) => {
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

    // P0-2 Fix: Validate checkIn not in future (tolerance: 1 minute for clock skew)
    const now = Date.now();
    const tolerance = 60 * 1000; // 1 minute
    if (checkIn.getTime() > now + tolerance) {
      const error = new Error('requestedCheckInAt cannot be in the future');
      error.statusCode = 400;
      throw error;
    }

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
  // P1-2 Fix: Add $or to support legacy data (date vs checkInDate field)
  const existingPendingRequest = await Request.findOne({
    userId,
    type: 'ADJUST_TIME',
    status: 'PENDING',
    $or: [
      { checkInDate: computedCheckInDate },
      { date: computedCheckInDate }  // Legacy support
    ]
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
 * Router function: Create request of any type
 * Delegates to type-specific handlers based on requestData.type
 * 
 * @param {string} userId - User's ObjectId
 * @param {Object} requestData - Request data with type field
 * @returns {Promise<Object>} Created request
 */
export const createRequest = async (userId, requestData) => {
  const { type } = requestData;
  
  // Route to specific handler based on type
  if (type === 'OT_REQUEST') {
    return await createOtRequest(userId, requestData);
  }
  
  if (type === 'LEAVE') {
    // Extract LEAVE-specific fields
    const { leaveStartDate, leaveEndDate, leaveType, reason } = requestData;
    return await createLeaveRequest(userId, leaveStartDate, leaveEndDate, leaveType, reason);
  }
  
  // Default: ADJUST_TIME
  const { date, requestedCheckInAt, requestedCheckOutAt, reason } = requestData;
  return await createAdjustTimeRequest(userId, date, requestedCheckInAt, requestedCheckOutAt, reason);
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
 * Core approval logic (extracted for transaction/non-transaction paths)
 * 
 * This function contains the business logic for approving a request.
 * It is transaction-agnostic and can be called with or without a session.
 * 
 * @param {string} requestId - Request's ObjectId
 * @param {Object} approver - Approver user object (req.user)
 * @param {Object|null} session - MongoDB session for transaction (null for standalone)
 * @returns {Promise<Object>} Updated request
 */
async function approveRequestCore(requestId, approver, session) {
  // STEP 1: Fetch request (with or without session)
  const query = Request.findById(requestId).populate('userId', 'teamId');
  const existingRequest = session ? await query.session(session) : await query;

  if (!existingRequest) {
    const error = new Error('Request not found');
    error.statusCode = 404;
    throw error;
  }

  // STEP 2: RBAC check (before atomic update)
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

  // STEP 3: Revalidate ADJUST_TIME requests (defense-in-depth)
  if (existingRequest.type === 'ADJUST_TIME') {
    // Validate checkIn is on request.date
    if (existingRequest.requestedCheckInAt) {
      const checkInDateKey = getDateKey(new Date(existingRequest.requestedCheckInAt));
      if (checkInDateKey !== existingRequest.date) {
        const error = new Error('requestedCheckInAt must be on the same date as request date (GMT+7)');
        error.statusCode = 400;
        throw error;
      }
    }

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
      // Fetch attendance (with or without session)
      // P1-3 Fix: Only match if checkInAt exists and not null
      const attQuery = Attendance.findOne({
        userId: existingRequest.userId._id,
        date: existingRequest.date,
        checkInAt: { $exists: true, $ne: null }
      }).select('checkInAt').lean();
      
      const att = session ? await attQuery.session(session) : await attQuery;
      anchorTime = att?.checkInAt ? new Date(att.checkInAt) : null;
    }

    // Require anchor for ALL ADJUST_TIME requests (defense-in-depth)
    if (!anchorTime) {
      const error = new Error('Cannot approve: missing check-in reference');
      error.statusCode = 400;
      throw error;
    }

    // Rule 2: Submission window validation
    const requestCreated = new Date(existingRequest.createdAt);
    const submissionDelay = requestCreated - anchorTime;
    if (submissionDelay > submitMaxMs) {
      const error = new Error(
        `Request invalid: submitted >${submitMaxDays}d after check-in`
      );
      error.statusCode = 400;
      throw error;
    }

    // Rule 1: Session length (checkOut only)
    if (existingRequest.requestedCheckOutAt) {
      const checkOut = new Date(existingRequest.requestedCheckOutAt);
      const sessionLength = checkOut - anchorTime;
      
      if (sessionLength > sessionGraceMs) {
        const error = new Error(
          `Request invalid: session exceeds ${sessionGraceHours}h limit`
        );
        error.statusCode = 400;
        throw error;
      }

      if (checkOut <= anchorTime) {
        const error = new Error('Request invalid: checkOut must be after check-in');
        error.statusCode = 400;
        throw error;
      }
    }
  }

  // STEP 4: Atomic update Request status
  const updateQuery = Request.findOneAndUpdate(
    {
      _id: requestId,
      status: 'PENDING'
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

  const updatedRequest = session ? await updateQuery.session(session) : await updateQuery;

  // Race condition check (status already changed)
  if (!updatedRequest) {
    const checkQuery = Request.findById(requestId);
    const currentRequest = session ? await checkQuery.session(session) : await checkQuery;
    const currentStatus = currentRequest ? currentRequest.status.toLowerCase() : 'unknown';
    const error = new Error(`Request already ${currentStatus}`);
    error.statusCode = 409;
    throw error;
  }

  // STEP 5: Type-specific post-approval updates
  
  // OT_REQUEST: Set otApproved flag
  if (updatedRequest.type === 'OT_REQUEST') {
    const otQuery = Attendance.findOneAndUpdate(
      { 
        userId: updatedRequest.userId._id,
        date: updatedRequest.date 
      },
      { 
        $set: { otApproved: true } 
      },
      { upsert: false }
    );
    
    if (session) {
      await otQuery.session(session);
    } else {
      await otQuery;
    }
  }
  
  // ADJUST_TIME: Update/create attendance
  if (updatedRequest.type === 'ADJUST_TIME') {
    const requestDate = updatedRequest.date;
    const month = requestDate.substring(0, 7);
    const holidayDates = await getHolidayDatesForMonth(month);

    if (isWeekend(requestDate) || holidayDates.has(requestDate)) {
      const error = new Error('Cannot approve time adjustment request for weekend/holiday');
      error.statusCode = 400;
      throw error;
    }

    // Call refactored function with session
    await updateAttendanceFromRequest(updatedRequest, session);
  }

  return updatedRequest;
}

/**
 * Approve a request (transaction-safe wrapper)
 * P0-1 Fix: Support both replica set (with transactions) and standalone MongoDB.
 * 
 * RBAC: MANAGER can only approve requests from users in the same team.
 *       ADMIN can approve any request across the company.
 * 
 * @param {string} requestId - Request's ObjectId
 * @param {Object} approver - Approver user object (req.user)
 * @returns {Promise<Object>} Updated request
 */
export const approveRequest = async (requestId, approver) => {
  // Validate request ID format
  if (!mongoose.Types.ObjectId.isValid(requestId)) {
    const error = new Error('Invalid request ID');
    error.statusCode = 400;
    throw error;
  }

  // PATH A: Replica Set → Use transaction for atomicity
  if (isReplicaSetAvailable()) {
    const session = await mongoose.startSession();
    try {
      const result = await session.withTransaction(async () => {
        return await approveRequestCore(requestId, approver, session);
      }, getTransactionOptions());
      return result;
    } finally {
      await session.endSession();
    }
  }
  
  // PATH B: Standalone → Direct execution (no transaction)
  else {
    return await approveRequestCore(requestId, approver, null);
  }
};

/**
 * Core rejection logic (extracted for transaction/non-transaction paths)
 * 
 * This function contains the business logic for rejecting a request.
 * It is transaction-agnostic and can be called with or without a session.
 * 
 * @param {string} requestId - Request's ObjectId
 * @param {Object} rejector - Rejector user object (req.user)
 * @param {Object|null} session - MongoDB session for transaction (null for standalone)
 * @returns {Promise<Object>} Updated request
 */
async function rejectRequestCore(requestId, rejector, session) {
  // STEP 1: Fetch request (with or without session)
  const query = Request.findById(requestId).populate('userId', 'teamId');
  const existingRequest = session ? await query.session(session) : await query;

  if (!existingRequest) {
    const error = new Error('Request not found');
    error.statusCode = 404;
    throw error;
  }

  // STEP 2: RBAC check
  if (rejector.role === 'MANAGER') {
    if (!rejector.teamId) {
      const error = new Error('Manager must be assigned to a team');
      error.statusCode = 403;
      throw error;
    }

    if (!existingRequest.userId.teamId) {
      const error = new Error('Request user is not assigned to any team');
      error.statusCode = 403;
      throw error;
    }

    if (!rejector.teamId.equals(existingRequest.userId.teamId)) {
      const error = new Error('You can only reject requests from your team');
      error.statusCode = 403;
      throw error;
    }
  }

  // STEP 3: Atomic update
  const updateQuery = Request.findOneAndUpdate(
    {
      _id: requestId,
      status: 'PENDING'
    },
    {
      $set: {
        status: 'REJECTED',
        approvedBy: rejector._id,
        approvedAt: new Date()
      }
    },
    { new: true }
  ).populate('userId', 'name employeeCode email teamId');

  const updatedRequest = session ? await updateQuery.session(session) : await updateQuery;

  if (!updatedRequest) {
    const checkQuery = Request.findById(requestId);
    const currentRequest = session ? await checkQuery.session(session) : await checkQuery;
    const currentStatus = currentRequest ? currentRequest.status.toLowerCase() : 'unknown';
    const error = new Error(`Request already ${currentStatus}`);
    error.statusCode = 409;
    throw error;
  }

  return updatedRequest;
}

/**
 * Reject a request (transaction-safe wrapper)
 * P0-1 Fix: Support both replica set (with transactions) and standalone MongoDB.
 * 
 * RBAC: MANAGER can only reject requests from users in the same team.
 *       ADMIN can reject any request across the company.
 * 
 * @param {string} requestId - Request's ObjectId
 * @param {Object} rejector - Rejector user object (req.user)
 * @returns {Promise<Object>} Updated request
 */
export const rejectRequest = async (requestId, rejector) => {
  // Validate request ID format
  if (!mongoose.Types.ObjectId.isValid(requestId)) {
    const error = new Error('Invalid request ID');
    error.statusCode = 400;
    throw error;
  }

  // PATH A: Replica Set → Use transaction
  if (isReplicaSetAvailable()) {
    const session = await mongoose.startSession();
    try {
      const result = await session.withTransaction(async () => {
        return await rejectRequestCore(requestId, rejector, session);
      }, getTransactionOptions());
      return result;
    } finally {
      await session.endSession();
    }
  }
  
  // PATH B: Standalone → Direct execution
  else {
    return await rejectRequestCore(requestId, rejector, null);
  }
};

/**
 * Update or create attendance record based on approved request.
 * P0-1 Fix: Added session parameter for transaction support.
 * Uses findOneAndUpdate with upsert to handle both create and update atomically.
 * Only updates the time fields that were requested.
 * 
 * Phase 2.1 (OT_REQUEST): Reconciles OT approval when upserting attendance.
 * Prevents bug: OT approved before check-in → ADJUST_TIME creates attendance → otApproved lost.
 * 
 * @param {Object} request - Approved request object
 * @param {Object} session - Mongoose session for transaction (optional)
 */
async function updateAttendanceFromRequest(request, session = null) {
  const { userId, date, requestedCheckInAt, requestedCheckOutAt } = request;

  // Extract ObjectId safely (handle both populated and non-populated userId)
  const userObjectId = userId?._id ?? userId;

  const updateFields = {};

  if (requestedCheckInAt) {
    updateFields.checkInAt = requestedCheckInAt;
  }

  if (requestedCheckOutAt) {
    updateFields.checkOutAt = requestedCheckOutAt;
  }

  // Phase 2.1 (OT_REQUEST): Reconcile OT approval when creating/updating attendance via ADJUST_TIME
  // Handle case: OT approved BEFORE attendance exists, then ADJUST_TIME creates attendance
  // P1 Fix: Use $or to support legacy data (date vs checkInDate field)
  const otQuery = Request.exists({
    userId: userObjectId,
    type: 'OT_REQUEST',
    status: 'APPROVED',
    $or: [{ date }, { checkInDate: date }]
  });
  
  const approvedOt = session ? await otQuery.session(session) : await otQuery;

  if (approvedOt) {
    updateFields.otApproved = true;
  }

  // Defensive check: cannot create new attendance without checkInAt
  // (validation in createRequest should prevent this, but guard here for safety)
  const existsQuery = Attendance.exists({ 
    userId: userObjectId, 
    date 
  });
  
  const exists = session ? await existsQuery.session(session) : await existsQuery;

  if (!exists && !requestedCheckInAt) {
    const error = new Error('Cannot create attendance without check-in time');
    error.statusCode = 400;
    throw error;
  }

  // Atomic upsert: create if not exists, update if exists
  const upsertOptions = { 
    upsert: true, 
    new: true, 
    runValidators: true
  };
  
  // P1-1 Fix: Conditionally add session only if it exists
  if (session) {
    upsertOptions.session = session;
  }
  
  await Attendance.findOneAndUpdate(
    { userId: userObjectId, date },
    {
      $set: updateFields,
      $setOnInsert: {
        userId: userObjectId,
        date
      }
    },
    upsertOptions
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

/**
 * Create OT request with comprehensive validation
 * 
 * Business Rules:
 * - E1: Advance notice allowed (today or future)
 * - E2: No retroactive (no past dates)
 * - B1: Minimum 30 minutes OT
 * - D1: Max 31 pending per month
 * - D2: Auto-extend if PENDING exists for same date
 * - I1: Cross-midnight requires 2 separate requests
 * 
 * @param {string} userId - User's ObjectId
 * @param {Object} requestData - { date, estimatedEndTime, reason }
 * @returns {Promise<Object>} Created or updated request
 */
export const createOtRequest = async (userId, requestData) => {
  const { date, estimatedEndTime, reason } = requestData;
  
  // Validation 0: userId must be valid ObjectId (defensive)
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    const error = new Error('Invalid userId');
    error.statusCode = 400;
    throw error;
  }
  
  // Validation 0.5: date format must be valid (defensive)
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const error = new Error('Invalid date format. Expected YYYY-MM-DD');
    error.statusCode = 400;
    throw error;
  }
  
  // Validation 0.6: estimatedEndTime timezone (if string)
  assertHasTzIfString(estimatedEndTime, 'estimatedEndTime');
  
  // Validation 0.6: Parse and validate estimatedEndTime (accept string or Date)
  const endTime = toValidDate(estimatedEndTime, 'estimatedEndTime');
  if (!endTime) {
    const error = new Error('estimatedEndTime is required');
    error.statusCode = 400;
    throw error;
  }
  
  // Validation 0.7: reason must not be empty (defensive)
  const trimmedReason = (reason ?? '').trim();
  if (!trimmedReason) {
    const error = new Error('Reason is required');
    error.statusCode = 400;
    throw error;
  }
  
  // Validation 0.8: reason length limit (consistent with ADJUST_TIME/LEAVE)
  const MAX_REASON_LENGTH = 1000;
  if (trimmedReason.length > MAX_REASON_LENGTH) {
    const error = new Error(`Reason must be ${MAX_REASON_LENGTH} characters or less`);
    error.statusCode = 400;
    throw error;
  }
  
  // Validation 1: Date must be today or future (E1, E2)
  const todayKey = getTodayDateKey();
  if (date < todayKey) {
    const error = new Error('Cannot create OT request for past dates');
    error.statusCode = 400;
    throw error;
  }
  
  // ========== P1-2 FIX START ==========
  // Validation 1.5: Same-day retroactive check (STRICT policy)
  // Policy: OT must be requested BEFORE the estimated end time
  // Rationale: Prevent retroactive OT recording abuse
  if (date === todayKey) {
    const now = Date.now();
    if (endTime.getTime() <= now) {
      const error = new Error(
        'Cannot create OT request for past time. OT must be requested before the estimated end time.\n' +
        `Current time: ${new Date(now).toLocaleString('en-GB', { timeZone: 'Asia/Bangkok', hour12: false })} (GMT+7)\n` +
        `Requested time: ${endTime.toLocaleString('en-GB', { timeZone: 'Asia/Bangkok', hour12: false })} (GMT+7)\n` +
        'If you forgot to request, please contact your manager.'
      );
      error.statusCode = 400;
      throw error;
    }
  }
  // ========== P1-2 FIX END ==========
  
  // Validation 2: estimatedEndTime must be on same date (I1)
  const estimatedDateKey = getDateKey(endTime);
  if (estimatedDateKey !== date) {
    const error = new Error('Cross-midnight OT requires separate requests for each date. Please create a request for each day.');
    error.statusCode = 400;
    throw error;
  }
  
  // Validation 3: estimatedEndTime must be > 17:31 (OT period)
  if (!isInOtPeriod(date, endTime)) {
    const error = new Error('OT must start after 17:31. Please adjust your estimated end time.');
    error.statusCode = 400;
    throw error;
  }
  
  // Validation 4: Minimum 30 minutes OT (B1)
  const estimatedOtMinutes = getOtDuration(date, endTime);
  if (estimatedOtMinutes < 30) {
    const error = new Error('Minimum OT duration is 30 minutes');
    error.statusCode = 400;
    throw error;
  }
  
  // Validation 5: Cannot create if already checked out (E2)
  const existingAttendance = await Attendance.findOne({ userId, date });
  if (existingAttendance?.checkOutAt) {
    const error = new Error('Cannot request OT after checkout. OT must be requested before checking out.');
    error.statusCode = 400;
    throw error;
  }
  
  // Validation 6: Max 31 pending per month (D1)
  // P1 Fix: Use $or to count legacy records (date vs checkInDate field)
  const month = date.substring(0, 7);
  const pendingCount = await Request.countDocuments({
    userId,
    type: 'OT_REQUEST',
    status: 'PENDING',
    $or: [
      { date: { $regex: `^${month}` } },
      { checkInDate: { $regex: `^${month}` } }
    ]
  });
  
  if (pendingCount >= 31) {
    const error = new Error('Maximum 31 pending OT requests per month reached');
    error.statusCode = 400;
    throw error;
  }
  
  // D2: Auto-extend - Check if PENDING request exists for same date (ATOMIC FIX)
  // P1 Fix: Use $or to match legacy records (date vs checkInDate field)
  const existingRequest = await Request.findOneAndUpdate(
    {
      userId,
      type: 'OT_REQUEST',
      status: 'PENDING',
      $or: [{ date }, { checkInDate: date }]
    },
    {
      $set: {
        estimatedEndTime: endTime,
        reason: trimmedReason
      }
    },
    { new: true }
  );
  
  if (existingRequest) {
    // Auto-extend successful
    return existingRequest;
  }
  
  // Create new OT request (no existing PENDING found)
  try {
    const request = await Request.create({
      userId,
      type: 'OT_REQUEST',
      date,
      checkInDate: date,  // For consistency with schema + unique index
      estimatedEndTime: endTime,
      reason: trimmedReason,
      status: 'PENDING'
    });
    
    return request;
  } catch (err) {
    // Handle MongoDB duplicate key error (should not happen due to findOneAndUpdate above)
    if (err?.code === 11000) {
      const error = new Error('Duplicate OT request detected. Please try again.');
      error.statusCode = 409;
      throw error;
    }
    throw err;
  }
};

/**
 * Cancel OT request (C2: only if PENDING)
 * 
 * @param {string} userId - User's ObjectId (for ownership check)
 * @param {string} requestId - Request's ObjectId
 * @returns {Promise<Object>} Success message
 */
export const cancelOtRequest = async (userId, requestId) => {
  // Validation 0: userId must be valid ObjectId (defensive)
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    const error = new Error('Invalid userId');
    error.statusCode = 400;
    throw error;
  }
  
  // Validation 1: requestId must be valid ObjectId
  if (!mongoose.Types.ObjectId.isValid(requestId)) {
    const error = new Error('Invalid request ID');
    error.statusCode = 400;
    throw error;
  }
  
  // Find PENDING OT request owned by user
  const request = await Request.findOne({
    _id: requestId,
    userId,
    type: 'OT_REQUEST',
    status: 'PENDING'
  });
  
  if (!request) {
    const error = new Error('OT request not found or already processed');
    error.statusCode = 404;
    throw error;
  }
  
  // Delete the request
  await Request.deleteOne({ _id: requestId });
  
  return { 
    message: 'OT request cancelled successfully',
    requestId 
  };
};
