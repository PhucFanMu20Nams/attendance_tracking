/**
 * DashboardPage Integration Tests
 * 
 * Test Design: State Transition Testing + Decision Table (ISTQB)
 * Test Type: Integration
 * Priority: HIGH
 * ISO 25010: Functional Suitability, Usability
 * 
 * Coverage:
 * - Not checked in → Check-in button visible
 * - Working → Check-out button visible
 * - Done → completion message
 * - Check-in/Check-out actions
 * - Loading and error states
 * 
 * IMPORTANT: All dates are DYNAMIC to avoid "flaky tests"
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import DashboardPage from '../../src/pages/DashboardPage';
import client from '../../src/api/client';

// Mock API client
vi.mock('../../src/api/client');

// Mock useAuth
vi.mock('../../src/context/AuthContext', () => ({
    useAuth: vi.fn(() => ({
        user: { _id: '1', name: 'Employee', role: 'EMPLOYEE' },
        token: 'test-token',
        loading: false,
    })),
}));

describe('DashboardPage - Integration Tests', () => {
    // =====================================================
    // DYNAMIC DATE HELPERS - Prevents "flaky tests"
    // =====================================================

    // Get today's date string in YYYY-MM-DD format (GMT+7)
    const getTodayStr = () => new Date().toLocaleDateString('sv-SE', {
        timeZone: 'Asia/Ho_Chi_Minh',
    });

    // Get ISO string for a specific time TODAY (GMT+7)
    const getTodayIsoAt = (hour, minute) => {
        const today = getTodayStr();
        const pad = (n) => String(n).padStart(2, '0');
        return `${today}T${pad(hour)}:${pad(minute)}:00+07:00`;
    };

    // Current values for this test run
    const today = getTodayStr();
    const currentMonth = today.slice(0, 7);

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('1. Initial States', () => {
        it('[DASH-01] Shows loading spinner while fetching attendance', async () => {
            // Never resolve the promise
            client.get.mockImplementation(() => new Promise(() => { }));

            render(
                <MemoryRouter>
                    <DashboardPage />
                </MemoryRouter>
            );

            // Should show spinner
            expect(screen.getByRole('status')).toBeInTheDocument();
        });

        it('[DASH-02] NOT_CHECKED_IN state shows check-in button', async () => {
            client.get.mockResolvedValue({
                data: { items: [] } // No attendance record
            });

            render(
                <MemoryRouter>
                    <DashboardPage />
                </MemoryRouter>
            );

            // Wait for loading to complete
            await waitFor(() => {
                expect(screen.queryByRole('status')).not.toBeInTheDocument();
            });

            // Check-in button visible
            expect(screen.getByRole('button', { name: /check-in/i })).toBeInTheDocument();

            // Status badge
            expect(screen.getByText(/chưa check-in/i)).toBeInTheDocument();
        });

        it('[DASH-03] WORKING state shows check-out button', async () => {
            // DYNAMIC: Use today's date for both date and checkInAt
            client.get.mockResolvedValue({
                data: {
                    items: [{
                        date: today,                           // Dynamic date
                        checkInAt: getTodayIsoAt(8, 30),       // Dynamic: 08:30 today
                        checkOutAt: null,
                        lateMinutes: 0,
                        workMinutes: 120,
                        otMinutes: 0,
                    }]
                }
            });

            render(
                <MemoryRouter>
                    <DashboardPage />
                </MemoryRouter>
            );

            await waitFor(() => {
                expect(screen.queryByRole('status')).not.toBeInTheDocument();
            });

            // Check-out button visible
            expect(screen.getByRole('button', { name: /check-out/i })).toBeInTheDocument();

            // Status badge - working
            expect(screen.getByText(/đang làm việc/i)).toBeInTheDocument();

            // Check-in time displayed
            expect(screen.getByText('08:30')).toBeInTheDocument();
        });

        it('[DASH-04] DONE state shows completion message', async () => {
            // DYNAMIC dates
            client.get.mockResolvedValue({
                data: {
                    items: [{
                        date: today,
                        checkInAt: getTodayIsoAt(8, 30),      // 08:30 today
                        checkOutAt: getTodayIsoAt(17, 30),   // 17:30 today
                        lateMinutes: 0,
                        workMinutes: 480,
                        otMinutes: 0,
                    }]
                }
            });

            render(
                <MemoryRouter>
                    <DashboardPage />
                </MemoryRouter>
            );

            await waitFor(() => {
                expect(screen.queryByRole('status')).not.toBeInTheDocument();
            });

            // Completion message
            expect(screen.getByText(/bạn đã hoàn thành ngày làm việc/i)).toBeInTheDocument();

            // Status badge - done
            expect(screen.getByText(/đã check-out/i)).toBeInTheDocument();

            // Both times displayed
            expect(screen.getByText('08:30')).toBeInTheDocument();
            expect(screen.getByText('17:30')).toBeInTheDocument();
        });
    });

    describe('2. Check-in Action', () => {
        it('[DASH-05] Check-in button triggers API and RELOADS data', async () => {
            const user = userEvent.setup();

            // Initial: not checked in
            client.get.mockResolvedValueOnce({ data: { items: [] } });

            // After check-in: working (refetch response)
            client.get.mockResolvedValueOnce({
                data: {
                    items: [{
                        date: today,
                        checkInAt: getTodayIsoAt(8, 45),  // Dynamic
                        checkOutAt: null,
                    }]
                }
            });

            client.post.mockResolvedValue({ data: { message: 'Checked in' } });

            render(
                <MemoryRouter>
                    <DashboardPage />
                </MemoryRouter>
            );

            // Wait for initial load
            await waitFor(() => {
                expect(screen.getByRole('button', { name: /check-in/i })).toBeInTheDocument();
            });

            // Click check-in
            await user.click(screen.getByRole('button', { name: /check-in/i }));

            // API called correctly
            await waitFor(() => {
                expect(client.post).toHaveBeenCalledWith('/attendance/check-in');
            });

            // VERIFY REFETCH: GET should be called twice (initial + after action)
            await waitFor(() => {
                expect(client.get).toHaveBeenCalledTimes(2);
            });

            // UI updates to show check-out button
            await waitFor(() => {
                expect(screen.getByRole('button', { name: /check-out/i })).toBeInTheDocument();
            });
        });

        it('[DASH-06] Check-in error displays alert', async () => {
            const user = userEvent.setup();

            client.get.mockResolvedValue({ data: { items: [] } });
            client.post.mockRejectedValue({
                response: { data: { message: 'Already checked in today' } }
            });

            render(
                <MemoryRouter>
                    <DashboardPage />
                </MemoryRouter>
            );

            await waitFor(() => {
                expect(screen.getByRole('button', { name: /check-in/i })).toBeInTheDocument();
            });

            await user.click(screen.getByRole('button', { name: /check-in/i }));

            // Error alert shown
            const alert = await screen.findByRole('alert');
            expect(alert).toHaveTextContent('Already checked in today');
        });
    });

    describe('3. Check-out Action', () => {
        it('[DASH-07] Check-out button triggers API and RELOADS data', async () => {
            const user = userEvent.setup();

            // Initial: working
            client.get.mockResolvedValueOnce({
                data: {
                    items: [{
                        date: today,
                        checkInAt: getTodayIsoAt(8, 30),
                        checkOutAt: null,
                    }]
                }
            });

            // After check-out: done
            client.get.mockResolvedValueOnce({
                data: {
                    items: [{
                        date: today,
                        checkInAt: getTodayIsoAt(8, 30),
                        checkOutAt: getTodayIsoAt(17, 30),
                    }]
                }
            });

            client.post.mockResolvedValue({ data: { message: 'Checked out' } });

            render(
                <MemoryRouter>
                    <DashboardPage />
                </MemoryRouter>
            );

            await waitFor(() => {
                expect(screen.getByRole('button', { name: /check-out/i })).toBeInTheDocument();
            });

            await user.click(screen.getByRole('button', { name: /check-out/i }));

            await waitFor(() => {
                expect(client.post).toHaveBeenCalledWith('/attendance/check-out');
            });

            // VERIFY REFETCH
            await waitFor(() => {
                expect(client.get).toHaveBeenCalledTimes(2);
            });

            // UI updates to show completion
            await waitFor(() => {
                expect(screen.getByText(/bạn đã hoàn thành ngày làm việc/i)).toBeInTheDocument();
            });
        });
    });

    describe('4. Data Display', () => {
        it('[DASH-08] Late minutes displayed when checked in late', async () => {
            client.get.mockResolvedValue({
                data: {
                    items: [{
                        date: today,
                        checkInAt: getTodayIsoAt(9, 0),  // 09:00 (late)
                        checkOutAt: null,
                        lateMinutes: 15,
                        workMinutes: 60,
                        otMinutes: 0,
                    }]
                }
            });

            render(
                <MemoryRouter>
                    <DashboardPage />
                </MemoryRouter>
            );

            await waitFor(() => {
                expect(screen.getByText('15 phút')).toBeInTheDocument();
            });

            // Should show late section
            expect(screen.getByText(/đi muộn/i)).toBeInTheDocument();
        });

        it('[DASH-09] OT minutes displayed when working overtime', async () => {
            client.get.mockResolvedValue({
                data: {
                    items: [{
                        date: today,
                        checkInAt: getTodayIsoAt(8, 30),
                        checkOutAt: getTodayIsoAt(19, 30),  // 19:30 (overtime)
                        lateMinutes: 0,
                        workMinutes: 540,
                        otMinutes: 60,
                    }]
                }
            });

            render(
                <MemoryRouter>
                    <DashboardPage />
                </MemoryRouter>
            );

            await waitFor(() => {
                expect(screen.getByText('60 phút')).toBeInTheDocument();
            });

            // OT section visible
            expect(screen.getByText(/ot/i)).toBeInTheDocument();
        });
    });

    describe('5. Error Handling', () => {
        it('[DASH-10] API error shows alert with dismiss button', async () => {
            const user = userEvent.setup();

            client.get.mockRejectedValue({
                response: { data: { message: 'Server error' } }
            });

            render(
                <MemoryRouter>
                    <DashboardPage />
                </MemoryRouter>
            );

            const alert = await screen.findByRole('alert');
            expect(alert).toHaveTextContent('Server error');

            // Dismiss button works
            const dismissButton = screen.getByRole('button', { name: /dismiss/i });
            await user.click(dismissButton);

            await waitFor(() => {
                expect(screen.queryByRole('alert')).not.toBeInTheDocument();
            });
        });
    });
});
