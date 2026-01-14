import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * ProtectedRoute: Wrapper that requires authentication.
 * - Shows loading while AuthContext is fetching user
 * - Redirects to /login if not authenticated
 * - Renders children if authenticated
 */
export default function ProtectedRoute({ children }) {
    const { user, loading } = useAuth();

    // Show loading while AuthContext is checking auth
    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <p className="text-gray-500">Loading...</p>
            </div>
        );
    }

    // Redirect to login if not authenticated
    if (!user) {
        return <Navigate to="/login" replace />;
    }

    // Render protected content
    return children;
}
