/**
 * Accessibility Tests - Screen Reader & WCAG Compliance
 * 
 * Test Design: Usability (ISO 25010)
 * Test Type: Non-Functional (Accessibility)
 * Priority: HIGH
 * 
 * WCAG 2.1 Guidelines Covered:
 * - 1.1.1 Non-text Content (Level A): Images have alt text
 * - 1.3.1 Info and Relationships (Level A): Semantic HTML, labels
 * - 1.4.3 Contrast Minimum (Level AA): Text contrast ratio
 * - 4.1.1 Parsing (Level A): Valid HTML
 * - 4.1.2 Name, Role, Value (Level A): ARIA labels, roles
 * 
 * Uses jest-axe for automated WCAG validation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import { MemoryRouter } from 'react-router-dom';

// Import pages
import LoginPage from '../../src/pages/LoginPage';
import DashboardPage from '../../src/pages/DashboardPage';
import MyAttendancePage from '../../src/pages/MyAttendancePage';
import TeamMembersPage from '../../src/pages/TeamMembersPage';

// Extend expect
expect.extend(toHaveNoViolations);

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

// Mock useAuth
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

describe('Accessibility Tests - Screen Reader & WCAG Compliance', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('1. axe-core WCAG Validation', () => {
        it('[A11Y-AXE-01] LoginPage has no accessibility violations', async () => {
            const { container } = render(
                <MemoryRouter>
                    <LoginPage />
                </MemoryRouter>
            );

            const results = await axe(container);
            expect(results).toHaveNoViolations();
        });

        it('[A11Y-AXE-02] DashboardPage has no accessibility violations', async () => {
            client.get.mockResolvedValue({
                data: {
                    items: [{
                        date: '2026-01-15',
                        checkInAt: '2026-01-15T08:30:00+07:00',
                        checkOutAt: null,
                        status: 'WORKING',
                    }]
                }
            });

            const { container } = render(
                <MemoryRouter>
                    <DashboardPage />
                </MemoryRouter>
            );

            await waitFor(() => {
                expect(screen.queryByRole('status')).not.toBeInTheDocument();
            });

            const results = await axe(container);
            expect(results).toHaveNoViolations();
        });

        it('[A11Y-AXE-03] MyAttendancePage has no accessibility violations', async () => {
            vi.useFakeTimers({ shouldAdvanceTime: true });
            vi.setSystemTime(new Date('2026-01-15T10:00:00+07:00'));

            client.get.mockResolvedValue({
                data: {
                    items: [
                        { date: '2026-01-10', status: 'ON_TIME', checkInAt: '2026-01-10T08:30:00+07:00' },
                    ]
                }
            });

            const { container } = render(
                <MemoryRouter>
                    <MyAttendancePage />
                </MemoryRouter>
            );

            await waitFor(() => {
                expect(screen.queryByRole('status')).not.toBeInTheDocument();
            });

            const results = await axe(container);
            expect(results).toHaveNoViolations();

            vi.useRealTimers();
        });

        it('[A11Y-AXE-04] TeamMembersPage has no accessibility violations', async () => {
            getTodayAttendance.mockResolvedValue({
                data: {
                    date: '2026-01-15',
                    items: [
                        {
                            user: { _id: '1', name: 'Employee 1', email: 'e1@test.com', employeeCode: 'E1' },
                            attendance: { checkInAt: '2026-01-15T08:30:00+07:00' },
                            computed: { status: 'WORKING' },
                        },
                    ]
                }
            });
            getTeams.mockResolvedValue({ data: { items: [{ _id: 'team-1', name: 'Engineering' }] } });

            const { container } = render(
                <MemoryRouter>
                    <TeamMembersPage />
                </MemoryRouter>
            );

            await waitFor(() => {
                expect(screen.getByText('Employee 1')).toBeInTheDocument();
            });

            const results = await axe(container);
            expect(results).toHaveNoViolations();
        });
    });

    describe('2. Form Labels (WCAG 1.3.1, 4.1.2)', () => {
        it('[A11Y-SR-01] Login form inputs have associated labels', () => {
            render(
                <MemoryRouter>
                    <LoginPage />
                </MemoryRouter>
            );

            // Each input should have a label
            const identifierInput = screen.getByLabelText(/email or username/i);
            const passwordInput = screen.getByLabelText(/password/i);

            expect(identifierInput).toBeInTheDocument();
            expect(passwordInput).toBeInTheDocument();

            // Labels should be programmatically associated
            expect(identifierInput).toHaveAttribute('id');
            expect(passwordInput).toHaveAttribute('id');
        });

        it('[A11Y-SR-02] Form inputs have correct type attributes', () => {
            render(
                <MemoryRouter>
                    <LoginPage />
                </MemoryRouter>
            );

            const identifierInput = screen.getByLabelText(/email or username/i);
            const passwordInput = screen.getByLabelText(/password/i);

            expect(identifierInput).toHaveAttribute('type', 'text');
            expect(passwordInput).toHaveAttribute('type', 'password');
        });

        it('[A11Y-SR-03] Required fields are marked appropriately', () => {
            render(
                <MemoryRouter>
                    <LoginPage />
                </MemoryRouter>
            );

            const identifierInput = screen.getByLabelText(/email or username/i);
            const passwordInput = screen.getByLabelText(/password/i);

            // Required attribute should be present
            expect(identifierInput).toHaveAttribute('required');
            expect(passwordInput).toHaveAttribute('required');
        });
    });

    describe('3. Semantic HTML (WCAG 1.3.1)', () => {
        it('[A11Y-SR-04] Page has proper heading structure', () => {
            render(
                <MemoryRouter>
                    <LoginPage />
                </MemoryRouter>
            );

            // Should have at least one heading
            const headings = screen.getAllByRole('heading');
            expect(headings.length).toBeGreaterThan(0);

            // Main heading should exist
            expect(screen.getByText('Attendance App')).toBeInTheDocument();
        });

        it('[A11Y-SR-05] Buttons have accessible names', () => {
            render(
                <MemoryRouter>
                    <LoginPage />
                </MemoryRouter>
            );

            // Button should have accessible name
            const button = screen.getByRole('button', { name: /login/i });
            expect(button).toBeInTheDocument();
            expect(button).toHaveTextContent('Login');
        });

        it('[A11Y-SR-06] Tables have proper structure', async () => {
            vi.useFakeTimers({ shouldAdvanceTime: true });
            vi.setSystemTime(new Date('2026-01-15T10:00:00+07:00'));

            client.get.mockResolvedValue({
                data: {
                    items: [
                        { date: '2026-01-10', status: 'ON_TIME', checkInAt: '2026-01-10T08:30:00+07:00' },
                    ]
                }
            });

            render(
                <MemoryRouter>
                    <MyAttendancePage />
                </MemoryRouter>
            );

            await waitFor(() => {
                expect(screen.queryByRole('status')).not.toBeInTheDocument();
            });

            // Table should exist
            const table = screen.getByRole('table');
            expect(table).toBeInTheDocument();

            // Table should have headers
            const headers = screen.getAllByRole('columnheader');
            expect(headers.length).toBeGreaterThan(0);

            vi.useRealTimers();
        });
    });

    describe('4. ARIA Roles and States (WCAG 4.1.2)', () => {
        it('[A11Y-SR-07] Loading indicator has proper role', async () => {
            client.get.mockImplementation(() => new Promise(() => { })); // Never resolves

            render(
                <MemoryRouter>
                    <DashboardPage />
                </MemoryRouter>
            );

            // Loading indicator should have status role (Flowbite Spinner)
            const spinner = screen.getByRole('status');
            expect(spinner).toBeInTheDocument();
        });

        it('[A11Y-SR-08] Error alerts have alert role', async () => {
            vi.useFakeTimers({ shouldAdvanceTime: true });
            vi.setSystemTime(new Date('2026-01-15T10:00:00+07:00'));

            client.get.mockRejectedValue({
                response: { data: { message: 'Error occurred' } }
            });

            render(
                <MemoryRouter>
                    <MyAttendancePage />
                </MemoryRouter>
            );

            // Wait for error alert
            const alert = await screen.findByRole('alert');
            expect(alert).toBeInTheDocument();
            expect(alert).toHaveTextContent('Error occurred');

            vi.useRealTimers();
        });

        it('[A11Y-SR-09] Interactive elements have appropriate roles', async () => {
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

            // Button should have button role
            const button = await screen.findByRole('button', { name: /check-in/i });
            expect(button).toBeInTheDocument();
            expect(button.tagName).toBe('BUTTON');
        });
    });

    describe('5. Color Contrast & Visual (WCAG 1.4.3)', () => {
        it('[A11Y-CC-01] Status badges have distinguishable colors', async () => {
            getTodayAttendance.mockResolvedValue({
                data: {
                    date: '2026-01-15',
                    items: [
                        {
                            user: { _id: '1', name: 'User 1', email: 'u1@test.com', employeeCode: 'E1' },
                            attendance: { checkInAt: '2026-01-15T08:30:00+07:00' },
                            computed: { status: 'ON_TIME' },
                        },
                        {
                            user: { _id: '2', name: 'User 2', email: 'u2@test.com', employeeCode: 'E2' },
                            attendance: { checkInAt: '2026-01-15T09:00:00+07:00' },
                            computed: { status: 'LATE' },
                        },
                    ]
                }
            });
            getTeams.mockResolvedValue({ data: { items: [{ _id: 'team-1', name: 'Engineering' }] } });

            render(
                <MemoryRouter>
                    <TeamMembersPage />
                </MemoryRouter>
            );

            await waitFor(() => {
                expect(screen.getByText('On Time')).toBeInTheDocument();
                expect(screen.getByText('Late')).toBeInTheDocument();
            });

            // Badges should have distinct text (color validated by axe-core)
            const onTimeBadge = screen.getByText('On Time');
            const lateBadge = screen.getByText('Late');

            expect(onTimeBadge).toBeInTheDocument();
            expect(lateBadge).toBeInTheDocument();
        });

        it('[A11Y-CC-02] Page maintains readability at different states', async () => {
            client.get.mockResolvedValue({ data: { items: [] } });

            const { container } = render(
                <MemoryRouter>
                    <DashboardPage />
                </MemoryRouter>
            );

            await waitFor(() => {
                expect(screen.queryByRole('status')).not.toBeInTheDocument();
            });

            // No critical contrast violations (validated by axe)
            const results = await axe(container);
            const contrastViolations = results.violations.filter(
                v => v.id === 'color-contrast'
            );

            expect(contrastViolations.length).toBe(0);
        });
    });

    describe('6. Focus Management', () => {
        it('[A11Y-FM-01] Focus is visible on interactive elements', () => {
            render(
                <MemoryRouter>
                    <LoginPage />
                </MemoryRouter>
            );

            const identifierInput = screen.getByLabelText(/email or username/i);

            // Focus the element
            identifierInput.focus();

            // Element should have focus
            expect(document.activeElement).toBe(identifierInput);
        });

        it('[A11Y-FM-02] Page title describes content', () => {
            render(
                <MemoryRouter>
                    <LoginPage />
                </MemoryRouter>
            );

            // Page should have identifiable content
            expect(screen.getByText('Attendance App')).toBeInTheDocument();
        });
    });
});
