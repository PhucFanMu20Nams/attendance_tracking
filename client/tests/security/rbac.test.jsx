/**
 * RBAC (Role-Based Access Control) Security Tests
 * 
 * Test Design: Decision Table Testing (ISTQB)
 * Test Type: Security
 * Priority: CRITICAL
 * ISO 25010: Security - Authorization
 * 
 * Test Approach:
 * - Test all role × route combinations
 * - Verify managers cannot access admin routes
 * - Verify employees cannot access manager/admin routes
 * - Verify correct redirect path via LocationDisplay
 * 
 * Current RoleRoute Implementation:
 * - user.role is a STRING (not array)
 * - Redirect destination: /dashboard
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import RoleRoute from '../../src/components/RoleRoute';

// Mock useAuth hook
vi.mock('../../src/context/AuthContext', () => ({
    useAuth: vi.fn(),
}));

import { useAuth } from '../../src/context/AuthContext';

// Helper component to display current location path
const LocationDisplay = () => {
    const location = useLocation();
    return <div data-testid="location-display">{location.pathname}</div>;
};

// Page components for testing
const DashboardPage = () => <div data-testid="dashboard">Dashboard</div>;
const ApprovalsPage = () => <div data-testid="approvals">Approvals Page</div>;
const AdminMembersPage = () => <div data-testid="admin-members">Admin Members</div>;
const TeamMembersPage = () => <div data-testid="team-members">Team Members</div>;
const TimesheetPage = () => <div data-testid="timesheet">Timesheet Matrix</div>;
const MonthlyReportPage = () => <div data-testid="monthly-report">Monthly Report</div>;

/**
 * Helper function to reduce boilerplate in RBAC tests
 * @param {string} initialPath - Route to test access to
 * @param {React.ReactNode} ProtectedComponent - Component that requires role
 * @param {string[]} allowedRoles - Roles allowed to access route
 */
const renderWithRoleRoute = (initialPath, ProtectedComponent, allowedRoles) => {
    return render(
        <MemoryRouter initialEntries={[initialPath]}>
            <LocationDisplay />
            <Routes>
                <Route
                    path={initialPath}
                    element={
                        <RoleRoute allowedRoles={allowedRoles}>
                            {ProtectedComponent}
                        </RoleRoute>
                    }
                />
                <Route path="/dashboard" element={<DashboardPage />} />
            </Routes>
        </MemoryRouter>
    );
};

