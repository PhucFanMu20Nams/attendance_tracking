import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * RoleRoute: Wrapper that requires specific roles.
 * - Assumes user is already authenticated (wrapped by ProtectedRoute)
 * - Redirects to /dashboard if role not allowed
 * - Renders children if role is allowed
 *
 * @param {string[]} allowedRoles - Array of allowed roles, e.g. ['MANAGER', 'ADMIN']
 */
export default function RoleRoute({ children, allowedRoles = [] }) {
    const { user } = useAuth();

    // Check if user role is in allowed roles
    if (!allowedRoles.includes(user?.role)) {
        return <Navigate to="/dashboard" replace />;
    }

    // Render protected content
    return children;
}
