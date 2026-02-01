/**
 * Edge case tests for graceConfig.js
 * Tests validation of CHECKOUT_GRACE_HOURS and ADJUST_REQUEST_MAX_DAYS
 */

import { describe, it, expect, afterEach } from 'vitest';
import {
    getCheckoutGraceHours,
    getCheckoutGraceMs,
    getAdjustRequestMaxDays,
    getAdjustRequestMaxMs
} from '../src/utils/graceConfig.js';

describe('graceConfig edge cases', () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
        // Restore original env
        process.env = { ...originalEnv };
    });

    describe('CHECKOUT_GRACE_HOURS validation', () => {
        it('should use default 24 when env is missing', () => {
            delete process.env.CHECKOUT_GRACE_HOURS;
            expect(getCheckoutGraceHours()).toBe(24);
            expect(getCheckoutGraceMs()).toBe(24 * 60 * 60 * 1000);
        });

        it('should use default 24 when env is empty string', () => {
            process.env.CHECKOUT_GRACE_HOURS = '';
            expect(getCheckoutGraceHours()).toBe(24);
        });

        it('should use default 24 when env is "0" (below min)', () => {
            process.env.CHECKOUT_GRACE_HOURS = '0';
            expect(getCheckoutGraceHours()).toBe(24);
        });

        it('should use default 24 when env is negative', () => {
            process.env.CHECKOUT_GRACE_HOURS = '-5';
            expect(getCheckoutGraceHours()).toBe(24);
        });

        it('should use default 24 when env is NaN', () => {
            process.env.CHECKOUT_GRACE_HOURS = 'abc';
            expect(getCheckoutGraceHours()).toBe(24);
        });

        it('should use default 24 when env exceeds max (48)', () => {
            process.env.CHECKOUT_GRACE_HOURS = '100';
            expect(getCheckoutGraceHours()).toBe(24);
        });

        it('should accept valid value at min boundary (1)', () => {
            process.env.CHECKOUT_GRACE_HOURS = '1';
            expect(getCheckoutGraceHours()).toBe(1);
            expect(getCheckoutGraceMs()).toBe(1 * 60 * 60 * 1000);
        });

        it('should accept valid value at max boundary (48)', () => {
            process.env.CHECKOUT_GRACE_HOURS = '48';
            expect(getCheckoutGraceHours()).toBe(48);
            expect(getCheckoutGraceMs()).toBe(48 * 60 * 60 * 1000);
        });

        it('should accept valid value in middle (12)', () => {
            process.env.CHECKOUT_GRACE_HOURS = '12';
            expect(getCheckoutGraceHours()).toBe(12);
        });

        it('should handle leading zeros correctly', () => {
            process.env.CHECKOUT_GRACE_HOURS = '08';
            expect(getCheckoutGraceHours()).toBe(8);
        });

        it('should reject trailing garbage (strict validation)', () => {
            process.env.CHECKOUT_GRACE_HOURS = '12abc';
            expect(getCheckoutGraceHours()).toBe(24); // Falls back to default
        });

        it('should reject decimal values', () => {
            process.env.CHECKOUT_GRACE_HOURS = '12.5';
            expect(getCheckoutGraceHours()).toBe(24); // Falls back to default
        });

        it('should accept values with leading/trailing spaces', () => {
            process.env.CHECKOUT_GRACE_HOURS = ' 12 ';
            expect(getCheckoutGraceHours()).toBe(12); // trim() handles this
        });
    });

    describe('ADJUST_REQUEST_MAX_DAYS validation', () => {
        it('should use default 7 when env is missing', () => {
            delete process.env.ADJUST_REQUEST_MAX_DAYS;
            expect(getAdjustRequestMaxDays()).toBe(7);
            expect(getAdjustRequestMaxMs()).toBe(7 * 24 * 60 * 60 * 1000);
        });

        it('should use default 7 when env is empty string', () => {
            process.env.ADJUST_REQUEST_MAX_DAYS = '';
            expect(getAdjustRequestMaxDays()).toBe(7);
        });

        it('should use default 7 when env is "0" (below min)', () => {
            process.env.ADJUST_REQUEST_MAX_DAYS = '0';
            expect(getAdjustRequestMaxDays()).toBe(7);
        });

        it('should use default 7 when env is negative', () => {
            process.env.ADJUST_REQUEST_MAX_DAYS = '-10';
            expect(getAdjustRequestMaxDays()).toBe(7);
        });

        it('should use default 7 when env is NaN', () => {
            process.env.ADJUST_REQUEST_MAX_DAYS = 'invalid';
            expect(getAdjustRequestMaxDays()).toBe(7);
        });

        it('should use default 7 when env exceeds max (30)', () => {
            process.env.ADJUST_REQUEST_MAX_DAYS = '100';
            expect(getAdjustRequestMaxDays()).toBe(7);
        });

        it('should accept valid value at min boundary (1)', () => {
            process.env.ADJUST_REQUEST_MAX_DAYS = '1';
            expect(getAdjustRequestMaxDays()).toBe(1);
            expect(getAdjustRequestMaxMs()).toBe(1 * 24 * 60 * 60 * 1000);
        });

        it('should accept valid value at max boundary (30)', () => {
            process.env.ADJUST_REQUEST_MAX_DAYS = '30';
            expect(getAdjustRequestMaxDays()).toBe(30);
            expect(getAdjustRequestMaxMs()).toBe(30 * 24 * 60 * 60 * 1000);
        });

        it('should accept valid value in middle (14)', () => {
            process.env.ADJUST_REQUEST_MAX_DAYS = '14';
            expect(getAdjustRequestMaxDays()).toBe(14);
        });
    });

    describe('DRY principle - single source of truth', () => {
        it('getCheckoutGraceMs should derive from getCheckoutGraceHours', () => {
            process.env.CHECKOUT_GRACE_HOURS = '10';
            const hours = getCheckoutGraceHours();
            const ms = getCheckoutGraceMs();
            expect(ms).toBe(hours * 60 * 60 * 1000);
        });

        it('getAdjustRequestMaxMs should derive from getAdjustRequestMaxDays', () => {
            process.env.ADJUST_REQUEST_MAX_DAYS = '5';
            const days = getAdjustRequestMaxDays();
            const ms = getAdjustRequestMaxMs();
            expect(ms).toBe(days * 24 * 60 * 60 * 1000);
        });
    });

    describe('Critical bug fixes', () => {
        it('BUG FIX: Negative hours should not create future earliestAllowed date', () => {
            process.env.CHECKOUT_GRACE_HOURS = '-5';
            const graceMs = getCheckoutGraceMs();

            // Should be positive (defaults to 24h)
            expect(graceMs).toBeGreaterThan(0);
            expect(graceMs).toBe(24 * 60 * 60 * 1000);

            // Verify earliestAllowed is in the past
            const earliestAllowed = new Date(Date.now() - graceMs);
            expect(earliestAllowed.getTime()).toBeLessThan(Date.now());
        });

        it('BUG FIX: Zero should fallback to default, not be accepted', () => {
            process.env.CHECKOUT_GRACE_HOURS = '0';
            expect(getCheckoutGraceHours()).toBe(24);

            process.env.ADJUST_REQUEST_MAX_DAYS = '0';
            expect(getAdjustRequestMaxDays()).toBe(7);
        });

        it('BUG FIX: Huge numbers should fallback to default', () => {
            process.env.CHECKOUT_GRACE_HOURS = '1000000';
            expect(getCheckoutGraceHours()).toBe(24); // Falls back to default

            process.env.ADJUST_REQUEST_MAX_DAYS = '999999';
            expect(getAdjustRequestMaxDays()).toBe(7); // Falls back to default
        });
    });
});
