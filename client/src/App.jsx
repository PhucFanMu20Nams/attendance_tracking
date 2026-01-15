import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import RoleRoute from './components/RoleRoute';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import MyAttendancePage from './pages/MyAttendancePage';

/**
 * App: Main routing component for Attendance App.
 *
 * Route structure:
 * - /login: Public login page
 * - /: Redirects to /dashboard
 * - Protected routes (require login):
 *   - /dashboard: All roles
 *   - /my-attendance: All roles
 *   - /requests: All roles
 *   - /approvals: MANAGER, ADMIN only
 *   - /timesheet: MANAGER, ADMIN only
 *   - /reports: MANAGER, ADMIN only
 *
 * Note: Page components will be implemented in Stage 4-6.
 * Currently using placeholder text until those stages.
 */
export default function App() {
    return (
        <Routes>
            {/* Public route: Login */}
            <Route path="/login" element={<LoginPage />} />

            {/* Root redirect to dashboard */}
            <Route path="/" element={<Navigate to="/dashboard" replace />} />

            {/* Protected routes: wrapped in Layout with Sidebar/Navbar */}
            <Route
                element={
                    <ProtectedRoute>
                        <Layout />
                    </ProtectedRoute>
                }
            >
                {/* All roles can access */}
                <Route
                    path="/dashboard"
                    element={<DashboardPage />}
                />
                <Route
                    path="/my-attendance"
                    element={<MyAttendancePage />}
                />
                <Route
                    path="/requests"
                    element={<PlaceholderPage title="Requests" />}
                />

                {/* MANAGER and ADMIN only */}
                <Route
                    path="/approvals"
                    element={
                        <RoleRoute allowedRoles={['MANAGER', 'ADMIN']}>
                            <PlaceholderPage title="Approvals" />
                        </RoleRoute>
                    }
                />
                <Route
                    path="/timesheet"
                    element={
                        <RoleRoute allowedRoles={['MANAGER', 'ADMIN']}>
                            <PlaceholderPage title="Timesheet Matrix" />
                        </RoleRoute>
                    }
                />
                <Route
                    path="/reports"
                    element={
                        <RoleRoute allowedRoles={['MANAGER', 'ADMIN']}>
                            <PlaceholderPage title="Monthly Report" />
                        </RoleRoute>
                    }
                />
            </Route>

            {/* Catch-all: redirect unknown routes to dashboard */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
    );
}


/**
 * PlaceholderPage: Temporary component until Stage 4-6 pages are implemented.
 * Shows page title to verify routing works correctly.
 */
function PlaceholderPage({ title }) {
    return (
        <div className="p-4">
            <h1 className="text-2xl font-bold text-gray-800">{title}</h1>
            <p className="text-gray-500 mt-2">
                This page will be implemented in Stage 4-6.
            </p>
        </div>
    );
}
