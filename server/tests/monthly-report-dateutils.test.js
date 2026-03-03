/**
 * Test Suite: Monthly Report Date Utils Tests
 * 
 * Coverage:
 * - C7: Date Utility Reuse (2 tests)
 * 
 * Tests verify that reportService correctly uses dateUtils functions
 * and that GMT+7 timezone handling is consistent across all date operations.
 */

import { describe, it, expect } from 'vitest';
import * as dateUtils from '../src/utils/dateUtils.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('C7: Date Utility Reuse', () => {
    
    it('C7-TC1: reportService imports and uses dateUtils functions', () => {
        // Read reportService.js source code
        const reportServicePath = join(__dirname, '../src/services/reportService.js');
        const sourceCode = readFileSync(reportServicePath, 'utf-8');
        
        // Verify imports from dateUtils
        expect(sourceCode).toContain("from '../utils/dateUtils.js'");
        
        // Verify usage of key dateUtils functions
        expect(sourceCode).toContain('countWorkdays');
        expect(sourceCode).toContain('getDateRange');
        expect(sourceCode).toContain('isWeekend');
        expect(sourceCode).toContain('getTodayDateKey');
        expect(sourceCode).toContain('formatTimeGMT7');
        
        // Verify NO duplicate date logic (e.g., no hardcoded timezone strings)
        // reportService should use GMT+7 through dateUtils, not directly
        const timezoneMatches = sourceCode.match(/Asia\/Ho_Chi_Minh/g);
        expect(timezoneMatches).toBeNull(); // Should not have direct timezone reference
    });

    it('C7-TC2: GMT+7 timezone consistency across date operations', () => {
        // Test that all dateUtils functions respect GMT+7 timezone
        
        // Test 1: getTodayDateKey returns GMT+7 date
        const todayKey = dateUtils.getTodayDateKey();
        expect(todayKey).toMatch(/^\d{4}-\d{2}-\d{2}$/); // YYYY-MM-DD format
        
        // Test 2: getDateKey converts Date to GMT+7 dateKey
        const testDate = new Date('2026-02-05T20:00:00Z'); // 8PM UTC = 3AM next day GMT+7
        const dateKey = dateUtils.getDateKey(testDate);
        expect(dateKey).toBe('2026-02-06'); // Should be Feb 6 in GMT+7, not Feb 5
        
        // Test 3: formatTimeGMT7 formats time in GMT+7
        const testTime = new Date('2026-02-05T01:30:00Z'); // 1:30 AM UTC = 8:30 AM GMT+7
        const timeStr = dateUtils.formatTimeGMT7(testTime);
        expect(timeStr).toBe('08:30');
        
        // Test 4: isWeekend checks weekend in GMT+7
        const saturdayGMT7 = '2026-02-07'; // Saturday
        const sundayGMT7 = '2026-02-08'; // Sunday
        const mondayGMT7 = '2026-02-09'; // Monday
        
        expect(dateUtils.isWeekend(saturdayGMT7)).toBe(true);
        expect(dateUtils.isWeekend(sundayGMT7)).toBe(true);
        expect(dateUtils.isWeekend(mondayGMT7)).toBe(false);
        
        // Test 5: countWorkdays excludes weekends correctly in GMT+7
        const workdays = dateUtils.countWorkdays('2026-02-03', '2026-02-09', new Set());
        // Feb 3-9: Mon, Tue, Wed, Thu, Fri, Sat, Sun = 5 workdays
        expect(workdays).toBe(5);
    });

    it('C7-TC2.1: Cross-midnight scenarios respect GMT+7 boundaries', () => {
        // Test date boundary handling for cross-midnight check-ins/check-outs
        
        // Scenario: Check-in at 11:30 PM UTC (6:30 AM next day GMT+7)
        const lateNightUTC = new Date('2026-02-04T23:30:00Z');
        const dateKey = dateUtils.getDateKey(lateNightUTC);
        
        // Should be Feb 5 in GMT+7, not Feb 4
        expect(dateKey).toBe('2026-02-05');
        
        // Verify time is also correct
        const timeStr = dateUtils.formatTimeGMT7(lateNightUTC);
        expect(timeStr).toBe('06:30');
    });

    it('C7-TC2.2: Holiday handling respects workday calculation', () => {
        // Test that countWorkdays correctly excludes both weekends and holidays
        
        const startDate = '2026-02-01'; // Saturday
        const endDate = '2026-02-28'; // Saturday
        
        // No holidays
        const workdaysNoHolidays = dateUtils.countWorkdays(startDate, endDate, new Set());
        
        // With one holiday (Feb 12 - Wednesday)
        const holidays = new Set(['2026-02-12']);
        const workdaysWithHoliday = dateUtils.countWorkdays(startDate, endDate, holidays);
        
        // Should be 1 less workday when holiday is added
        expect(workdaysWithHoliday).toBe(workdaysNoHolidays - 1);
        expect(workdaysWithHoliday).toBeGreaterThan(0);
    });

    it('C7-TC2.3: getDateRange generates correct date sequence', () => {
        // Test that getDateRange produces correct inclusive date sequence
        
        const start = '2026-02-05';
        const end = '2026-02-09';
        
        const dateRange = Array.from(dateUtils.getDateRange(start, end));
        
        expect(dateRange).toEqual([
            '2026-02-05',
            '2026-02-06',
            '2026-02-07',
            '2026-02-08',
            '2026-02-09'
        ]);
        
        expect(dateRange.length).toBe(5);
    });

    it('C7-TC2.4: Edge case - invalid date handling', () => {
        // Test that dateUtils gracefully handles invalid dates
        
        const invalidDate = new Date('invalid');
        const dateKey = dateUtils.getDateKey(invalidDate);
        
        // Should return empty string for invalid date
        expect(dateKey).toBe('');
        
        const timeStr = dateUtils.formatTimeGMT7(invalidDate);
        expect(timeStr).toBe('');
    });

    it('C7-TC2.5: isToday correctly identifies today in GMT+7', () => {
        // Test isToday function
        
        const todayKey = dateUtils.getTodayDateKey();
        expect(dateUtils.isToday(todayKey)).toBe(true);
        
        // Yesterday should not be today
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayKey = dateUtils.getDateKey(yesterday);
        expect(dateUtils.isToday(yesterdayKey)).toBe(false);
    });
});

