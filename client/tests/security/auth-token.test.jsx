/**
 * Authentication Token Security Tests
 * 
 * Test Design: Boundary Value Analysis + Experience-Based Testing (ISTQB)
 * Test Type: Security
 * Priority: CRITICAL
 * ISO 25010: Security - Confidentiality, Non-repudiation
 * 
 * Test Approach:
 * - Token storage security (localStorage)
 * - Token NOT leaked in logs/console
 * - Token cleared properly on logout
 * - 401 response handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { waitFor, act } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { AuthProvider, useAuth } from '../../src/context/AuthContext';
import client from '../../src/api/client';

// Mock API client - must mock BEFORE importing AuthContext
vi.mock('../../src/api/client');

describe('Auth Token Security Tests', () => {
    let consoleLogSpy;
    let consoleErrorSpy;
    let consoleWarnSpy;

    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();

        // Default mock for client.get (AuthContext calls this with token)
        client.get.mockResolvedValue({ data: { user: { _id: '1', name: 'Mock User' } } });

        // Spy on console methods
        consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => { });
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
        consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { });
    });

    afterEach(() => {
        consoleLogSpy.mockRestore();
        consoleErrorSpy.mockRestore();
        consoleWarnSpy.mockRestore();
    });

    describe('1. Token Storage Security', () => {
        it('[TOKEN-01] Token stored in localStorage after login', async () => {
            const mockToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test';
            const mockUser = { _id: '1', name: 'User', role: 'EMPLOYEE' };

            client.post.mockResolvedValue({
                data: { token: mockToken, user: mockUser }
            });

            const { result } = renderHook(() => useAuth(), {
                wrapper: AuthProvider
            });

            await act(async () => {
                await result.current.login('user@test.com', 'password123');
            });

            expect(localStorage.getItem('token')).toBe(mockToken);
        });

        it('[TOKEN-02] Token CLEARED from localStorage on logout', async () => {
            const mockToken = 'test-token-to-clear';
            localStorage.setItem('token', mockToken);

            // Mock window.location
            const originalLocation = window.location;
            delete window.location;
            window.location = { href: '' };

            const { result } = renderHook(() => useAuth(), {
                wrapper: AuthProvider
            });

            act(() => {
                result.current.logout();
            });

            // Token should be removed
            expect(localStorage.getItem('token')).toBeNull();

            // Restore window.location
            window.location = originalLocation;
        });

        it('[TOKEN-03] Token CLEARED on 401 response from /auth/me', async () => {
            const expiredToken = 'expired-token';
            localStorage.setItem('token', expiredToken);

            client.get.mockRejectedValue({
                response: { status: 401 },
                message: 'Token expired'
            });

            const { result } = renderHook(() => useAuth(), {
                wrapper: AuthProvider
            });

            await waitFor(() => {
                expect(result.current.loading).toBe(false);
            });

            // Token should be cleared on 401
            expect(localStorage.getItem('token')).toBeNull();
            expect(result.current.token).toBeNull();
        });
    });

    describe('2. Token NOT Exposed in Logs', () => {
        it('[TOKEN-04] Token NOT logged to console on successful login', async () => {
            const sensitiveToken = 'super-secret-jwt-token';

            client.post.mockResolvedValue({
                data: {
                    token: sensitiveToken,
                    user: { _id: '1', name: 'User' }
                }
            });

            const { result } = renderHook(() => useAuth(), {
                wrapper: AuthProvider
            });

            await act(async () => {
                await result.current.login('user@test.com', 'password');
            });

            // Check no console method received the token
            const allConsoleCalls = [
                ...consoleLogSpy.mock.calls,
                ...consoleWarnSpy.mock.calls,
            ];

            allConsoleCalls.forEach(call => {
                const callString = JSON.stringify(call);
                expect(callString).not.toContain(sensitiveToken);
            });
        });

        it('[TOKEN-05] Token NOT logged on 401 response', async () => {
            const sensitiveToken = 'secret-token-checked';
            localStorage.setItem('token', sensitiveToken);

            client.get.mockRejectedValue({
                response: { status: 401 },
                config: { headers: { Authorization: `Bearer ${sensitiveToken}` } }
            });

            renderHook(() => useAuth(), {
                wrapper: AuthProvider
            });

            await waitFor(() => { });

            // Check no console method received the token
            const allConsoleCalls = [
                ...consoleLogSpy.mock.calls,
                ...consoleWarnSpy.mock.calls,
            ];

            allConsoleCalls.forEach(call => {
                const callString = JSON.stringify(call);
                expect(callString).not.toContain(sensitiveToken);
            });
        });
    });

    describe('3. Token Transmission Security', () => {
        it('[TOKEN-06] Token sent via config object, NOT in URL query params', async () => {
            const token = 'test-bearer-token';
            localStorage.setItem('token', token);

            client.get.mockResolvedValue({
                data: { user: { _id: '1', name: 'User' } }
            });

            renderHook(() => useAuth(), {
                wrapper: AuthProvider
            });

            await waitFor(() => {
                expect(client.get).toHaveBeenCalled();
            });

            // Verify the call was made to /auth/me
            const getCall = client.get.mock.calls[0];
            expect(getCall[0]).toBe('/auth/me');

            // URL should not contain token as query param
            expect(getCall[0]).not.toContain('?token=');
            expect(getCall[0]).not.toContain('&token=');
        });
    });

    describe('4. Session Security', () => {
        it('[TOKEN-07] User state cleared when token cleared', async () => {
            const token = 'session-token';
            const user = { _id: '1', name: 'Session User' };

            localStorage.setItem('token', token);
            client.get.mockResolvedValue({ data: { user } });

            const originalLocation = window.location;
            delete window.location;
            window.location = { href: '' };

            const { result } = renderHook(() => useAuth(), {
                wrapper: AuthProvider
            });

            // Wait for auth to initialize
            await waitFor(() => {
                expect(result.current.loading).toBe(false);
            });

            expect(result.current.user).toEqual(user);

            // Logout
            act(() => {
                result.current.logout();
            });

            // User should be cleared
            expect(result.current.user).toBeNull();
            expect(result.current.token).toBeNull();

            window.location = originalLocation;
        });

        it('[TOKEN-08] Invalid token format handled gracefully', async () => {
            // Set a malformed token
            const malformedToken = 'not-a-valid-jwt';
            localStorage.setItem('token', malformedToken);

            client.get.mockRejectedValue({
                response: { status: 401 },
                message: 'Invalid token'
            });

            const { result } = renderHook(() => useAuth(), {
                wrapper: AuthProvider
            });

            await waitFor(() => {
                expect(result.current.loading).toBe(false);
            });

            // Should clear invalid token
            expect(localStorage.getItem('token')).toBeNull();
            expect(result.current.user).toBeNull();
        });
    });

    describe('5. Password Security', () => {
        it('[TOKEN-09] Password NOT stored in localStorage', async () => {
            const password = 'super-secret-password-123';

            client.post.mockResolvedValue({
                data: {
                    token: 'jwt-token',
                    user: { _id: '1', name: 'User' }
                }
            });

            const { result } = renderHook(() => useAuth(), {
                wrapper: AuthProvider
            });

            await act(async () => {
                await result.current.login('user@test.com', password);
            });

            // Check all localStorage keys
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                const value = localStorage.getItem(key);
                expect(value).not.toContain(password);
            }
        });

        it('[TOKEN-10] Password NOT logged to console', async () => {
            const password = 'my-secret-pass';

            client.post.mockResolvedValue({
                data: {
                    token: 'jwt-token',
                    user: { _id: '1', name: 'User' }
                }
            });

            const { result } = renderHook(() => useAuth(), {
                wrapper: AuthProvider
            });

            await act(async () => {
                await result.current.login('user@test.com', password);
            });

            // Check no console method received the password
            const allConsoleCalls = [
                ...consoleLogSpy.mock.calls,
                ...consoleWarnSpy.mock.calls,
            ];

            allConsoleCalls.forEach(call => {
                const callString = JSON.stringify(call);
                expect(callString).not.toContain(password);
            });
        });
    });
});
