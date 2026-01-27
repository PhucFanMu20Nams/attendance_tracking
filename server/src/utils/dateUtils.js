const TIMEZONE = 'Asia/Ho_Chi_Minh';

/**
 * Get current date in GMT+7 as "YYYY-MM-DD" string.
 * Used for check-in/out to ensure consistent dateKey across the app.
 */
export function getTodayDateKey() {
  const now = new Date();
  return getDateKey(now);
}

/**
 * Convert any Date to "YYYY-MM-DD" string in GMT+7 timezone.
 * Critical: ensures date boundaries respect GMT+7, not server's local time.
 */
export function getDateKey(date) {
  const dateStr = date.toLocaleDateString('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return dateStr;
}

/**
 * Check if a dateKey matches today in GMT+7.
 * Used to distinguish WORKING (today) vs MISSING_CHECKOUT (past day).
 */
export function isToday(dateKey) {
  return dateKey === getTodayDateKey();
}

/**
 * Check if dateKey falls on weekend (Saturday or Sunday).
 * Used for status computation: weekend days should show WEEKEND, not ABSENT.
 */
export function isWeekend(dateKey) {
  // Split dateKey and create Date in GMT+7 explicitly
  const [year, month, day] = dateKey.split('-').map(Number);

  // Create date at noon GMT+7 to avoid timezone edge cases
  // Noon ensures we're safely in the middle of the target day
  const date = new Date(Date.UTC(year, month - 1, day, 12 - 7, 0, 0));

  const dayOfWeek = date.getUTCDay();
  return dayOfWeek === 0 || dayOfWeek === 6; // 0 = Sunday, 6 = Saturday
}

/**
 * Get hour and minute components of a Date in GMT+7.
 * Used for: late check (08:45), early leave (17:30), OT (18:30), lunch (12:00-13:00).
 */
export function getTimeInGMT7(date) {
  const timeStr = date.toLocaleTimeString('en-US', {
    timeZone: TIMEZONE,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit'
  });

  const [hours, minutes] = timeStr.split(':').map(Number);
  return { hours, minutes };
}

/**
 * Calculate minutes difference between two Dates.
 * Used for: workMinutes, lateMinutes, otMinutes calculations.
 */
export function getMinutesDiff(startDate, endDate) {
  return Math.floor((endDate - startDate) / (1000 * 60));
}

/**
 * Create a UTC Date representing a specific time on a given dateKey in GMT+7.
 * Used for computing reference times (08:45, 17:30, 18:30) for comparisons.
 * Returns a Date object (UTC timestamp) that represents the moment "dateKey HH:mm GMT+7".
 */
export function createTimeInGMT7(dateKey, hours, minutes) {
  const [year, month, day] = dateKey.split('-').map(Number);

  // Subtract 7 hours from GMT+7 to get UTC equivalent
  const dateInGMT7 = new Date(Date.UTC(year, month - 1, day, hours - 7, minutes));

  return dateInGMT7;
}

/**
 * Get all dates in a range as array of "YYYY-MM-DD" strings (inclusive).
 * Used for expanding leave date ranges.
 * 
 * @param {string} startDate - "YYYY-MM-DD"
 * @param {string} endDate - "YYYY-MM-DD"
 * @returns {string[]} Array of date strings
 */
export function getDateRange(startDate, endDate) {
  // Defensive validation: ensure valid format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    throw new Error(`Invalid startDate format: "${startDate}". Expected YYYY-MM-DD`);
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    throw new Error(`Invalid endDate format: "${endDate}". Expected YYYY-MM-DD`);
  }

  // Defensive validation: ensure logical ordering
  if (startDate > endDate) {
    throw new Error(`startDate (${startDate}) must be <= endDate (${endDate})`);
  }

  const dates = [];
  const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
  const [endYear, endMonth, endDay] = endDate.split('-').map(Number);

  // Defensive validation: ensure calendar validity (e.g., reject 2026-02-30)
  // JavaScript Date auto-rolls invalid dates (Feb 30 → Mar 2), so we check if it changed
  const testStart = new Date(Date.UTC(startYear, startMonth - 1, startDay, 12, 0, 0));
  if (testStart.getUTCFullYear() !== startYear ||
    testStart.getUTCMonth() !== startMonth - 1 ||
    testStart.getUTCDate() !== startDay) {
    throw new Error(`Invalid calendar date: ${startDate} (does not exist in calendar)`);
  }

  const testEnd = new Date(Date.UTC(endYear, endMonth - 1, endDay, 12, 0, 0));
  if (testEnd.getUTCFullYear() !== endYear ||
    testEnd.getUTCMonth() !== endMonth - 1 ||
    testEnd.getUTCDate() !== endDay) {
    throw new Error(`Invalid calendar date: ${endDate} (does not exist in calendar)`);
  }

  // Create Date objects at noon GMT+7 to avoid timezone edge cases
  const current = new Date(Date.UTC(startYear, startMonth - 1, startDay, 12 - 7, 0, 0));
  const end = new Date(Date.UTC(endYear, endMonth - 1, endDay, 12 - 7, 0, 0));

  while (current <= end) {
    const dateKey = getDateKey(current);
    dates.push(dateKey);

    // Move to next day
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return dates;
}

/**
 * Count workdays between two dates (inclusive), excluding weekends and holidays.
 * Used for calculating leaveDaysCount.
 * 
 * @param {string} startDate - "YYYY-MM-DD"
 * @param {string} endDate - "YYYY-MM-DD"
 * @param {Set<string>} holidayDates - Set of "YYYY-MM-DD" holiday dates
 * @returns {number} Count of workdays
 */
export function countWorkdays(startDate, endDate, holidayDates = new Set()) {
  const allDates = getDateRange(startDate, endDate);

  let workdayCount = 0;
  for (const dateKey of allDates) {
    // Skip weekends and holidays
    if (!isWeekend(dateKey) && !holidayDates.has(dateKey)) {
      workdayCount++;
    }
  }

  return workdayCount;
}