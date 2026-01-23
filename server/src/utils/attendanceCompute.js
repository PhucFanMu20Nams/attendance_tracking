import { isToday, isWeekend, getMinutesDiff, createTimeInGMT7, getDateKey } from './dateUtils.js';

/**
 * Normalize dateKey to "YYYY-MM-DD" format in GMT+7.
 * Handles: Date object, ISO string, or already formatted string.
 * @param {Date|string} date - Date to normalize
 * @returns {string} "YYYY-MM-DD" format in GMT+7
 */
function normalizeDateKey(date) {
  if (!date) return '';
  // If already "YYYY-MM-DD" format (10 chars, has dashes)
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return date;
  }
  // If ISO string like "2026-01-22T01:45:00.000Z"
  // Fix A: Convert to Date first for proper GMT+7 boundary detection
  // Example: "2026-01-21T18:30:00.000Z" in GMT+7 is 01:30 Jan 22, not Jan 21
  if (typeof date === 'string' && date.includes('T')) {
    const d = new Date(date);
    return isNaN(d.getTime()) ? date.split('T')[0] : getDateKey(d);
  }
  // If Date object - use getDateKey for proper GMT+7 conversion
  // Fix B: toISOString() returns UTC which can shift the date boundary
  if (date instanceof Date) {
    return getDateKey(date); // Uses Asia/Ho_Chi_Minh timezone
  }
  // Fallback: try to convert
  return String(date).split('T')[0];
}

/**
 * Normalize timestamp to Date object for consistent comparisons.
 * @param {Date|string|number} timestamp - Timestamp to normalize
 * @returns {Date|null} Date object or null if invalid
 */
