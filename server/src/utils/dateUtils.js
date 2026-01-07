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
  
  // Create date at noon GMT+7 to avoid edge cases
  // Noon ensures we're safely in the middle of the target day regardless of DST
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