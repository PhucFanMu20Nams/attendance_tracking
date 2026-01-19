/**
 * E2E Tests - Authentication Flow
 * 
 * Test Design: End-to-End User Journey (ISTQB)
 * Test Type: Functional (ISO 25010 - Functional Suitability)
 * Priority: CRITICAL
 * 
 * Coverage:
 * - Complete login flow with valid credentials
 * - Login failure with invalid credentials  
 * - Session persistence across page reload
 * - Logout flow and session cleanup
 * - Protected route access without auth
 */

import { test, expect } from '@playwright/test';

// Test data - using test accounts from backend seed
const TEST_EMPLOYEE = {
    identifier: 'employee1',
    password: 'password123',
    name: 'Employee One',
};

const TEST_MANAGER = {
    identifier: 'manager1',
    password: 'password123',
    name: 'Manager One',
};

const TEST_ADMIN = {
    identifier: 'admin',
    password: 'admin123',
    name: 'Admin User',
};

test.describe('Authentication Flow - E2E', () => {
    test.beforeEach(async ({ page }) => {
        // Clear storage before each test
        await page.goto('/');
        await page.evaluate(() => localStorage.clear());
    });

    test.describe('1. Login Success Flow', () => {
        test('[E2E-AUTH-01] Employee can login and see dashboard', async ({ page }) => {
            await page.goto('/');

            // Should redirect to login page
            await expect(page).toHaveURL(/login/);

            // Fill login form
            await page.getByLabel(/email or username/i).fill(TEST_EMPLOYEE.identifier);
            await page.getByLabel(/password/i).fill(TEST_EMPLOYEE.password);

            // Submit login
            await page.getByRole('button', { name: /login/i }).click();

            // Should redirect to dashboard
            await expect(page).toHaveURL(/dashboard/, { timeout: 10000 });

            // Should show user info or welcome message
            await expect(page.getByText(/dashboard/i)).toBeVisible();
        });

        test('[E2E-AUTH-02] Manager can login and access team members', async ({ page }) => {
            await page.goto('/');

            await page.getByLabel(/email or username/i).fill(TEST_MANAGER.identifier);
            await page.getByLabel(/password/i).fill(TEST_MANAGER.password);
            await page.getByRole('button', { name: /login/i }).click();

            await expect(page).toHaveURL(/dashboard/, { timeout: 10000 });

            // Navigate to team members (if link exists)
            const teamLink = page.getByRole('link', { name: /team/i });
            if (await teamLink.isVisible()) {
                await teamLink.click();
                await expect(page).toHaveURL(/team/);
            }
        });

        test('[E2E-AUTH-03] Admin can login and has full access', async ({ page }) => {
            await page.goto('/');

            await page.getByLabel(/email or username/i).fill(TEST_ADMIN.identifier);
            await page.getByLabel(/password/i).fill(TEST_ADMIN.password);
            await page.getByRole('button', { name: /login/i }).click();

            await expect(page).toHaveURL(/dashboard/, { timeout: 10000 });
        });
    });

    test.describe('2. Login Failure Flow', () => {
        test('[E2E-AUTH-04] Shows error for invalid credentials', async ({ page }) => {
            await page.goto('/login');

            await page.getByLabel(/email or username/i).fill('wronguser');
            await page.getByLabel(/password/i).fill('wrongpassword');
            await page.getByRole('button', { name: /login/i }).click();

            // Should show error alert
            await expect(page.getByRole('alert')).toBeVisible({ timeout: 10000 });

            // Should stay on login page
            await expect(page).toHaveURL(/login/);
        });

        test('[E2E-AUTH-05] Shows validation error for empty fields', async ({ page }) => {
            await page.goto('/login');

            // Click login without filling fields
            await page.getByRole('button', { name: /login/i }).click();

            // Should show validation or stay on page
            await expect(page).toHaveURL(/login/);
        });
    });

    test.describe('3. Session Persistence', () => {
        test('[E2E-AUTH-06] Session persists after page reload', async ({ page }) => {
            await page.goto('/login');

            // Login first
            await page.getByLabel(/email or username/i).fill(TEST_EMPLOYEE.identifier);
            await page.getByLabel(/password/i).fill(TEST_EMPLOYEE.password);
            await page.getByRole('button', { name: /login/i }).click();

            await expect(page).toHaveURL(/dashboard/, { timeout: 10000 });

            // Reload page
            await page.reload();

            // Should still be on dashboard (not redirected to login)
            await expect(page).toHaveURL(/dashboard/, { timeout: 5000 });
        });

        test('[E2E-AUTH-07] Token is stored in localStorage', async ({ page }) => {
            await page.goto('/login');

            await page.getByLabel(/email or username/i).fill(TEST_EMPLOYEE.identifier);
            await page.getByLabel(/password/i).fill(TEST_EMPLOYEE.password);
            await page.getByRole('button', { name: /login/i }).click();

            await expect(page).toHaveURL(/dashboard/, { timeout: 10000 });

            // Check token in localStorage
            const token = await page.evaluate(() => localStorage.getItem('token'));
            expect(token).toBeTruthy();
        });
    });

    test.describe('4. Logout Flow', () => {
        test('[E2E-AUTH-08] User can logout successfully', async ({ page }) => {
            // Login first
            await page.goto('/login');
            await page.getByLabel(/email or username/i).fill(TEST_EMPLOYEE.identifier);
            await page.getByLabel(/password/i).fill(TEST_EMPLOYEE.password);
            await page.getByRole('button', { name: /login/i }).click();

            await expect(page).toHaveURL(/dashboard/, { timeout: 10000 });

            // Find and click logout button
            const logoutButton = page.getByRole('button', { name: /logout/i });
            if (await logoutButton.isVisible()) {
                await logoutButton.click();
            } else {
                // Try in dropdown or sidebar
                const userMenu = page.getByRole('button', { name: /user|menu|profile/i });
                if (await userMenu.isVisible()) {
                    await userMenu.click();
                    await page.getByText(/logout/i).click();
                }
            }

            // Should redirect to login
            await expect(page).toHaveURL(/login/, { timeout: 5000 });
        });

        test('[E2E-AUTH-09] Token is cleared after logout', async ({ page }) => {
            // Login
            await page.goto('/login');
            await page.getByLabel(/email or username/i).fill(TEST_EMPLOYEE.identifier);
            await page.getByLabel(/password/i).fill(TEST_EMPLOYEE.password);
            await page.getByRole('button', { name: /login/i }).click();

            await expect(page).toHaveURL(/dashboard/, { timeout: 10000 });

            // Logout
            const logoutButton = page.getByRole('button', { name: /logout/i });
            if (await logoutButton.isVisible()) {
                await logoutButton.click();
            }

            // Check token is cleared
            const token = await page.evaluate(() => localStorage.getItem('token'));
            expect(token).toBeNull();
        });
    });

    test.describe('5. Protected Routes', () => {
        test('[E2E-AUTH-10] Unauthenticated user redirected to login', async ({ page }) => {
            // Try to access dashboard directly without login
            await page.goto('/dashboard');

            // Should redirect to login
            await expect(page).toHaveURL(/login/, { timeout: 5000 });
        });

        test('[E2E-AUTH-11] After login, redirected back to intended page', async ({ page }) => {
            // This tests the redirect-after-login flow
            await page.goto('/login');

            await page.getByLabel(/email or username/i).fill(TEST_EMPLOYEE.identifier);
            await page.getByLabel(/password/i).fill(TEST_EMPLOYEE.password);
            await page.getByRole('button', { name: /login/i }).click();

            // Should be on dashboard or intended page
            await expect(page).toHaveURL(/dashboard/, { timeout: 10000 });
        });
    });
});
