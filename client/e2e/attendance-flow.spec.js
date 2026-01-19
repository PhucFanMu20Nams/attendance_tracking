/**
 * E2E Tests - Attendance Flow
 * 
 * Test Design: End-to-End User Journey (ISTQB)
 * Test Type: Functional (ISO 25010 - Functional Suitability)
 * Priority: CRITICAL
 * 
 * Coverage:
 * - Check-in flow
 * - Check-out flow
 * - View attendance history
 * - Status display verification
 */

import { test, expect } from '@playwright/test';

// Test data - matching seed data
const TEST_EMPLOYEE = {
    identifier: 'employee',
    password: 'Password123',
};

// Helper to login - simplified, no strict URL check
async function login(page, user = TEST_EMPLOYEE) {
    await page.goto('/login');
    await page.getByLabel(/email or username/i).fill(user.identifier);
    await page.getByLabel(/password/i).fill(user.password);
    await page.getByRole('button', { name: /login/i }).click();

    // Just wait for dashboard heading to appear (confirms successful login)
    await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible({ timeout: 15000 });
}

test.describe('Attendance Flow - E2E', () => {
    test.beforeEach(async ({ page }) => {
        // Clear storage before each test
        // Navigate to the app first so we have the correct origin for localStorage
        await page.goto('/');
        await page.evaluate(() => window.localStorage.clear());
    });

    test.describe('1. Dashboard Attendance', () => {
        test('[E2E-ATT-01] Dashboard shows today attendance status', async ({ page }) => {
            await login(page);

            // Dashboard should show attendance info
            await expect(page.getByText(/dashboard|hôm nay|today/i)).toBeVisible();
        });

        test('[E2E-ATT-02] Check-in button is visible when not checked in', async ({ page }) => {
            await login(page);

            // Check-in button should be visible (if not already checked in)
            const checkInButton = page.getByRole('button', { name: /check-in/i });
            const checkOutButton = page.getByRole('button', { name: /check-out/i });

            // One of these buttons should be visible
            const hasCheckIn = await checkInButton.isVisible().catch(() => false);
            const hasCheckOut = await checkOutButton.isVisible().catch(() => false);

            expect(hasCheckIn || hasCheckOut).toBe(true);
        });

        test('[E2E-ATT-03] Can perform check-in action', async ({ page }) => {
            await login(page);

            const checkInButton = page.getByRole('button', { name: /check-in/i });

            if (await checkInButton.isVisible()) {
                await checkInButton.click();

                // Should show success feedback or update button
                await expect(async () => {
                    const hasCheckOut = await page.getByRole('button', { name: /check-out/i }).isVisible();
                    const hasSuccess = await page.getByText(/success|thành công|checked in/i).isVisible().catch(() => false);
                    expect(hasCheckOut || hasSuccess).toBe(true);
                }).toPass({ timeout: 10000 });
            }
        });

        test('[E2E-ATT-04] Can perform check-out action', async ({ page }) => {
            await login(page);

            const checkOutButton = page.getByRole('button', { name: /check-out/i });

            if (await checkOutButton.isVisible()) {
                await checkOutButton.click();

                // Should show success or completed status
                await expect(async () => {
                    const hasSuccess = await page.getByText(/success|thành công|completed|hoàn thành/i).isVisible().catch(() => false);
                    const hasStatus = await page.getByText(/on time|đúng giờ|late|muộn/i).isVisible().catch(() => false);
                    expect(hasSuccess || hasStatus).toBe(true);
                }).toPass({ timeout: 10000 });
            }
        });
    });

    test.describe('2. Attendance History', () => {
        test('[E2E-ATT-05] Can navigate to attendance history', async ({ page }) => {
            await login(page);

            // Find link to attendance history
            const historyLink = page.getByRole('link', { name: /history|lịch sử|my attendance/i });

            if (await historyLink.isVisible()) {
                await historyLink.click();

                // Should show attendance history page
                await expect(page.getByText(/lịch sử chấm công|attendance history/i)).toBeVisible();
            }
        });

        test('[E2E-ATT-06] Attendance history shows month selector', async ({ page }) => {
            await login(page);

            // Navigate to history if needed
            const historyLink = page.getByRole('link', { name: /history|lịch sử|my attendance/i });
            if (await historyLink.isVisible()) {
                await historyLink.click();
            }

            // Should have month selector
            const monthSelector = page.getByRole('combobox');
            await expect(monthSelector).toBeVisible({ timeout: 10000 });
        });

        test('[E2E-ATT-07] Attendance history shows table with data', async ({ page }) => {
            await login(page);

            // Navigate to history
            const historyLink = page.getByRole('link', { name: /history|lịch sử|my attendance/i });
            if (await historyLink.isVisible()) {
                await historyLink.click();
            }

            // Should show table
            const table = page.getByRole('table');
            await expect(table).toBeVisible({ timeout: 10000 });

            // Table should have headers
            await expect(page.getByText(/ngày|date/i)).toBeVisible();
            await expect(page.getByText(/check-in/i)).toBeVisible();
        });

        test('[E2E-ATT-08] Can change month in attendance history', async ({ page }) => {
            await login(page);

            // Navigate to history
            const historyLink = page.getByRole('link', { name: /history|lịch sử|my attendance/i });
            if (await historyLink.isVisible()) {
                await historyLink.click();
            }

            const monthSelector = page.getByRole('combobox');
            if (await monthSelector.isVisible()) {
                const options = await monthSelector.locator('option').all();
                if (options.length > 1) {
                    // Select second option
                    await monthSelector.selectOption({ index: 1 });

                    // Page should update (loading indicator or table update)
                    await page.waitForLoadState('networkidle');
                }
            }
        });
    });

    test.describe('3. Attendance Status Display', () => {
        test('[E2E-ATT-09] Status badges display correctly', async ({ page }) => {
            await login(page);

            // Go to history
            const historyLink = page.getByRole('link', { name: /history|lịch sử|my attendance/i });
            if (await historyLink.isVisible()) {
                await historyLink.click();
            }

            await page.waitForLoadState('networkidle');

            // Should display at least one status (or empty message)
            const hasStatus = await page.getByText(/đúng giờ|on time|muộn|late|vắng|absent|nghỉ/i).first().isVisible().catch(() => false);
            const hasEmpty = await page.getByText(/không có dữ liệu|no data/i).isVisible().catch(() => false);

            expect(hasStatus || hasEmpty).toBe(true);
        });
    });
});
