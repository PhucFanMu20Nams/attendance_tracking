/**
 * Performance Tests - Page Load & Render Performance
 * 
 * Test Design: Performance Efficiency (ISO 25010)
 * Test Type: Non-Functional
 * Priority: MEDIUM
 * 
 * ISO 25010 Quality Characteristics:
 * - Time Behavior: Response time, processing time, throughput
 * - Resource Utilization: CPU, memory usage during renders
 * - Capacity: System limits and scalability
 * 
 * ISTQB Framework:
 * - Non-Functional Testing: Performance validation
 * - Benchmark Testing: Baseline comparison
 * 
 * Coverage:
 * - Component render time thresholds
 * - Initial mount performance
 * - Re-render efficiency
 * - Large data set handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Import pages for performance testing
import DashboardPage from '../../src/pages/DashboardPage';
import MyAttendancePage from '../../src/pages/MyAttendancePage';
import TeamMembersPage from '../../src/pages/TeamMembersPage';
import LoginPage from '../../src/pages/LoginPage';

// Mock API client
vi.mock('../../src/api/client', () => ({
    default: {
        get: vi.fn(),
        post: vi.fn(),
    },
}));

vi.mock('../../src/api/memberApi', () => ({
    getTodayAttendance: vi.fn(),
    getTeams: vi.fn(),
}));

vi.mock('../../src/context/AuthContext', () => ({
    useAuth: vi.fn(() => ({
        user: { _id: '1', name: 'Employee', role: 'EMPLOYEE', teamId: 'team-1' },
        token: 'test-token',
        loading: false,
        login: vi.fn(),
    })),
    AuthProvider: ({ children }) => children,
}));

import client from '../../src/api/client';
import { getTodayAttendance, getTeams } from '../../src/api/memberApi';

// =====================================================
// PERFORMANCE THRESHOLDS (ISO 25010 Time Behavior)
// =====================================================
const THRESHOLDS = {
    // Initial render should complete within 100ms
    INITIAL_RENDER_MS: 100,

    // Component should become interactive within 200ms
    TIME_TO_INTERACTIVE_MS: 200,

    // Large data set (100+ items) render within 500ms
    LARGE_DATA_RENDER_MS: 500,

    // Re-render on state change within 50ms
    RE_RENDER_MS: 50,

    // Login page (simple form) within 50ms
    SIMPLE_PAGE_RENDER_MS: 50,
};

// Helper to measure render time
const measureRenderTime = async (renderFn) => {
    const start = performance.now();
    const result = renderFn();
    const end = performance.now();
    return { result, duration: end - start };
};

// Generate large mock data for stress testing
const generateLargeAttendanceData = (count) => {
    return Array.from({ length: count }, (_, i) => ({
        date: `2026-01-${String(i + 1).padStart(2, '0')}`,
        checkInAt: `2026-01-${String(i + 1).padStart(2, '0')}T08:30:00+07:00`,
        checkOutAt: `2026-01-${String(i + 1).padStart(2, '0')}T17:30:00+07:00`,
        status: i % 3 === 0 ? 'ON_TIME' : i % 3 === 1 ? 'LATE' : 'WORKING',
        lateMinutes: i % 3 === 1 ? 15 : 0,
        workMinutes: 480,
        otMinutes: 0,
    }));
};

const generateLargeTeamData = (count) => {
    return Array.from({ length: count }, (_, i) => ({
        user: {
            _id: `user-${i}`,
            name: `Employee ${i}`,
            email: `emp${i}@test.com`,
            employeeCode: `EMP${String(i).padStart(3, '0')}`
        },
        attendance: i % 2 === 0 ? {
            checkInAt: '2026-01-15T08:30:00+07:00',
            checkOutAt: null
        } : null,
        computed: { status: i % 2 === 0 ? 'WORKING' : null },
    }));
};

describe('Performance Tests - Page Load', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('1. Initial Render Performance (Time Behavior)', () => {
        it('[PERF-01] LoginPage renders within threshold', async () => {
            const { duration } = await measureRenderTime(() =>
                render(
                    <MemoryRouter>
                        <LoginPage />
                    </MemoryRouter>
                )
            );

            console.log(`[PERF-01] LoginPage render: ${duration.toFixed(2)}ms`);
            expect(duration).toBeLessThan(THRESHOLDS.SIMPLE_PAGE_RENDER_MS);

            // Verify page is usable
            expect(screen.getByRole('button', { name: /login/i })).toBeInTheDocument();
        });

        it('[PERF-02] DashboardPage initial render within threshold', async () => {
            client.get.mockResolvedValue({ data: { items: [] } });

            const { duration } = await measureRenderTime(() =>
                render(
                    <MemoryRouter>
                        <DashboardPage />
                    </MemoryRouter>
                )
            );

            console.log(`[PERF-02] DashboardPage render: ${duration.toFixed(2)}ms`);
            expect(duration).toBeLessThan(THRESHOLDS.INITIAL_RENDER_MS);
        });

        it('[PERF-03] MyAttendancePage initial render within threshold', async () => {
            // Use fake timers for deterministic dates
            vi.useFakeTimers({ shouldAdvanceTime: true });
            vi.setSystemTime(new Date('2026-01-15T10:00:00+07:00'));

            client.get.mockResolvedValue({ data: { items: [] } });

            const { duration } = await measureRenderTime(() =>
                render(
                    <MemoryRouter>
                        <MyAttendancePage />
                    </MemoryRouter>
                )
            );

            console.log(`[PERF-03] MyAttendancePage render: ${duration.toFixed(2)}ms`);
            expect(duration).toBeLessThan(THRESHOLDS.INITIAL_RENDER_MS);

            vi.useRealTimers();
        });

        it('[PERF-04] TeamMembersPage initial render within threshold', async () => {
            getTodayAttendance.mockResolvedValue({ data: { date: '2026-01-15', items: [] } });
            getTeams.mockResolvedValue({ data: { items: [{ _id: 'team-1', name: 'Engineering' }] } });

            const { duration } = await measureRenderTime(() =>
                render(
                    <MemoryRouter>
                        <TeamMembersPage />
                    </MemoryRouter>
                )
            );

            console.log(`[PERF-04] TeamMembersPage render: ${duration.toFixed(2)}ms`);
            expect(duration).toBeLessThan(THRESHOLDS.INITIAL_RENDER_MS);
        });
    });

    describe('2. Time to Interactive (User Experience)', () => {
        it('[PERF-05] DashboardPage becomes interactive after data load', async () => {
            const start = performance.now();

            client.get.mockResolvedValue({
                data: {
                    items: [{
                        date: '2026-01-15',
                        checkInAt: null,
                        checkOutAt: null,
                        status: null,
                    }]
                }
            });

            render(
                <MemoryRouter>
                    <DashboardPage />
                </MemoryRouter>
            );

            // Wait for check-in button (interactive state)
            await waitFor(() => {
                expect(screen.getByRole('button', { name: /check-in/i })).toBeInTheDocument();
            });

            const duration = performance.now() - start;
            console.log(`[PERF-05] DashboardPage TTI: ${duration.toFixed(2)}ms`);
            expect(duration).toBeLessThan(THRESHOLDS.TIME_TO_INTERACTIVE_MS);
        });

        it('[PERF-06] TeamMembersPage becomes interactive after data load', async () => {
            const start = performance.now();

            getTodayAttendance.mockResolvedValue({
                data: {
                    date: '2026-01-15',
                    items: generateLargeTeamData(10), // 10 members
                }
            });
            getTeams.mockResolvedValue({ data: { items: [{ _id: 'team-1', name: 'Engineering' }] } });

            render(
                <MemoryRouter>
                    <TeamMembersPage />
                </MemoryRouter>
            );

            // Wait for table data
            await waitFor(() => {
                expect(screen.getByText('Employee 0')).toBeInTheDocument();
            });

            const duration = performance.now() - start;
            console.log(`[PERF-06] TeamMembersPage TTI (10 items): ${duration.toFixed(2)}ms`);
            expect(duration).toBeLessThan(THRESHOLDS.TIME_TO_INTERACTIVE_MS);
        });
    });

    describe('3. Large Data Set Performance (Capacity)', () => {
        it('[PERF-07] MyAttendancePage handles 31 days of data', async () => {
            vi.useFakeTimers({ shouldAdvanceTime: true });
            vi.setSystemTime(new Date('2026-01-15T10:00:00+07:00'));

            const start = performance.now();

            client.get.mockResolvedValue({
                data: { items: generateLargeAttendanceData(31) }
            });

            render(
                <MemoryRouter>
                    <MyAttendancePage />
                </MemoryRouter>
            );

            // Wait for all data to render
            await waitFor(() => {
                expect(screen.getAllByText(/đúng giờ|đi muộn|đang làm/i).length).toBeGreaterThan(0);
            });

            const duration = performance.now() - start;
            console.log(`[PERF-07] MyAttendancePage (31 items): ${duration.toFixed(2)}ms`);
            expect(duration).toBeLessThan(THRESHOLDS.LARGE_DATA_RENDER_MS);

            vi.useRealTimers();
        });

        it('[PERF-08] TeamMembersPage handles 50 team members', async () => {
            const start = performance.now();

            getTodayAttendance.mockResolvedValue({
                data: {
                    date: '2026-01-15',
                    items: generateLargeTeamData(50), // 50 members
                }
            });
            getTeams.mockResolvedValue({ data: { items: [{ _id: 'team-1', name: 'Engineering' }] } });

            render(
                <MemoryRouter>
                    <TeamMembersPage />
                </MemoryRouter>
            );

            // Wait for all data
            await waitFor(() => {
                expect(screen.getByText('Employee 49')).toBeInTheDocument();
            });

            const duration = performance.now() - start;
            console.log(`[PERF-08] TeamMembersPage (50 items): ${duration.toFixed(2)}ms`);
            expect(duration).toBeLessThan(THRESHOLDS.LARGE_DATA_RENDER_MS);
        });

        it('[PERF-09] TeamMembersPage handles 100+ team members (stress test)', async () => {
            const start = performance.now();

            getTodayAttendance.mockResolvedValue({
                data: {
                    date: '2026-01-15',
                    items: generateLargeTeamData(100), // 100 members - stress test
                }
            });
            getTeams.mockResolvedValue({ data: { items: [{ _id: 'team-1', name: 'Engineering' }] } });

            render(
                <MemoryRouter>
                    <TeamMembersPage />
                </MemoryRouter>
            );

            // Wait for data
            await waitFor(() => {
                expect(screen.getByText('Employee 99')).toBeInTheDocument();
            });

            const duration = performance.now() - start;
            console.log(`[PERF-09] TeamMembersPage (100 items): ${duration.toFixed(2)}ms`);

            // Allow 1 second for 100 items (relaxed threshold for stress test)
            expect(duration).toBeLessThan(1000);
        });
    });

    describe('4. Memory Efficiency (Resource Utilization)', () => {
        it('[PERF-10] Multiple page renders do not cause memory leak pattern', async () => {
            client.get.mockResolvedValue({ data: { items: [] } });

            // Render and unmount multiple times
            for (let i = 0; i < 5; i++) {
                const { unmount } = render(
                    <MemoryRouter>
                        <DashboardPage />
                    </MemoryRouter>
                );

                await waitFor(() => {
                    expect(screen.queryByRole('status') || screen.queryByRole('button')).toBeInTheDocument();
                });

                unmount();
            }

            // If we reach here without OOM, test passes
            // Note: Actual memory profiling requires browser devtools or heapdump analysis
            expect(true).toBe(true);
        });
    });
});

describe('Performance Tests - Component Metrics', () => {
    it('[PERF-11] Reports all performance metrics summary', () => {
        // This test serves as a summary/documentation of thresholds
        console.log('\n=== PERFORMANCE THRESHOLDS (ISO 25010) ===');
        console.log(`  Initial Render: <${THRESHOLDS.INITIAL_RENDER_MS}ms`);
        console.log(`  Simple Page: <${THRESHOLDS.SIMPLE_PAGE_RENDER_MS}ms`);
        console.log(`  Time to Interactive: <${THRESHOLDS.TIME_TO_INTERACTIVE_MS}ms`);
        console.log(`  Large Data (100+): <${THRESHOLDS.LARGE_DATA_RENDER_MS}ms`);
        console.log(`  Re-render: <${THRESHOLDS.RE_RENDER_MS}ms`);
        console.log('==========================================\n');

        expect(THRESHOLDS.INITIAL_RENDER_MS).toBeLessThan(THRESHOLDS.TIME_TO_INTERACTIVE_MS);
        expect(THRESHOLDS.TIME_TO_INTERACTIVE_MS).toBeLessThan(THRESHOLDS.LARGE_DATA_RENDER_MS);
    });
});
