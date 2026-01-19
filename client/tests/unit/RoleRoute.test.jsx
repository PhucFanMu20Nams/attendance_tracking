/**
 * RoleRoute Unit Tests (RBAC Enforcement)
 * 
 * Test Design: Decision Table Testing (ISTQB)
 * Test Type: Security (RBAC)
 * Priority: CRITICAL (Security vulnerability if fails)
 * 
 * Coverage:
 * - ADMIN can access ADMIN-only routes
 * - MANAGER blocked from ADMIN-only routes
 * - EMPLOYEE blocked from MANAGER/ADMIN routes
 * - Multiple allowed roles handled correctly
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import RoleRoute from '../../src/components/RoleRoute';

// Mock useAuth hook
vi.mock('../../src/context/AuthContext', () => ({
    useAuth: vi.fn(),
}));

import { useAuth } from '../../src/context/AuthContext';

describe('RoleRoute - RBAC Unit Tests', () => {
    const AdminPage = () => <div>Admin Page</div>;
    const ManagerPage = () => <div>Manager Page</div>;
    const DashboardPage = () => <div>Dashboard</div>;

    describe('1. ADMIN Role Access', () => {
        it('[RBAC] ADMIN can access ADMIN-only route', () => {
            useAuth.mockReturnValue({
                user: { role: 'ADMIN' },
                loading: false,
            });

            render(
                <MemoryRouter initialEntries={['/admin/members']}>
                    <Routes>
                        <Route
                            path="/admin/members"
                            element={
                                <RoleRoute allowedRoles={['ADMIN']}>
                                    <AdminPage />
                                </RoleRoute>
                            }
                        />
                        <Route path="/dashboard" element={<DashboardPage />} />
                    </Routes>
                </MemoryRouter>
            );

            expect(screen.getByText('Admin Page')).toBeInTheDocument();
            expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
        });

        it('[RBAC] ADMIN can access routes allowing multiple roles', () => {
            useAuth.mockReturnValue({
                user: { role: 'ADMIN' },
                loading: false,
            });

            render(
                <MemoryRouter initialEntries={['/approvals']}>
                    <Routes>
                        <Route
                            path="/approvals"
                            element={
                                <RoleRoute allowedRoles={['MANAGER', 'ADMIN']}>
                                    <ManagerPage />
                                </RoleRoute>
                            }
                        />
                    </Routes>
                </MemoryRouter>
            );

            expect(screen.getByText('Manager Page')).toBeInTheDocument();
        });
    });

    describe('2. MANAGER Role Access', () => {
        it('[RBAC] MANAGER can access MANAGER-allowed routes', () => {
            useAuth.mockReturnValue({
                user: { role: 'MANAGER' },
                loading: false,
            });

            render(
                <MemoryRouter initialEntries={['/approvals']}>
                    <Routes>
                        <Route
                            path="/approvals"
                            element={
                                <RoleRoute allowedRoles={['MANAGER', 'ADMIN']}>
                                    <ManagerPage />
                                </RoleRoute>
                            }
                        />
                    </Routes>
                </MemoryRouter>
            );

            expect(screen.getByText('Manager Page')).toBeInTheDocument();
        });

        it('[RBAC] MANAGER BLOCKED from ADMIN-only route', () => {
            useAuth.mockReturnValue({
                user: { role: 'MANAGER' },
                loading: false,
            });

            render(
                <MemoryRouter initialEntries={['/admin/members']}>
                    <Routes>
                        <Route
                            path="/admin/members"
                            element={
                                <RoleRoute allowedRoles={['ADMIN']}>
                                    <AdminPage />
                                </RoleRoute>
                            }
                        />
                        <Route path="/dashboard" element={<DashboardPage />} />
                    </Routes>
                </MemoryRouter>
            );

            // Should redirect to dashboard
            expect(screen.queryByText('Admin Page')).not.toBeInTheDocument();
            expect(screen.getByText('Dashboard')).toBeInTheDocument();
        });
    });

    describe('3. EMPLOYEE Role Access', () => {
        it('[RBAC] EMPLOYEE BLOCKED from MANAGER-only route', () => {
            useAuth.mockReturnValue({
                user: { role: 'EMPLOYEE' },
                loading: false,
            });

            render(
                <MemoryRouter initialEntries={['/approvals']}>
                    <Routes>
                        <Route
                            path="/approvals"
                            element={
                                <RoleRoute allowedRoles={['MANAGER', 'ADMIN']}>
                                    <ManagerPage />
                                </RoleRoute>
                            }
                        />
                        <Route path="/dashboard" element={<DashboardPage />} />
                    </Routes>
                </MemoryRouter>
            );

            expect(screen.queryByText('Manager Page')).not.toBeInTheDocument();
            expect(screen.getByText('Dashboard')).toBeInTheDocument();
        });

        it('[RBAC] EMPLOYEE BLOCKED from ADMIN-only route', () => {
            useAuth.mockReturnValue({
                user: { role: 'EMPLOYEE' },
                loading: false,
            });

            render(
                <MemoryRouter initialEntries={['/admin/members']}>
                    <Routes>
                        <Route
                            path="/admin/members"
                            element={
                                <RoleRoute allowedRoles={['ADMIN']}>
                                    <AdminPage />
                                </RoleRoute>
                            }
                        />
                        <Route path="/dashboard" element={<DashboardPage />} />
                    </Routes>
                </MemoryRouter>
            );

            expect(screen.queryByText('Admin Page')).not.toBeInTheDocument();
            expect(screen.getByText('Dashboard')).toBeInTheDocument();
        });
    });

    describe('4. Edge Cases', () => {
        it('[EDGE] No user (null) → redirects to dashboard', () => {
            useAuth.mockReturnValue({
                user: null,
                loading: false,
            });

            render(
                <MemoryRouter initialEntries={['/admin/members']}>
                    <Routes>
                        <Route
                            path="/admin/members"
                            element={
                                <RoleRoute allowedRoles={['ADMIN']}>
                                    <AdminPage />
                                </RoleRoute>
                            }
                        />
                        <Route path="/dashboard" element={<DashboardPage />} />
                    </Routes>
                </MemoryRouter>
            );

            expect(screen.queryByText('Admin Page')).not.toBeInTheDocument();
            expect(screen.getByText('Dashboard')).toBeInTheDocument();
        });

        it('[EDGE] User with no role property → blocked', () => {
            useAuth.mockReturnValue({
                user: { _id: '123', name: 'User' }, // No role property
                loading: false,
            });

            render(
                <MemoryRouter initialEntries={['/admin/members']}>
                    <Routes>
                        <Route
                            path="/admin/members"
                            element={
                                <RoleRoute allowedRoles={['ADMIN']}>
                                    <AdminPage />
                                </RoleRoute>
                            }
                        />
                        <Route path="/dashboard" element={<DashboardPage />} />
                    </Routes>
                </MemoryRouter>
            );

            expect(screen.queryByText('Admin Page')).not.toBeInTheDocument();
            expect(screen.getByText('Dashboard')).toBeInTheDocument();
        });
    });
});
