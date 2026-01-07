import { isToday, isWeekend, getMinutesDiff, createTimeInGMT7 } from './dateUtils.js';

/**
 * Compute all attendance fields (status, lateMinutes, workMinutes, otMinutes).
 * Critical: This is called for records that EXIST. For ABSENT, caller handles it separately.
 * 
 * @param {Object} attendance - { date, checkInAt, checkOutAt }
 * @param {Set<string>} holidayDates - Set of "YYYY-MM-DD" holiday dates (optional)
 * @returns {Object} { status, lateMinutes, workMinutes, otMinutes }
 */
export function computeAttendance(attendance, holidayDates = new Set()) {
  const { date, checkInAt, checkOutAt } = attendance;

  // Rule from RULES.md: "If date is Weekend/Holiday → WEEKEND/HOLIDAY"
  if (isWeekend(date) || holidayDates.has(date)) {
    return {
      status: 'WEEKEND_OR_HOLIDAY',
      lateMinutes: 0,
      workMinutes: 0,
      otMinutes: 0
    };
  }

  const today = isToday(date);

  // Today + checked in + not checked out = WORKING
  if (today && checkInAt && !checkOutAt) {
    return {
      status: 'WORKING',
      lateMinutes: computeLateMinutes(date, checkInAt),
      workMinutes: 0,
      otMinutes: 0
    };
  }

  // Past day + checked in + not checked out = MISSING_CHECKOUT
  if (!today && checkInAt && !checkOutAt) {
    return {
      status: 'MISSING_CHECKOUT',
      lateMinutes: computeLateMinutes(date, checkInAt),
      workMinutes: 0,
      otMinutes: 0
    };
  }

  // Both checkIn and checkOut exist
  if (checkInAt && checkOutAt) {
    const lateMinutes = computeLateMinutes(date, checkInAt);
    const workMinutes = computeWorkMinutes(date, checkInAt, checkOutAt);
    const otMinutes = computeOtMinutes(date, checkOutAt);
    const isEarlyLeave = checkIsEarlyLeave(date, checkOutAt);

    // Priority: LATE (Red) > EARLY_LEAVE (Yellow) > ON_TIME (Green)
    // Per RULES.md UI Colors: each status maps to exactly one color
    let status = 'ON_TIME';

    if (lateMinutes > 0) {
      status = 'LATE'; // Red - most severe, takes priority
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
 */
export function computeWorkMinutes(dateKey, checkInAt, checkOutAt) {
  const totalMinutes = getMinutesDiff(checkInAt, checkOutAt);

  // Check if work interval spans lunch window (12:00-13:00 GMT+7)
  const lunchStart = createTimeInGMT7(dateKey, 12, 0);
  const lunchEnd = createTimeInGMT7(dateKey, 13, 0);

  const spansLunch = checkInAt < lunchStart && checkOutAt > lunchEnd;

  if (spansLunch) {
    return totalMinutes - 60; // Deduct lunch break
  }

  return totalMinutes;
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
