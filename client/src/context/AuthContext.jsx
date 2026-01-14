import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import client from '../api/client';

const AuthContext = createContext(null);

/**
 * AuthProvider: Single source of truth for auth state.
 * - user: current user object or null
 * - token: JWT string or null
 * - loading: true while fetching /auth/me on mount
 * - login(identifier, password): authenticate and set user
 * - logout(): clear auth and redirect to /login
 */
export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(() => localStorage.getItem('token'));
    const [loading, setLoading] = useState(true);

    // On mount: if token exists, fetch /auth/me to validate and get user
    // Uses AbortController to prevent memory leaks and race conditions
    useEffect(() => {
        if (!token) {
            setLoading(false);
            return;
        }

        const controller = new AbortController();

        client.get('/auth/me', { signal: controller.signal })
            .then((res) => {
                setUser(res.data.user);
            })
            .catch((err) => {
                // Ignore abort errors (component unmounted)
                if (err.name === 'CanceledError' || err.name === 'AbortError') {
                    return;
                }
                // Only clear token on 401 (unauthorized)
                // Keep token for 500/network errors to avoid logout on temporary failures
                if (err.response?.status === 401) {
                    localStorage.removeItem('token');
                    setToken(null);
                    setUser(null);
                }
            })
            .finally(() => {
                setLoading(false);
            });

        // Cleanup: abort pending request on unmount or token change
        return () => controller.abort();
    }, [token]);

    /**
     * Login with identifier (email/username) and password.
     * On success: stores token, sets user, returns response data.
     * On failure: throws error (caller handles).
     */
    const login = useCallback(async (identifier, password) => {
        const res = await client.post('/auth/login', { identifier, password });
        localStorage.setItem('token', res.data.token);
        setToken(res.data.token);
        setUser(res.data.user);
        return res.data;
    }, []);

    /**
     * Logout: clear token from storage, reset state, redirect to /login.
     */
    const logout = useCallback(() => {
        localStorage.removeItem('token');
        setToken(null);
        setUser(null);
        window.location.href = '/login';
    }, []);

    return (
        <AuthContext.Provider value={{ user, token, loading, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

/**
 * useAuth hook: access auth context.
 * Must be used within AuthProvider.
 */
export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) {
        throw new Error('useAuth must be used within AuthProvider');
    }
    return ctx;
}
