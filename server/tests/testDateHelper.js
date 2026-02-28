import { getDateKey, isWeekend } from '../src/utils/dateUtils.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Returns a GMT+7 date key for N days ago from now.
 * @param {number} daysAgo
 * @returns {string}
 */
export function daysAgoKey(daysAgo) {
  if (!Number.isInteger(daysAgo) || daysAgo < 0) {
    throw new Error(`daysAgo must be a non-negative integer, received: ${daysAgo}`);
  }

  return getDateKey(new Date(Date.now() - daysAgo * DAY_MS));
}

/**
 * Returns the first non-weekend date key scanning backward from startDaysAgo.
 * @param {number} startDaysAgo
 * @returns {string}
 */
export function recentWeekday(startDaysAgo = 2) {
  if (!Number.isInteger(startDaysAgo) || startDaysAgo < 0) {
    throw new Error(`startDaysAgo must be a non-negative integer, received: ${startDaysAgo}`);
  }

  for (let offset = startDaysAgo; offset <= startDaysAgo + 14; offset += 1) {
    const dateKey = daysAgoKey(offset);
    if (dateKey && !isWeekend(dateKey)) {
      return dateKey;
    }
  }

  throw new Error(`Unable to find recent weekday from startDaysAgo=${startDaysAgo}`);
}

/**
 * Returns a list of distinct non-weekend date keys scanning backward.
 * @param {number} count
 * @param {number} startDaysAgo
 * @returns {string[]}
 */
export function recentDistinctWeekdays(count, startDaysAgo = 2) {
  if (!Number.isInteger(count) || count <= 0) {
    throw new Error(`count must be a positive integer, received: ${count}`);
  }
  if (!Number.isInteger(startDaysAgo) || startDaysAgo < 0) {
    throw new Error(`startDaysAgo must be a non-negative integer, received: ${startDaysAgo}`);
  }

  const results = [];
  const seen = new Set();

  for (let offset = startDaysAgo; offset <= startDaysAgo + 30; offset += 1) {
    const dateKey = daysAgoKey(offset);
    if (!dateKey || isWeekend(dateKey) || seen.has(dateKey)) {
      continue;
    }

    seen.add(dateKey);
    results.push(dateKey);
    if (results.length === count) {
      return results;
    }
  }

  throw new Error(
    `Unable to find ${count} distinct weekdays from startDaysAgo=${startDaysAgo}`
  );
}

/**
 * Returns a weekday check-in/check-out pair for cross-midnight tests.
 * checkOutDate is the day immediately after checkInDate.
 * @param {number} startDaysAgo
 * @returns {{checkInDate: string, checkOutDate: string}}
 */
export function recentCrossMidnightPair(startDaysAgo = 2) {
  if (!Number.isInteger(startDaysAgo) || startDaysAgo < 0) {
    throw new Error(`startDaysAgo must be a non-negative integer, received: ${startDaysAgo}`);
  }

  for (let offset = startDaysAgo; offset <= startDaysAgo + 14; offset += 1) {
    const checkInDate = daysAgoKey(offset);
    if (!checkInDate || isWeekend(checkInDate)) {
      continue;
    }

    const checkOutDate = getDateKey(new Date(Date.now() - (offset - 1) * DAY_MS));
    if (checkOutDate && !isWeekend(checkOutDate)) {
      return { checkInDate, checkOutDate };
    }
  }

  throw new Error(
    `Unable to find valid cross-midnight weekday pair from startDaysAgo=${startDaysAgo}`
  );
}

