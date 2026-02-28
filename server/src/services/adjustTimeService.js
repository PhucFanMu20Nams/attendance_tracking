import mongoose from 'mongoose';
import Request from '../models/Request.js';
import Attendance from '../models/Attendance.js';
import { getDateKey, isWeekend } from '../utils/dateUtils.js';
import { getHolidayDatesForMonth } from '../utils/holidayUtils.js';
import {
  getCheckoutGraceMs, getCheckoutGraceHours,
  getAdjustRequestMaxMs, getAdjustRequestMaxDays
} from '../utils/graceConfig.js';
import { toValidDate, assertHasTzIfString } from './requestDateValidation.js';

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
  const holidayDates = await getHolidayDatesForMonth(month, null);
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
