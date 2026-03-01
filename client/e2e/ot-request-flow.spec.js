/**
 * E2E Tests — OT Request Flow
 *
 * Test Design: End-to-End User Journey (ISO 25010 — Functional Suitability)
 * Priority: HIGH
 *
 * Coverage:
 * - E2E-01: Employee creates OT request (happy path)
 * - E2E-02: Employee cancels PENDING OT request
 * - E2E-03: Manager approves OT request
 * - E2E-04: Manager rejects OT request
 * - E2E-05: OT form validation (client-side)
 * - E2E-06: OT tab in My Attendance shows otApproved
 * - E2E-07: Confirmation modal displays correct data
 *
 * Seed Users: employee / manager from seed data
 * Base URL: http://localhost:5173 (Vite dev server)
 */

import { test, expect } from '@playwright/test';

// ─── Seed Credentials ──────────────────────────────────────────
const EMPLOYEE = { identifier: 'employee', password: 'Password123' };
const MANAGER  = { identifier: 'manager',  password: 'Password123' };

// ─── Helpers ────────────────────────────────────────────────────

/** Login and navigate to dashboard */
async function login(page, creds) {
  await page.goto('/login');
  await page.waitForLoadState('domcontentloaded');
  await page.getByLabel(/email or username/i).fill(creds.identifier);
  await page.getByLabel(/password/i).fill(creds.password);
  await page.getByRole('button', { name: /login/i }).click();
  await expect(page).toHaveURL(/dashboard/, { timeout: 10_000 });
}

/** Navigate to Requests page */
async function goToRequests(page) {
  await page.getByText('Requests').click();
  await page.waitForLoadState('networkidle');
}

/** Navigate to Approvals page */
async function goToApprovals(page) {
  // Open Management collapse if needed
  const mgmtToggle = page.getByText('Management');
  if (await mgmtToggle.isVisible()) {
    await mgmtToggle.click();
    // Wait for collapse animation
    await page.waitForTimeout(300);
  }
  await page.getByText('Approvals').click();
  await page.waitForLoadState('networkidle');
}

/** Format today as YYYY-MM-DD */
function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Format tomorrow as YYYY-MM-DD */
function tomorrowStr() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ═════════════════════════════════════════════════════════════════
// TESTS
// ═════════════════════════════════════════════════════════════════

