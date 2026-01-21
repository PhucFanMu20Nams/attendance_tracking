import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
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
    const navigate = useNavigate();
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(() => localStorage.getItem('token'));
    // Initialize loading based on token: no token = no need to verify = not loading
    const [loading, setLoading] = useState(() => !!localStorage.getItem('token'));

    // On mount: if token exists, fetch /auth/me to validate and get user
    // Uses AbortController to prevent memory leaks and race conditions
    // Skip if user already set (e.g., after login() which sets both token and user)
    useEffect(() => {
        // No token = loading was initialized as false, nothing to do
        if (!token) return;

        // User already set (from login response) → skip redundant /auth/me call
        // This prevents double-fetch: login already returns user data
        if (user) {

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
                // Guard: Don't update state if request was aborted (StrictMode double-mount)
                if (controller.signal.aborted) return;
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
     * Logout: clear token from storage, reset state, navigate to /login.
     * Uses navigate() for SPA-friendly routing without full page reload.
     */
    const logout = useCallback(() => {
        localStorage.removeItem('token');
        setToken(null);
        setUser(null);
        navigate('/login', { replace: true });
    }, [navigate]);

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
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) {
        throw new Error('useAuth must be used within AuthProvider');
    }
    return ctx;
}
