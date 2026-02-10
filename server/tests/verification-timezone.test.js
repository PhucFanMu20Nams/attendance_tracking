import { describe, it, expect } from 'vitest';
import { getDateKey, getTodayDateKey } from '../src/utils/dateUtils.js';

describe('🧪 VERIFICATION: getDateKey Timezone Correctness', () => {
  it('CRITICAL: getDateKey should return GMT+7 date, NOT UTC date', () => {
    // Test case 1: UTC time at 17:00 (5 PM) on Feb 10
    // In GMT+7, this is 00:00 (midnight) on Feb 11
    const utc1700Feb10 = new Date('2026-02-10T17:00:00Z');
    const result1 = getDateKey(utc1700Feb10);
    
    console.log('Test 1: UTC 2026-02-10T17:00:00Z');
    console.log('  Expected: 2026-02-11 (GMT+7: Feb 11 00:00)');
    console.log('  Actual:  ', result1);
    
    expect(result1).toBe('2026-02-11'); // GMT+7 is next day
    
    // Test case 2: UTC time at 16:59:59 (still Feb 10 in GMT+7)
    const utc1659Feb10 = new Date('2026-02-10T16:59:59Z');
    const result2 = getDateKey(utc1659Feb10);
    
    console.log('\nTest 2: UTC 2026-02-10T16:59:59Z');
    console.log('  Expected: 2026-02-10 (GMT+7: Feb 10 23:59)');
    console.log('  Actual:  ', result2);
    
    expect(result2).toBe('2026-02-10'); // Still Feb 10 in GMT+7
    
    // Test case 3: UTC midnight (should be 07:00 GMT+7 same day)
    const utcMidnight = new Date('2026-02-10T00:00:00Z');
    const result3 = getDateKey(utcMidnight);
    
    console.log('\nTest 3: UTC 2026-02-10T00:00:00Z');
    console.log('  Expected: 2026-02-10 (GMT+7: Feb 10 07:00)');
    console.log('  Actual:  ', result3);
    
    expect(result3).toBe('2026-02-10'); // Same day in GMT+7
  });

  it('CRITICAL: Cross-midnight detection should work correctly', () => {
    // Check-in at 23:00 GMT+7 (16:00 UTC)
    const checkIn = new Date('2026-02-10T16:00:00Z'); // 23:00 GMT+7
    const checkInKey = getDateKey(checkIn);
    
    // Check-out at 01:00 GMT+7 next day (18:00 UTC same day)
    const checkOut = new Date('2026-02-10T18:00:00Z'); // 01:00 GMT+7 Feb 11
    const checkOutKey = getDateKey(checkOut);
    
    console.log('\nCross-midnight scenario:');
    console.log('  Check-in:  2026-02-10T16:00:00Z → GMT+7:', checkInKey);
    console.log('  Check-out: 2026-02-10T18:00:00Z → GMT+7:', checkOutKey);
    console.log('  Is cross-midnight?', checkOutKey > checkInKey);
    
    expect(checkInKey).toBe('2026-02-10');
    expect(checkOutKey).toBe('2026-02-11');
    expect(checkOutKey > checkInKey).toBe(true); // Should detect cross-midnight
  });

  it('EDGE CASE: Timezone boundary (16:59:59 vs 17:00:00 UTC)', () => {
    // Just before GMT+7 midnight
    const before = new Date('2026-02-10T16:59:59.999Z');
    const beforeKey = getDateKey(before);
    
    // Exactly at GMT+7 midnight
    const after = new Date('2026-02-10T17:00:00.000Z');
    const afterKey = getDateKey(after);
    
    console.log('\nTimezone boundary test:');
    console.log('  16:59:59.999 UTC →', beforeKey, '(should be Feb 10)');
    console.log('  17:00:00.000 UTC →', afterKey, '(should be Feb 11)');
    
    expect(beforeKey).toBe('2026-02-10');
    expect(afterKey).toBe('2026-02-11');
    expect(beforeKey !== afterKey).toBe(true); // Should be different days
  });

  it('FORMAT: Should always return YYYY-MM-DD with zero-padding', () => {
    // Test single-digit month and day
    const jan5 = new Date('2026-01-05T12:00:00+07:00');
    const result = getDateKey(jan5);
    
    console.log('\nFormat test:');
    console.log('  Input: 2026-01-05 (Jan 5)');
    console.log('  Output:', result);
    console.log('  Matches YYYY-MM-DD?', /^\d{4}-\d{2}-\d{2}$/.test(result));
    
    expect(result).toBe('2026-01-05'); // Zero-padded
    expect(/^\d{4}-\d{2}-\d{2}$/.test(result)).toBe(true);
  });

  it('INVALID INPUT: Should handle invalid dates gracefully', () => {
    const invalid = new Date('invalid');
    const result = getDateKey(invalid);
    
    console.log('\nInvalid date test:');
    console.log('  Input: new Date("invalid")');
    console.log('  Output:', result);
    console.log('  Is empty string?', result === '');
    
    expect(result).toBe(''); // Should return empty string
  });
});