function normalizeTimestamp(timestamp) {
  if (!timestamp) return null;
  if (timestamp instanceof Date) return timestamp;
  // String or number -> convert to Date
  const date = new Date(timestamp);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Compute all attendance fields (status, lateMinutes, workMinutes, otMinutes).
 * Critical: This is called for records that EXIST. For ABSENT, caller handles it separately.
 * 
 * @param {Object} attendance - { date, checkInAt, checkOutAt }
 * @param {Set<string>} holidayDates - Set of "YYYY-MM-DD" holiday dates (optional)
 * @returns {Object} { status, lateMinutes, workMinutes, otMinutes }
 */
export function computeAttendance(attendance, holidayDates = new Set()) {
  // Fix A: Guard against null/undefined attendance to prevent destructuring crash
  if (!attendance) {
    return { status: 'UNKNOWN', lateMinutes: 0, workMinutes: 0, otMinutes: 0 };
  }

  const { date, checkInAt, checkOutAt } = attendance;

  // Fix #2: Normalize date to "YYYY-MM-DD" format for consistent lookups
  const dateKey = normalizeDateKey(date);
  
  // Fix #1: Normalize timestamps to Date objects for consistent comparisons
  const checkIn = normalizeTimestamp(checkInAt);
  const checkOut = normalizeTimestamp(checkOutAt);

  // Rule from RULES.md: "If date is Weekend/Holiday → WEEKEND/HOLIDAY"
  if (isWeekend(dateKey) || holidayDates.has(dateKey)) {
    return {
      status: 'WEEKEND_OR_HOLIDAY',
      lateMinutes: 0,
      workMinutes: 0,
      otMinutes: 0
    };
  }

  const today = isToday(dateKey);

  // Fix #7: Has checkOut but no checkIn → MISSING_CHECKIN (edge case: forgot to check in)
  if (!checkIn && checkOut) {
    return {
      status: 'MISSING_CHECKIN',
      lateMinutes: 0,
      workMinutes: 0,
      otMinutes: 0
    };
  }

  // Today + checked in + not checked out = WORKING
  if (today && checkIn && !checkOut) {
    return {
      status: 'WORKING',
      lateMinutes: computeLateMinutes(dateKey, checkIn),
      workMinutes: 0,
      otMinutes: 0
    };
  }

  // Past day + checked in + not checked out = MISSING_CHECKOUT
  if (!today && checkIn && !checkOut) {
    return {
      status: 'MISSING_CHECKOUT',
      lateMinutes: computeLateMinutes(dateKey, checkIn),
      workMinutes: 0,
      otMinutes: 0
    };
  }

  // Both checkIn and checkOut exist
  if (checkIn && checkOut) {
    const lateMinutes = computeLateMinutes(dateKey, checkIn);
    const workMinutes = computeWorkMinutes(dateKey, checkIn, checkOut);
    const otMinutes = computeOtMinutes(dateKey, checkOut);
    const isEarlyLeave = checkIsEarlyLeave(dateKey, checkOut);

    // Priority: LATE_AND_EARLY (Purple) > LATE (Red) > EARLY_LEAVE (Yellow) > ON_TIME (Green)
    // Per RULES.md v2.3 §3.3: LATE_AND_EARLY is highest severity
    let status = 'ON_TIME';

    if (lateMinutes > 0 && isEarlyLeave) {
      status = 'LATE_AND_EARLY'; // Purple - NEW v2.3: both late AND early leave
    } else if (lateMinutes > 0) {
      status = 'LATE'; // Red - most severe single violation
    } else if (isEarlyLeave) {
      status = 'EARLY_LEAVE'; // Yellow - less severe
    }

    return {
      status,
      lateMinutes,
      workMinutes,
      otMinutes
    };
  }

  // Fallback (should not happen with proper data)
  return {
    status: 'UNKNOWN',
    lateMinutes: 0,
    workMinutes: 0,
    otMinutes: 0
  };
}

/**
 * Calculate late minutes if check-in after 08:45 GMT+7.
 * Rule: ON_TIME if <= 08:45, LATE if >= 08:46
 */
export function computeLateMinutes(dateKey, checkInAt) {
  const lateThreshold = createTimeInGMT7(dateKey, 8, 45); // 08:45 GMT+7

  if (checkInAt <= lateThreshold) {
    return 0;
  }

  return getMinutesDiff(lateThreshold, checkInAt);
}

/**
 * Calculate work minutes from check-in to check-out, with lunch deduction.
 * Rule: Deduct 60 mins if checkIn < 12:00 AND checkOut > 13:00 (span lunch window)
 * Fix #3 & #4: Clamp to 0 to prevent negative minutes from bad data
 */
export function computeWorkMinutes(dateKey, checkInAt, checkOutAt) {
  // Fix #3: Guard against checkOut before checkIn (bad data)
  if (checkOutAt < checkInAt) {
    return 0;
  }

  const totalMinutes = getMinutesDiff(checkInAt, checkOutAt);

  // Check if work interval spans lunch window (12:00-13:00 GMT+7)
  const lunchStart = createTimeInGMT7(dateKey, 12, 0);
  const lunchEnd = createTimeInGMT7(dateKey, 13, 0);

  const spansLunch = checkInAt < lunchStart && checkOutAt > lunchEnd;

  if (spansLunch) {
    // Fix #4: Clamp to 0 to prevent negative when totalMinutes < 60
    return Math.max(0, totalMinutes - 60);
  }

  return Math.max(0, totalMinutes);
}

/**
 * Calculate overtime minutes if check-out after 18:30 GMT+7.
 * Rule: OT = minutes after 18:30 if checkOutAt > 18:30
 */
export function computeOtMinutes(dateKey, checkOutAt) {
  const otThreshold = createTimeInGMT7(dateKey, 18, 30); // 18:30 GMT+7

  if (checkOutAt <= otThreshold) {
    return 0;
  }

  return getMinutesDiff(otThreshold, checkOutAt);
}

/**
 * Check if check-out is before 17:30 GMT+7 (early leave).
 * Rule: EARLY_LEAVE if checkOutAt < 17:30
 */
export function checkIsEarlyLeave(dateKey, checkOutAt) {
  const endOfShift = createTimeInGMT7(dateKey, 17, 30); // 17:30 GMT+7
  return checkOutAt < endOfShift;
}