describe('C7: Additional Date Utils Coverage', () => {
    
    it('should handle month boundaries correctly', () => {
        // Test date operations across month boundaries
        
        // Last day of January
        const jan31 = '2026-01-31';
        const feb1 = '2026-02-01';
        
        const dateRange = Array.from(dateUtils.getDateRange(jan31, feb1));
        expect(dateRange).toEqual(['2026-01-31', '2026-02-01']);
    });

    it('should handle leap year correctly', () => {
        // 2024 is a leap year
        const feb28_2024 = '2024-02-28';
        const feb29_2024 = '2024-02-29';
        const mar1_2024 = '2024-03-01';
        
        const dateRange = Array.from(dateUtils.getDateRange(feb28_2024, mar1_2024));
        expect(dateRange).toContain('2024-02-29'); // Leap day should be included
        expect(dateRange.length).toBe(3);
        
        // 2026 is not a leap year
        const workdays2026 = dateUtils.countWorkdays('2026-02-01', '2026-02-28', new Set());
        const workdays2024 = dateUtils.countWorkdays('2024-02-01', '2024-02-29', new Set());
        
        // 2024 Feb has 1 more day, but it's Saturday (leap day), so same workdays
        expect(workdays2024).toBeGreaterThanOrEqual(workdays2026 - 1);
    });

    it('should handle single-day range', () => {
        // Test range with same start and end date
        
        const singleDay = '2026-02-05';
        const dateRange = Array.from(dateUtils.getDateRange(singleDay, singleDay));
        
        expect(dateRange).toEqual([singleDay]);
        expect(dateRange.length).toBe(1);
        
        const workdays = dateUtils.countWorkdays(singleDay, singleDay, new Set());
        expect(workdays).toBe(1); // Wednesday is a workday
    });

    it('should handle weekend-only range', () => {
        // Test range containing only weekend days
        
        const sat = '2026-02-07';
        const sun = '2026-02-08';
        
        const workdays = dateUtils.countWorkdays(sat, sun, new Set());
        expect(workdays).toBe(0); // No workdays in weekend-only range
    });

    it('should handle holiday on weekend', () => {
        // Test that holiday on weekend doesn't affect workday count
        
        const start = '2026-02-07'; // Saturday
        const end = '2026-02-09'; // Monday
        
        // Holiday on Sunday (already weekend)
        const holidays = new Set(['2026-02-08']);
        
        const workdays = dateUtils.countWorkdays(start, end, holidays);
        expect(workdays).toBe(1); // Only Monday is workday
        
        // Compare with no holiday
        const workdaysNoHoliday = dateUtils.countWorkdays(start, end, new Set());
        expect(workdaysNoHoliday).toBe(1); // Same, because holiday was on weekend
    });
});