describe('RBAC Security Tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('1. EMPLOYEE Role Access Control', () => {
        beforeEach(() => {
            useAuth.mockReturnValue({
                user: { _id: '1', role: 'EMPLOYEE', name: 'Employee User' },
                loading: false,
            });
        });

        it('[RBAC-01] EMPLOYEE BLOCKED from /approvals (MANAGER/ADMIN only)', () => {
            renderWithRoleRoute('/approvals', <ApprovalsPage />, ['MANAGER', 'ADMIN']);

            // Verify redirect happened
            expect(screen.getByTestId('location-display')).toHaveTextContent('/dashboard');
            expect(screen.queryByTestId('approvals')).not.toBeInTheDocument();
            expect(screen.getByTestId('dashboard')).toBeInTheDocument();
        });

        it('[RBAC-02] EMPLOYEE BLOCKED from /admin/members (ADMIN only)', () => {
            renderWithRoleRoute('/admin/members', <AdminMembersPage />, ['ADMIN']);

            expect(screen.getByTestId('location-display')).toHaveTextContent('/dashboard');
            expect(screen.queryByTestId('admin-members')).not.toBeInTheDocument();
            expect(screen.getByTestId('dashboard')).toBeInTheDocument();
        });

        it('[RBAC-03] EMPLOYEE BLOCKED from /team-members (MANAGER/ADMIN only)', () => {
            renderWithRoleRoute('/team-members', <TeamMembersPage />, ['MANAGER', 'ADMIN']);

            expect(screen.getByTestId('location-display')).toHaveTextContent('/dashboard');
            expect(screen.queryByTestId('team-members')).not.toBeInTheDocument();
        });

        it('[RBAC-04] EMPLOYEE BLOCKED from /timesheet (MANAGER/ADMIN only)', () => {
            renderWithRoleRoute('/timesheet', <TimesheetPage />, ['MANAGER', 'ADMIN']);

            expect(screen.getByTestId('location-display')).toHaveTextContent('/dashboard');
            expect(screen.queryByTestId('timesheet')).not.toBeInTheDocument();
        });

        it('[RBAC-05] EMPLOYEE BLOCKED from /monthly-report (MANAGER/ADMIN only)', () => {
            renderWithRoleRoute('/monthly-report', <MonthlyReportPage />, ['MANAGER', 'ADMIN']);

            expect(screen.getByTestId('location-display')).toHaveTextContent('/dashboard');
            expect(screen.queryByTestId('monthly-report')).not.toBeInTheDocument();
        });
    });

    describe('2. MANAGER Role Access Control', () => {
        beforeEach(() => {
            useAuth.mockReturnValue({
                user: { _id: '2', role: 'MANAGER', name: 'Manager User', teamId: 'team-123' },
                loading: false,
            });
        });

        it('[RBAC-06] MANAGER CAN access /approvals', () => {
            renderWithRoleRoute('/approvals', <ApprovalsPage />, ['MANAGER', 'ADMIN']);

            expect(screen.getByTestId('location-display')).toHaveTextContent('/approvals');
            expect(screen.getByTestId('approvals')).toBeInTheDocument();
        });

        it('[RBAC-07] MANAGER BLOCKED from /admin/members (ADMIN only)', () => {
            renderWithRoleRoute('/admin/members', <AdminMembersPage />, ['ADMIN']);

            expect(screen.getByTestId('location-display')).toHaveTextContent('/dashboard');
            expect(screen.queryByTestId('admin-members')).not.toBeInTheDocument();
            expect(screen.getByTestId('dashboard')).toBeInTheDocument();
        });

        it('[RBAC-08] MANAGER CAN access /team-members', () => {
            renderWithRoleRoute('/team-members', <TeamMembersPage />, ['MANAGER', 'ADMIN']);

            expect(screen.getByTestId('location-display')).toHaveTextContent('/team-members');
            expect(screen.getByTestId('team-members')).toBeInTheDocument();
        });

        it('[RBAC-09] MANAGER CAN access /timesheet', () => {
            renderWithRoleRoute('/timesheet', <TimesheetPage />, ['MANAGER', 'ADMIN']);

            expect(screen.getByTestId('location-display')).toHaveTextContent('/timesheet');
            expect(screen.getByTestId('timesheet')).toBeInTheDocument();
        });
    });

    describe('3. ADMIN Role Access Control', () => {
        beforeEach(() => {
            useAuth.mockReturnValue({
                user: { _id: '3', role: 'ADMIN', name: 'Admin User' },
                loading: false,
            });
        });

        it('[RBAC-10] ADMIN CAN access /admin/members', () => {
            renderWithRoleRoute('/admin/members', <AdminMembersPage />, ['ADMIN']);

            expect(screen.getByTestId('location-display')).toHaveTextContent('/admin/members');
            expect(screen.getByTestId('admin-members')).toBeInTheDocument();
        });

        it('[RBAC-11] ADMIN CAN access /approvals', () => {
            renderWithRoleRoute('/approvals', <ApprovalsPage />, ['MANAGER', 'ADMIN']);

            expect(screen.getByTestId('location-display')).toHaveTextContent('/approvals');
            expect(screen.getByTestId('approvals')).toBeInTheDocument();
        });

        it('[RBAC-12] ADMIN CAN access all manager routes', () => {
            const routes = [
                { path: '/team-members', Component: <TeamMembersPage />, testId: 'team-members' },
                { path: '/timesheet', Component: <TimesheetPage />, testId: 'timesheet' },
                { path: '/monthly-report', Component: <MonthlyReportPage />, testId: 'monthly-report' },
            ];

            routes.forEach(({ path, Component, testId }) => {
                const { unmount } = renderWithRoleRoute(path, Component, ['MANAGER', 'ADMIN']);

                expect(screen.getByTestId('location-display')).toHaveTextContent(path);
                expect(screen.getByTestId(testId)).toBeInTheDocument();
                unmount();
            });
        });
    });

    describe('4. Edge Cases & Security Boundaries', () => {
        it('[RBAC-13] Undefined role treated as unauthorized', () => {
            useAuth.mockReturnValue({
                user: { _id: '4', name: 'Unknown' }, // No role property
                loading: false,
            });

            renderWithRoleRoute('/approvals', <ApprovalsPage />, ['MANAGER', 'ADMIN']);

            expect(screen.getByTestId('location-display')).toHaveTextContent('/dashboard');
            expect(screen.queryByTestId('approvals')).not.toBeInTheDocument();
        });

        it('[RBAC-14] Invalid role string (not ADMIN/MANAGER/EMPLOYEE) is blocked', () => {
            useAuth.mockReturnValue({
                user: { _id: '5', role: 'SUPERUSER', name: 'Hacker' },
                loading: false,
            });

            renderWithRoleRoute('/admin/members', <AdminMembersPage />, ['ADMIN']);

            expect(screen.getByTestId('location-display')).toHaveTextContent('/dashboard');
            expect(screen.queryByTestId('admin-members')).not.toBeInTheDocument();
        });

        it('[RBAC-15] Case-sensitive role check (admin != ADMIN)', () => {
            useAuth.mockReturnValue({
                user: { _id: '6', role: 'admin', name: 'Case Test' }, // lowercase
                loading: false,
            });

            renderWithRoleRoute('/admin/members', <AdminMembersPage />, ['ADMIN']);

            // lowercase 'admin' should NOT match 'ADMIN'
            expect(screen.getByTestId('location-display')).toHaveTextContent('/dashboard');
            expect(screen.queryByTestId('admin-members')).not.toBeInTheDocument();
        });

        it('[RBAC-16] Null user blocked from protected routes', () => {
            useAuth.mockReturnValue({
                user: null,
                loading: false,
            });

            renderWithRoleRoute('/approvals', <ApprovalsPage />, ['MANAGER', 'ADMIN']);

            expect(screen.getByTestId('location-display')).toHaveTextContent('/dashboard');
            expect(screen.queryByTestId('approvals')).not.toBeInTheDocument();
        });

        it('[RBAC-17] Empty allowedRoles array blocks everyone', () => {
            useAuth.mockReturnValue({
                user: { _id: '7', role: 'ADMIN', name: 'Admin User' },
                loading: false,
            });

            renderWithRoleRoute('/secret', <div data-testid="secret">Secret</div>, []);

            expect(screen.getByTestId('location-display')).toHaveTextContent('/dashboard');
            expect(screen.queryByTestId('secret')).not.toBeInTheDocument();
        });
    });
});
