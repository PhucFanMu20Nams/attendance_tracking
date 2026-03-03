/**
 * Weekday OT Regression Guard — Unit Tests
 *
 * Test Design: Change-Related Testing (ISTQB — Regression)
 * ISO 25010: Functional Suitability — Correctness
 * Priority: HIGH
 *
 * Purpose: Verify that weekend/holiday OT changes do NOT affect
 * existing weekday OT behavior. Guards against regression in:
 *   - computeAttendance weekday path (otApproved flag)
 *   - computeWorkMinutes cap at 17:30 when !otApproved
 *   - computeOtMinutes strict approval requirement
 *   - computePotentialOtMinutes (always computes)
 *
 * All tests are pure unit — no DB, no mocking timers.
 */

import { describe, it, expect } from 'vitest';
import {
  computeAttendance,
  computeWorkMinutes,
  computeOtMinutes,
  computePotentialOtMinutes
} from '../src/utils/attendanceCompute.js';
import { createTimeInGMT7 } from '../src/utils/dateUtils.js';

// Tuesday 2026-02-10 (weekday, not holiday, not weekend)
const WEEKDAY = '2026-02-10';
const gmt7 = (h, m) => createTimeInGMT7(WEEKDAY, h, m);

describe('Weekday OT regression guard — no behavior change', () => {

  // ─── Group 1: computeAttendance weekday path ──────────────────

  describe('computeAttendance weekday with otApproved=true', () => {
    it('returns OT minutes when approved and checkout after 17:31', () => {
      const result = computeAttendance({
        date: WEEKDAY,
        checkInAt: gmt7(8, 0),
        checkOutAt: gmt7(20, 0),
        otApproved: true
      });

      expect(result.status).not.toBe('WEEKEND_OR_HOLIDAY');
      // 20:00 - 17:31 = 149 min OT
      expect(result.otMinutes).toBe(149);
      // 08:00→20:00 = 12h - 1h lunch = 660
      expect(result.workMinutes).toBe(660);
    });
  });

  describe('computeAttendance weekday with otApproved=false', () => {
    it('returns 0 OT minutes when not approved (strict rule)', () => {
      const result = computeAttendance({
        date: WEEKDAY,
        checkInAt: gmt7(8, 0),
        checkOutAt: gmt7(20, 0),
        otApproved: false
      });

      expect(result.status).not.toBe('WEEKEND_OR_HOLIDAY');
      expect(result.otMinutes).toBe(0);
      // Capped at 17:30: 08:00→17:30 = 9.5h - 1h lunch = 510
      expect(result.workMinutes).toBe(510);
    });
  });

  describe('computeAttendance weekday checkout before 17:30', () => {
    it('returns 0 OT and EARLY_LEAVE status', () => {
      const result = computeAttendance({
        date: WEEKDAY,
        checkInAt: gmt7(8, 0),
        checkOutAt: gmt7(16, 0),
        otApproved: false
      });

      expect(result.status).toBe('EARLY_LEAVE');
      expect(result.otMinutes).toBe(0);
    });
  });

  describe('computeAttendance weekday late + OT approved', () => {
    it('returns correct lateMinutes and otMinutes combined', () => {
      const result = computeAttendance({
        date: WEEKDAY,
        checkInAt: gmt7(9, 30),  // 45 min late (after 08:45)
        checkOutAt: gmt7(20, 0),
        otApproved: true
      });

      expect(result.status).toBe('LATE');
      expect(result.lateMinutes).toBe(45);
      // 20:00 - 17:31 = 149 min OT
      expect(result.otMinutes).toBe(149);
    });
  });

  // ─── Group 2: computeWorkMinutes cap behavior ────────────────

  describe('computeWorkMinutes cap at 17:30 when !otApproved', () => {
    it('caps checkout at 17:30 when otApproved=false', () => {
      const result = computeWorkMinutes(WEEKDAY, gmt7(8, 0), gmt7(20, 0), false);
      // 08:00→17:30 = 9.5h = 570 min, spans lunch → 570 - 60 = 510
      expect(result).toBe(510);
    });

    it('does not cap checkout when otApproved=true', () => {
      const result = computeWorkMinutes(WEEKDAY, gmt7(8, 0), gmt7(20, 0), true);
      // 08:00→20:00 = 12h = 720 min, spans lunch → 720 - 60 = 660
      expect(result).toBe(660);
    });
  });

  // ─── Group 3: computeOtMinutes strict rule ────────────────────

  describe('computeOtMinutes strict approval requirement', () => {
    it('returns 0 when otApproved=false even with late checkout', () => {
      const result = computeOtMinutes(WEEKDAY, gmt7(20, 0), false);
      expect(result).toBe(0);
    });

    it('returns minutes after 17:31 when otApproved=true', () => {
      const result = computeOtMinutes(WEEKDAY, gmt7(20, 0), true);
      // 20:00 - 17:31 = 149
      expect(result).toBe(149);
    });

    it('returns 0 when checkout is before 17:31 even with approval', () => {
      const result = computeOtMinutes(WEEKDAY, gmt7(17, 0), true);
      expect(result).toBe(0);
    });
  });

  // ─── Group 4: computePotentialOtMinutes (always computes) ─────

  describe('computePotentialOtMinutes ignores approval flag', () => {
    it('returns OT regardless of approval status', () => {
      const result = computePotentialOtMinutes(WEEKDAY, gmt7(20, 0));
      // 20:00 - 17:31 = 149
      expect(result).toBe(149);
    });

    it('returns 0 if checkout before 17:31', () => {
      expect(computePotentialOtMinutes(WEEKDAY, gmt7(17, 0))).toBe(0);
      expect(computePotentialOtMinutes(WEEKDAY, gmt7(17, 31))).toBe(0);
    });
  });

  // ─── Group 5: Status classification regression ────────────────

  describe('weekday status classification unchanged', () => {
    it('ON_TIME for checkIn <= 08:45 and checkOut >= 17:30', () => {
      const result = computeAttendance({
        date: WEEKDAY,
        checkInAt: gmt7(8, 30),
        checkOutAt: gmt7(17, 30),
        otApproved: false
      });
      expect(result.status).toBe('ON_TIME');
    });

    it('LATE for checkIn > 08:45', () => {
      const result = computeAttendance({
        date: WEEKDAY,
        checkInAt: gmt7(9, 0),
        checkOutAt: gmt7(17, 30),
        otApproved: false
      });
      expect(result.status).toBe('LATE');
      expect(result.lateMinutes).toBe(15);
    });

    it('LATE_AND_EARLY for late checkIn + early checkOut', () => {
      const result = computeAttendance({
        date: WEEKDAY,
        checkInAt: gmt7(9, 0),
        checkOutAt: gmt7(16, 0),
        otApproved: false
      });
      expect(result.status).toBe('LATE_AND_EARLY');
    });
  });
});
