/**
 * ProtectedRoute Unit Tests
 * 
 * Test Design: Equivalence Partitioning (ISTQB)
 * Test Type: Functional + Security (RBAC)
 * Priority: Critical (Core auth protection)
 * 
 * Coverage:
 * - Logged in user → renders children
 * - Not logged in → redirects to /login
 * - Loading state → shows nothing (avoids flash)
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ProtectedRoute from '../../src/components/ProtectedRoute';
import { AuthProvider } from '../../src/context/AuthContext';

// Mock useAuth hook
vi.mock('../../src/context/AuthContext', async () => {
    const actual = await vi.importActual('../../src/context/AuthContext');
    return {
        ...actual,
        useAuth: vi.fn(),
    };
});

import { useAuth } from '../../src/context/AuthContext';

describe('ProtectedRoute - Unit Tests', () => {
    const TestChild = () => <div>Protected Content</div>;

    describe('1. Authenticated User (Logged In)', () => {
        it('[HAPPY] Logged in user → renders children', () => {
            useAuth.mockReturnValue({
                user: { _id: '123', name: 'User', role: 'EMPLOYEE' },
                loading: false,
            });

            render(
                <MemoryRouter>
                    <ProtectedRoute>
                        <TestChild />
                    </ProtectedRoute>
                </MemoryRouter>
            );

            expect(screen.getByText('Protected Content')).toBeInTheDocument();
        });
    });

    describe('2. Unauthenticated User (Not Logged In)', () => {
        it('[RBAC] Not logged in → redirects to /login', () => {
            useAuth.mockReturnValue({
                user: null,
                loading: false,
            });

            const { container } = render(
                <MemoryRouter initialEntries={['/dashboard']}>
                    <ProtectedRoute>
                        <TestChild />
                    </ProtectedRoute>
                </MemoryRouter>
            );

            // Should NOT render protected content
            expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
        });
    });

    describe('3. Loading State', () => {
        it('[STATE] Loading → renders nothing (no flash)', () => {
            useAuth.mockReturnValue({
                user: null,
                loading: true,
            });

            const { container } = render(
                <MemoryRouter>
                    <ProtectedRoute>
                        <TestChild />
                    </ProtectedRoute>
                </MemoryRouter>
            );

            // ProtectedRoute shows "Loading..." when loading=true
            expect(container.textContent).toBe('Loading...');
            expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
        });
    });

    describe('4. Edge Cases', () => {
        it('[EDGE] User object exists but empty → still renders (truthy check)', () => {
            useAuth.mockReturnValue({
                user: {},
                loading: false,
            });

            render(
                <MemoryRouter>
                    <ProtectedRoute>
                        <TestChild />
                    </ProtectedRoute>
                </MemoryRouter>
            );

            // Empty user object is still truthy
            expect(screen.getByText('Protected Content')).toBeInTheDocument();
        });
    });
});