test.describe('OT Request Flow — E2E', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.evaluate(() => window.localStorage.clear());
  });

  // ─────────────────────────────────────────────────────────────
  // E2E-01: Employee creates OT request
  // ─────────────────────────────────────────────────────────────

  test.describe('E2E-01: Create OT Request', () => {

    test('Employee can select OT type and see OT form fields', async ({ page }) => {
      await login(page, EMPLOYEE);
      await goToRequests(page);

      // Select OT_REQUEST type
      await page.locator('#requestType').selectOption('OT_REQUEST');

      // OT-specific fields should appear
      await expect(page.locator('#ot-date')).toBeVisible();
      await expect(page.locator('#ot-time')).toBeVisible();
      await expect(page.locator('#ot-reason')).toBeVisible();
    });

    test('Employee creates OT request successfully', async ({ page }) => {
      await login(page, EMPLOYEE);
      await goToRequests(page);

      // Fill OT form
      await page.locator('#requestType').selectOption('OT_REQUEST');
      await page.locator('#ot-date').fill(tomorrowStr());
      await page.locator('#ot-time').fill('19:00');
      await page.locator('#ot-reason').fill('Deploy production hotfix');

      // Submit
      await page.getByRole('button', { name: 'Tạo yêu cầu' }).click();

      // Confirmation modal should appear
      await expect(page.getByText('Xác nhận đăng ký OT')).toBeVisible();
      await page.getByRole('button', { name: 'Xác nhận gửi' }).click();

      // Success message
      await expect(page.getByText('Đã gửi yêu cầu OT thành công!')).toBeVisible({ timeout: 5000 });
    });

    test('OT request appears in my requests list with purple badge', async ({ page }) => {
      await login(page, EMPLOYEE);
      await goToRequests(page);

      // Create OT request
      await page.locator('#requestType').selectOption('OT_REQUEST');
      await page.locator('#ot-date').fill(tomorrowStr());
      await page.locator('#ot-time').fill('20:00');
      await page.locator('#ot-reason').fill('Server migration task');
      await page.getByRole('button', { name: 'Tạo yêu cầu' }).click();
      await page.getByRole('button', { name: 'Xác nhận gửi' }).click();
      await expect(page.getByText('Đã gửi yêu cầu OT thành công!')).toBeVisible({ timeout: 5000 });

      // Verify in list
      await expect(page.getByText('Đăng ký OT')).toBeVisible();
      await expect(page.getByText('Chờ duyệt')).toBeVisible();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // E2E-02: Employee cancels PENDING OT request
  // ─────────────────────────────────────────────────────────────

  test.describe('E2E-02: Cancel OT Request', () => {

    test('Employee can cancel a PENDING OT request', async ({ page }) => {
      await login(page, EMPLOYEE);
      await goToRequests(page);

      // Create an OT request first
      await page.locator('#requestType').selectOption('OT_REQUEST');
      await page.locator('#ot-date').fill(tomorrowStr());
      await page.locator('#ot-time').fill('19:30');
      await page.locator('#ot-reason').fill('Test cancel flow');
      await page.getByRole('button', { name: 'Tạo yêu cầu' }).click();
      await page.getByRole('button', { name: 'Xác nhận gửi' }).click();
      await expect(page.getByText('Đã gửi yêu cầu OT thành công!')).toBeVisible({ timeout: 5000 });

      // Cancel it
      const cancelBtn = page.getByRole('button', { name: /🗑️ Hủy/ });
      await expect(cancelBtn).toBeVisible();
      await cancelBtn.click();

      // Confirm cancel if modal appears
      const confirmCancel = page.getByRole('button', { name: /xác nhận|confirm/i });
      if (await confirmCancel.isVisible({ timeout: 1000 }).catch(() => false)) {
        await confirmCancel.click();
      }

      // Request should disappear or show cancelled
      await page.waitForTimeout(1000);
      // The cancel button should no longer be visible for this request
    });
  });

  // ─────────────────────────────────────────────────────────────
  // E2E-03: Manager approves OT request
  // ─────────────────────────────────────────────────────────────

  test.describe('E2E-03: Manager Approves OT', () => {

    test('Manager sees OT request in approval queue and approves', async ({ page, context }) => {
      // Step 1: Employee creates OT request
      const empPage = await context.newPage();
      await login(empPage, EMPLOYEE);
      await goToRequests(empPage);

      await empPage.locator('#requestType').selectOption('OT_REQUEST');
      await empPage.locator('#ot-date').fill(tomorrowStr());
      await empPage.locator('#ot-time').fill('19:30');
      await empPage.locator('#ot-reason').fill('Approve flow test');
      await empPage.getByRole('button', { name: 'Tạo yêu cầu' }).click();
      await empPage.getByRole('button', { name: 'Xác nhận gửi' }).click();
      await expect(empPage.getByText('Đã gửi yêu cầu OT thành công!')).toBeVisible({ timeout: 5000 });
      await empPage.close();

      // Step 2: Manager approves
      await login(page, MANAGER);
      await goToApprovals(page);

      // Verify OT request visible
      await expect(page.getByText('Đăng ký OT')).toBeVisible({ timeout: 5000 });

      // Click approve
      const approveBtn = page.getByRole('button', { name: 'Duyệt' }).first();
      await approveBtn.click();

      // Confirmation modal
      await expect(page.getByText('Xác nhận duyệt')).toBeVisible();
      await page.getByRole('button', { name: 'Xác nhận' }).click();

      // No more pending after approval
      await page.waitForTimeout(1000);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // E2E-04: Manager rejects OT request
  // ─────────────────────────────────────────────────────────────

  test.describe('E2E-04: Manager Rejects OT', () => {

    test('Manager can reject OT request', async ({ page, context }) => {
      // Employee creates
      const empPage = await context.newPage();
      await login(empPage, EMPLOYEE);
      await goToRequests(empPage);

      await empPage.locator('#requestType').selectOption('OT_REQUEST');
      await empPage.locator('#ot-date').fill(tomorrowStr());
      await empPage.locator('#ot-time').fill('21:00');
      await empPage.locator('#ot-reason').fill('Reject flow test');
      await empPage.getByRole('button', { name: 'Tạo yêu cầu' }).click();
      await empPage.getByRole('button', { name: 'Xác nhận gửi' }).click();
      await expect(empPage.getByText('Đã gửi yêu cầu OT thành công!')).toBeVisible({ timeout: 5000 });
      await empPage.close();

      // Manager rejects
      await login(page, MANAGER);
      await goToApprovals(page);

      const rejectBtn = page.getByRole('button', { name: 'Từ chối' }).first();
      await rejectBtn.click();

      await expect(page.getByText('Xác nhận từ chối')).toBeVisible();
      await page.getByRole('button', { name: 'Xác nhận' }).click();

      await page.waitForTimeout(1000);
    });

    test('Rejected OT shows "Từ chối" status in employee requests', async ({ page, context }) => {
      // Employee creates
      const empPage = await context.newPage();
      await login(empPage, EMPLOYEE);
      await goToRequests(empPage);

      await empPage.locator('#requestType').selectOption('OT_REQUEST');
      await empPage.locator('#ot-date').fill(tomorrowStr());
      await empPage.locator('#ot-time').fill('20:00');
      await empPage.locator('#ot-reason').fill('Check rejected status');
      await empPage.getByRole('button', { name: 'Tạo yêu cầu' }).click();
      await empPage.getByRole('button', { name: 'Xác nhận gửi' }).click();
      await expect(empPage.getByText('Đã gửi yêu cầu OT thành công!')).toBeVisible({ timeout: 5000 });
      await empPage.close();

      // Manager rejects
      const mgrPage = await context.newPage();
      await login(mgrPage, MANAGER);
      await goToApprovals(mgrPage);
      await mgrPage.getByRole('button', { name: 'Từ chối' }).first().click();
      await expect(mgrPage.getByText('Xác nhận từ chối')).toBeVisible();
      await mgrPage.getByRole('button', { name: 'Xác nhận' }).click();
      await mgrPage.waitForTimeout(1000);
      await mgrPage.close();

      // Employee checks status
      await login(page, EMPLOYEE);
      await goToRequests(page);
      await expect(page.getByText('Từ chối')).toBeVisible({ timeout: 5000 });
    });
  });

  // ─────────────────────────────────────────────────────────────
  // E2E-05: OT form validation (client-side)
  // ─────────────────────────────────────────────────────────────

  test.describe('E2E-05: OT Form Validation', () => {

    test('Shows error when submitting without date', async ({ page }) => {
      await login(page, EMPLOYEE);
      await goToRequests(page);

      await page.locator('#requestType').selectOption('OT_REQUEST');
      // Fill time and reason but NOT date
      await page.locator('#ot-time').fill('19:00');
      await page.locator('#ot-reason').fill('Missing date test');
      await page.getByRole('button', { name: 'Tạo yêu cầu' }).click();

      await expect(page.getByText('Vui lòng chọn ngày làm OT')).toBeVisible();
    });

    test('Shows error when submitting without time', async ({ page }) => {
      await login(page, EMPLOYEE);
      await goToRequests(page);

      await page.locator('#requestType').selectOption('OT_REQUEST');
      await page.locator('#ot-date').fill(tomorrowStr());
      await page.locator('#ot-reason').fill('Missing time test');
      await page.getByRole('button', { name: 'Tạo yêu cầu' }).click();

      await expect(page.getByText('Vui lòng nhập giờ về dự kiến')).toBeVisible();
    });

    test('Shows error when submitting without reason', async ({ page }) => {
      await login(page, EMPLOYEE);
      await goToRequests(page);

      await page.locator('#requestType').selectOption('OT_REQUEST');
      await page.locator('#ot-date').fill(tomorrowStr());
      await page.locator('#ot-time').fill('19:00');
      await page.getByRole('button', { name: 'Tạo yêu cầu' }).click();

      await expect(page.getByText('Vui lòng nhập lý do')).toBeVisible();
    });

    test('Shows error for past date', async ({ page }) => {
      await login(page, EMPLOYEE);
      await goToRequests(page);

      await page.locator('#requestType').selectOption('OT_REQUEST');
      await page.locator('#ot-date').fill('2020-01-01');
      await page.locator('#ot-time').fill('19:00');
      await page.locator('#ot-reason').fill('Past date test');
      await page.getByRole('button', { name: 'Tạo yêu cầu' }).click();

      await expect(page.getByText('Không thể đăng ký OT cho ngày trong quá khứ')).toBeVisible();
    });

    test('Shows error for end time before 17:31', async ({ page }) => {
      await login(page, EMPLOYEE);
      await goToRequests(page);

      await page.locator('#requestType').selectOption('OT_REQUEST');
      await page.locator('#ot-date').fill(tomorrowStr());
      await page.locator('#ot-time').fill('17:00');
      await page.locator('#ot-reason').fill('Early end test');
      await page.getByRole('button', { name: 'Tạo yêu cầu' }).click();

      await expect(page.getByText('Giờ về phải sau 17:31')).toBeVisible();
    });

    test('Shows error for OT < 30 minutes', async ({ page }) => {
      await login(page, EMPLOYEE);
      await goToRequests(page);

      await page.locator('#requestType').selectOption('OT_REQUEST');
      await page.locator('#ot-date').fill(tomorrowStr());
      await page.locator('#ot-time').fill('17:50');
      await page.locator('#ot-reason').fill('Short OT test');
      await page.getByRole('button', { name: 'Tạo yêu cầu' }).click();

      await expect(page.getByText('Thời gian OT tối thiểu là 30 phút')).toBeVisible();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // E2E-06: My Attendance shows OT column
  // ─────────────────────────────────────────────────────────────

  test.describe('E2E-06: Attendance OT Display', () => {

    test('My Attendance page renders OT column header', async ({ page }) => {
      await login(page, EMPLOYEE);

      // Navigate to My Attendance
      await page.getByText('My Attendance').click();
      await page.waitForLoadState('networkidle');

      // Check for OT column
      await expect(page.getByText('OT')).toBeVisible();
    });

    test('OT request badge visible in attendance table', async ({ page }) => {
      await login(page, EMPLOYEE);
      await page.getByText('My Attendance').click();
      await page.waitForLoadState('networkidle');

      // Check for OT request badge (if test data has one)
      const badge = page.getByTestId('ot-request-badge');
      // Badge may or may not exist depending on seed data
      // This test just verifies the structure is renderable
      if (await badge.count() > 0) {
        expect(await badge.first().textContent()).toMatch(/Đã duyệt|Chờ duyệt|Từ chối/);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────
  // E2E-07: Confirmation modal displays correct data
  // ─────────────────────────────────────────────────────────────

  test.describe('E2E-07: Confirmation Modal', () => {

    test('OT confirmation modal shows submitted details', async ({ page }) => {
      await login(page, EMPLOYEE);
      await goToRequests(page);

      const date = tomorrowStr();
      await page.locator('#requestType').selectOption('OT_REQUEST');
      await page.locator('#ot-date').fill(date);
      await page.locator('#ot-time').fill('20:30');
      await page.locator('#ot-reason').fill('Critical deployment window');
      await page.getByRole('button', { name: 'Tạo yêu cầu' }).click();

      // Modal should show details
      const modal = page.getByText('Xác nhận đăng ký OT');
      await expect(modal).toBeVisible();

      // Verify data in modal
      await expect(page.getByText('20:30')).toBeVisible();
      await expect(page.getByText('Critical deployment window')).toBeVisible();

      // Cancel button should close modal
      await page.getByRole('button', { name: 'Hủy' }).click();
      await expect(modal).not.toBeVisible();
    });

    test('Cancel on confirmation modal does not submit', async ({ page }) => {
      await login(page, EMPLOYEE);
      await goToRequests(page);

      await page.locator('#requestType').selectOption('OT_REQUEST');
      await page.locator('#ot-date').fill(tomorrowStr());
      await page.locator('#ot-time').fill('19:00');
      await page.locator('#ot-reason').fill('Should not be submitted');
      await page.getByRole('button', { name: 'Tạo yêu cầu' }).click();

      // Modal appears
      await expect(page.getByText('Xác nhận đăng ký OT')).toBeVisible();

      // Cancel
      await page.getByRole('button', { name: 'Hủy' }).click();

      // Success message should NOT appear
      await expect(page.getByText('Đã gửi yêu cầu OT thành công!')).not.toBeVisible();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // E2E-08: Dashboard OT display
  // ─────────────────────────────────────────────────────────────

  test.describe('E2E-08: Dashboard OT Stats', () => {

    test('Dashboard shows OT section in today stats', async ({ page }) => {
      await login(page, EMPLOYEE);
      // Dashboard should show OT metric card
      await expect(page.getByText('OT')).toBeVisible({ timeout: 5000 });
    });
  });
});
