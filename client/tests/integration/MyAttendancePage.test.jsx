/**
 * MyAttendancePage Integration Tests
 * 
 * Test Design: Boundary Value Analysis + State Transition (ISTQB)
 * Test Type: Integration
 * Priority: MEDIUM
 * ISO 25010: Functional Suitability, Usability
 * 
 * Coverage:
 * - Month selector functionality
 * - Table rendering with attendance data
 * - Status badges based on date comparison
 * - Loading and empty states
 * - Timezone handling (GMT+7)
 * 
 * ROBUSTNESS:
 * - Uses vi.useFakeTimers({ shouldAdvanceTime: true }) to freeze date
 *   while allowing async operations to work
 * - All date comparisons are deterministic
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import MyAttendancePage from '../../src/pages/MyAttendancePage';
import client from '../../src/api/client';

// Mock API client
vi.mock('../../src/api/client');

// Mock useAuth (not directly used but may be needed by Layout)
vi.mock('../../src/context/AuthContext', () => ({
    useAuth: vi.fn(() => ({
        user: { _id: '1', name: 'Employee', role: 'EMPLOYEE' },
        token: 'test-token',
        loading: false,
    })),
}));

describe('MyAttendancePage - Integration Tests', () => {
    // =====================================================
    // FROZEN DATE SETUP
    // =====================================================
    // We set "today" to 2026-01-15 for deterministic date comparisons
    // Using shouldAdvanceTime: true allows async operations to work

    const FROZEN_DATE = new Date('2026-01-15T10:00:00+07:00');
    const frozenToday = '2026-01-15';
    const frozenMonth = '2026-01';

    beforeEach(() => {
        vi.clearAllMocks();

        // Use fake timers with auto-advance to allow async to work
        vi.useFakeTimers({ shouldAdvanceTime: true });
        vi.setSystemTime(FROZEN_DATE);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('1. Page Rendering', () => {
        it('[ATT-01] Shows loading spinner while fetching', async () => {
            client.get.mockImplementation(() => new Promise(() => { }));

            render(
                <MemoryRouter>
                    <MyAttendancePage />
                </MemoryRouter>
            );

            expect(screen.getByRole('status')).toBeInTheDocument();
        });

        it('[ATT-02] Renders page title and month selector', async () => {
            client.get.mockResolvedValue({ data: { items: [] } });

            render(
                <MemoryRouter>
                    <MyAttendancePage />
                </MemoryRouter>
            );

            await waitFor(() => {
                expect(screen.queryByRole('status')).not.toBeInTheDocument();
            });

            // Page title (Vietnamese)
            expect(screen.getByText(/lịch sử chấm công/i)).toBeInTheDocument();

            // Month selector exists
            expect(screen.getByRole('combobox')).toBeInTheDocument();
        });

        it('[ATT-03] Renders attendance table with data', async () => {
            client.get.mockResolvedValue({
                data: {
                    items: [
                        {
                            date: '2026-01-10',
                            checkInAt: '2026-01-10T08:30:00+07:00',
                            checkOutAt: '2026-01-10T17:30:00+07:00',
                            status: 'ON_TIME',
                            lateMinutes: 0,
                            workMinutes: 480,
                            otMinutes: 0,
                        },
                        {
                            date: '2026-01-11',
                            checkInAt: '2026-01-11T09:00:00+07:00',
                            checkOutAt: '2026-01-11T17:30:00+07:00',
                            status: 'LATE',
                            lateMinutes: 15,
                            workMinutes: 465,
                            otMinutes: 0,
                        },
                    ]
                }
            });

            render(
                <MemoryRouter>
                    <MyAttendancePage />
                </MemoryRouter>
            );

            await waitFor(() => {
                expect(screen.getByText(/đúng giờ/i)).toBeInTheDocument();
            });

            // Table headers (Vietnamese)
            expect(screen.getByText('Ngày')).toBeInTheDocument();
            expect(screen.getByText('Check-in')).toBeInTheDocument();
            expect(screen.getByText('Check-out')).toBeInTheDocument();
            expect(screen.getByText('Trạng thái')).toBeInTheDocument();

            // Data rows - times may appear multiple times
            expect(screen.getAllByText('08:30').length).toBeGreaterThan(0);
            expect(screen.getAllByText('17:30').length).toBeGreaterThan(0);

            // Late minutes displayed
            expect(screen.getByText('15 phút')).toBeInTheDocument();
        });
    });

    describe('2. Month Selector', () => {
        it('[ATT-04] Changing month fetches new data', async () => {
            const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

            client.get.mockResolvedValue({ data: { items: [] } });

            render(
                <MemoryRouter>
                    <MyAttendancePage />
                </MemoryRouter>
            );

            await waitFor(() => {
                expect(screen.queryByRole('status')).not.toBeInTheDocument();
            });

            // Clear initial call count
            client.get.mockClear();
            client.get.mockResolvedValue({ data: { items: [] } });

            // Get month selector
            const selector = screen.getByRole('combobox');

            // Change selection to previous month
            await user.selectOptions(selector, selector.options[1].value);

            await waitFor(() => {
                expect(client.get).toHaveBeenCalledTimes(1);
            });

            // Should call with different month (2025-12)
            const prevMonth = selector.options[1].value;
            expect(client.get).toHaveBeenCalledWith(
                `/attendance/me?month=${prevMonth}`,
                expect.anything()
            );
        });

        it('[ATT-05] Month selector has 12 months options', async () => {
            client.get.mockResolvedValue({ data: { items: [] } });

            render(
                <MemoryRouter>
                    <MyAttendancePage />
                </MemoryRouter>
            );

            await waitFor(() => {
                expect(screen.queryByRole('status')).not.toBeInTheDocument();
            });

            const selector = screen.getByRole('combobox');
            expect(selector.options.length).toBe(12);
        });

        it('[ATT-06] Default month is current month (frozen: 2026-01)', async () => {
            client.get.mockResolvedValue({ data: { items: [] } });

            render(
                <MemoryRouter>
                    <MyAttendancePage />
                </MemoryRouter>
            );

            await waitFor(() => {
                expect(screen.queryByRole('status')).not.toBeInTheDocument();
            });

            const selector = screen.getByRole('combobox');
            expect(selector.value).toBe(frozenMonth);
        });
    });

    describe('3. Status Badges', () => {
        it('[ATT-07] Different statuses show correct Vietnamese labels', async () => {
            client.get.mockResolvedValue({
                data: {
                    items: [
                        { date: '2026-01-05', status: 'ON_TIME', checkInAt: '2026-01-05T08:30:00+07:00' },
                        { date: '2026-01-06', status: 'LATE', checkInAt: '2026-01-06T09:00:00+07:00' },
                        { date: '2026-01-07', status: 'MISSING_CHECKOUT', checkInAt: '2026-01-07T08:30:00+07:00' },
                        { date: '2026-01-08', status: 'ABSENT' },
                        { date: '2026-01-09', status: 'WEEKEND_OR_HOLIDAY' },
                    ]
                }
            });

            render(
                <MemoryRouter>
                    <MyAttendancePage />
                </MemoryRouter>
            );

            await waitFor(() => {
                // Multiple statuses displayed
                expect(screen.getAllByText(/đúng giờ/i).length).toBeGreaterThan(0);
                expect(screen.getAllByText(/đi muộn/i).length).toBeGreaterThan(0);
                expect(screen.getAllByText(/thiếu checkout/i).length).toBeGreaterThan(0);
                expect(screen.getAllByText(/vắng mặt/i).length).toBeGreaterThan(0);
                expect(screen.getAllByText(/nghỉ/i).length).toBeGreaterThan(0);
            });
        });

        it('[ATT-08] Null status with future date shows "Chưa tới"', async () => {
            // FROZEN: today = 2026-01-15
            // futureDate = 2026-01-20 (5 days in future)
            const futureDate = '2026-01-20';

            client.get.mockResolvedValue({
                data: {
                    items: [
                        { date: futureDate, status: null },
                    ]
                }
            });

            render(
                <MemoryRouter>
                    <MyAttendancePage />
                </MemoryRouter>
            );

            await waitFor(() => {
                expect(screen.getByText(/chưa tới/i)).toBeInTheDocument();
            });
        });

        it('[ATT-08b] Null status with today shows "Chưa check-in"', async () => {
            // FROZEN: today = 2026-01-15
            client.get.mockResolvedValue({
                data: {
                    items: [
                        { date: frozenToday, status: null },
                    ]
                }
            });

            render(
                <MemoryRouter>
                    <MyAttendancePage />
                </MemoryRouter>
            );

            await waitFor(() => {
                expect(screen.getByText(/chưa check-in/i)).toBeInTheDocument();
            });
        });

        it('[ATT-08c] Null status with past date shows "Vắng mặt"', async () => {
            // FROZEN: today = 2026-01-15
            // pastDate = 2026-01-10 (5 days ago)
            const pastDate = '2026-01-10';

            client.get.mockResolvedValue({
                data: {
                    items: [
                        { date: pastDate, status: null },
                    ]
                }
            });

            render(
                <MemoryRouter>
                    <MyAttendancePage />
                </MemoryRouter>
            );

            await waitFor(() => {
                expect(screen.getByText(/vắng mặt/i)).toBeInTheDocument();
            });
        });
    });

    describe('4. Empty State', () => {
        it('[ATT-09] No data shows empty message', async () => {
            client.get.mockResolvedValue({ data: { items: [] } });

            render(
                <MemoryRouter>
                    <MyAttendancePage />
                </MemoryRouter>
            );

            await waitFor(() => {
                expect(screen.getByText(/không có dữ liệu chấm công/i)).toBeInTheDocument();
            });
        });
    });

    describe('5. Error Handling', () => {
        it('[ATT-10] API error shows error alert', async () => {
            client.get.mockRejectedValue({
                response: { data: { message: 'Failed to load' } }
            });

            render(
                <MemoryRouter>
                    <MyAttendancePage />
                </MemoryRouter>
            );

            const alert = await screen.findByRole('alert');
            expect(alert).toHaveTextContent('Failed to load');
        });

        it('[ATT-11] Error alert can be dismissed', async () => {
            const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

            client.get.mockRejectedValue({
                response: { data: { message: 'Error' } }
            });

            render(
                <MemoryRouter>
                    <MyAttendancePage />
                </MemoryRouter>
            );

            await screen.findByRole('alert');

            const dismissButton = screen.getByRole('button', { name: /dismiss/i });
            await user.click(dismissButton);

            await waitFor(() => {
                expect(screen.queryByRole('alert')).not.toBeInTheDocument();
            });
        });
    });

    describe('6. Data Display Formatting', () => {
        it('[ATT-12] Times displayed in GMT+7 format', async () => {
            client.get.mockResolvedValue({
                data: {
                    items: [
                        {
                            date: '2026-01-10',
                            checkInAt: '2026-01-10T08:30:00+07:00',
                            checkOutAt: '2026-01-10T17:45:00+07:00',
                            status: 'ON_TIME',
                        },
                    ]
                }
            });

            render(
                <MemoryRouter>
                    <MyAttendancePage />
                </MemoryRouter>
            );

            await waitFor(() => {
                expect(screen.getByText('08:30')).toBeInTheDocument();
                expect(screen.getByText('17:45')).toBeInTheDocument();
            });
        });

        it('[ATT-13] Missing check-in/out shows placeholder', async () => {
            client.get.mockResolvedValue({
                data: {
                    items: [
                        {
                            date: '2026-01-10',
                            checkInAt: null,
                            checkOutAt: null,
                            status: 'ABSENT',
                        },
                    ]
                }
            });

            render(
                <MemoryRouter>
                    <MyAttendancePage />
                </MemoryRouter>
            );

            await waitFor(() => {
                // Should show placeholder text for missing times
                const placeholders = screen.getAllByText('--:--');
                expect(placeholders.length).toBe(2); // check-in and check-out
            });
        });
    });
});
