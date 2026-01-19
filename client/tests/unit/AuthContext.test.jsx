/**
 * AuthContext Unit Tests
 * 
 * Test Design: State Transition Testing (ISTQB)
 * Test Type: Functional + Security
 * Priority: Critical (Authentication is core functionality)
 * 
 * Coverage:
 * - Login flow (not logged in → logging in → logged in)
 * - Logout flow (logged in → logged out)
 * - Token persistence (localStorage)
 * - /auth/me validation on mount
 * - Error handling (401 clears token)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { renderHook, act } from '@testing-library/react';
import { AuthProvider, useAuth } from '../../src/context/AuthContext';
import client from '../../src/api/client';

// Mock API client
vi.mock('../../src/api/client');

describe('AuthContext - Unit Tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
    });

    describe('1. Initial State (Not Logged In)', () => {
        it('[STATE] Initial state: user=null, loading=false when no token', () => {
            const { result } = renderHook(() => useAuth(), {
                wrapper: AuthProvider
            });

            expect(result.current.user).toBeNull();
            expect(result.current.token).toBeNull();
            expect(result.current.loading).toBe(false);
        });
    });

    describe('2. Token Validation on Mount', () => {
        it('[HAPPY] Valid token → fetches user from /auth/me', async () => {
            const mockToken = 'valid-jwt-token';
            const mockUser = { _id: '123', name: 'Admin', role: 'ADMIN' };

            localStorage.setItem('token', mockToken);
            client.get.mockResolvedValue({ data: { user: mockUser } });

            const { result } = renderHook(() => useAuth(), {
                wrapper: AuthProvider
            });

            // Initially loading
            expect(result.current.loading).toBe(true);

            // Wait for /auth/me to complete
            await waitFor(() => {
                expect(result.current.loading).toBe(false);
            });

            expect(result.current.user).toEqual(mockUser);
            expect(result.current.token).toBe(mockToken);
            expect(client.get).toHaveBeenCalledWith('/auth/me', expect.objectContaining({
                signal: expect.any(AbortSignal)
            }));
        });

        it('[ERROR] Invalid token (401) → clears token and user', async () => {
            const invalidToken = 'invalid-token';
            localStorage.setItem('token', invalidToken);

            client.get.mockRejectedValue({
                response: { status: 401 },
                message: 'Unauthorized'
            });

            const { result } = renderHook(() => useAuth(), {
                wrapper: AuthProvider
            });

            await waitFor(() => {
                expect(result.current.loading).toBe(false);
            });

            expect(result.current.user).toBeNull();
            expect(result.current.token).toBeNull();
            expect(localStorage.getItem('token')).toBeNull();
        });

        it('[SECURITY] 500 error → keeps token (temporary failure)', async () => {
            const token = 'valid-token';
            localStorage.setItem('token', token);

            client.get.mockRejectedValue({
                response: { status: 500 },
                message: 'Server error'
            });

            const { result } = renderHook(() => useAuth(), {
                wrapper: AuthProvider
            });

            await waitFor(() => {
                expect(result.current.loading).toBe(false);
            });

            // Token should NOT be cleared on 500 error
            expect(localStorage.getItem('token')).toBe(token);
            expect(result.current.token).toBe(token);
        });
    });

    describe('3. Login Flow', () => {
        it('[HAPPY] Successful login → stores token and user', async () => {
            const mockToken = 'new-jwt-token';
            const mockUser = { _id: '456', name: 'Manager', role: 'MANAGER' };

            client.post.mockResolvedValue({
                data: { token: mockToken, user: mockUser }
            });

            const { result } = renderHook(() => useAuth(), {
                wrapper: AuthProvider
            });

            await act(async () => {
                await result.current.login('manager@test.com', 'Password123');
            });

            expect(result.current.user).toEqual(mockUser);
            expect(result.current.token).toBe(mockToken);
            expect(localStorage.getItem('token')).toBe(mockToken);
            expect(client.post).toHaveBeenCalledWith('/auth/login', {
                identifier: 'manager@test.com',
                password: 'Password123'
            });
        });

        it('[ERROR] Failed login → throws error, no token stored', async () => {
            client.post.mockRejectedValue({
                response: { status: 401, data: { message: 'Invalid credentials' } }
            });

            const { result } = renderHook(() => useAuth(), {
                wrapper: AuthProvider
            });

            await expect(
                act(async () => {
                    await result.current.login('wrong@test.com', 'wrong');
                })
            ).rejects.toThrow();

            expect(result.current.user).toBeNull();
            expect(result.current.token).toBeNull();
            expect(localStorage.getItem('token')).toBeNull();
        });
    });

    describe('4. Logout Flow', () => {
        it('[HAPPY] Logout → clears token and redirects', async () => {
            const mockToken = 'token-to-clear';
            localStorage.setItem('token', mockToken);

            // Mock window.location.href
            delete window.location;
            window.location = { href: '' };

            const { result } = renderHook(() => useAuth(), {
                wrapper: AuthProvider
            });

            act(() => {
                result.current.logout();
            });

            expect(localStorage.getItem('token')).toBeNull();
            expect(window.location.href).toBe('/login');
        });
    });

    describe('5. Security Tests', () => {
        it('[SECURITY] Token NOT logged to console', async () => {
            const consoleSpy = vi.spyOn(console, 'log');
            const token = 'secret-token';

            client.post.mockResolvedValue({
                data: { token, user: { name: 'User' } }
            });

            const { result } = renderHook(() => useAuth(), {
                wrapper: AuthProvider
            });

            await act(async () => {
                await result.current.login('user@test.com', 'pass');
            });

            expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining(token));
        });

        it('[SECURITY] useAuth throws error outside AuthProvider', () => {
            expect(() => {
                renderHook(() => useAuth());
            }).toThrow('useAuth must be used within AuthProvider');
        });
    });

    describe('6. Race Condition Protection', () => {
        it('[RACE] AbortController cancels /auth/me on unmount', async () => {
            localStorage.setItem('token', 'some-token');

            const abortSpy = vi.fn();
            client.get.mockImplementation((_url, config) => {
                if (config?.signal) {
                    config.signal.addEventListener('abort', abortSpy);
                }
                return new Promise(() => { }); // Never resolves
            });

            const { unmount } = renderHook(() => useAuth(), {
                wrapper: AuthProvider
            });

            unmount();

            await waitFor(() => {
                expect(abortSpy).toHaveBeenCalled();
            });
        });
    });
});
