import { Navbar, Sidebar, Dropdown, Avatar } from 'flowbite-react';
import { Outlet, NavLink, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { HiHome, HiClock, HiDocumentText, HiCheckCircle, HiTable, HiChartBar, HiUsers } from 'react-icons/hi';

/**
 * Layout component: Main app layout with Navbar and Sidebar.
 * - Navbar: Logo + user dropdown (name, role, logout)
 * - Sidebar: Role-based navigation items
 * - Main content: Renders child routes via Outlet
 */
export default function Layout() {
    const { user, loading, logout } = useAuth();

    // Show loading state while AuthContext is fetching user
    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <p className="text-gray-500">Loading...</p>
            </div>
        );
    }

    // Role-based navigation items
    const navItems = [
        { to: '/dashboard', label: 'Dashboard', icon: HiHome, roles: ['EMPLOYEE', 'MANAGER', 'ADMIN'] },
        { to: '/my-attendance', label: 'My Attendance', icon: HiClock, roles: ['EMPLOYEE', 'MANAGER', 'ADMIN'] },
        { to: '/requests', label: 'Requests', icon: HiDocumentText, roles: ['EMPLOYEE', 'MANAGER', 'ADMIN'] },
        { to: '/approvals', label: 'Approvals', icon: HiCheckCircle, roles: ['MANAGER', 'ADMIN'] },
        { to: '/timesheet', label: 'Timesheet', icon: HiTable, roles: ['MANAGER', 'ADMIN'] },
        { to: '/reports', label: 'Reports', icon: HiChartBar, roles: ['MANAGER', 'ADMIN'] },
        { to: '/team/members', label: 'Team Members', icon: HiUsers, roles: ['MANAGER'] },
        { to: '/admin/members', label: 'Members', icon: HiUsers, roles: ['ADMIN'] },
    ];

    // Filter navigation items based on user role
    const visibleItems = navItems.filter((item) => item.roles.includes(user?.role));

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Top Navbar */}
            <Navbar fluid className="border-b">
                <Navbar.Brand as={Link} to="/dashboard">
                    <span className="text-xl font-semibold">Attendance</span>
                </Navbar.Brand>
                <div className="flex md:order-2">
                    <Dropdown
                        inline
                        label={<Avatar alt={user?.name} rounded />}
                    >
                        <Dropdown.Header>
                            <span className="block text-sm font-medium">{user?.name}</span>
                            <span className="block text-sm text-gray-500">{user?.role}</span>
                        </Dropdown.Header>
                        <Dropdown.Item onClick={logout}>Logout</Dropdown.Item>
                    </Dropdown>
                </div>
            </Navbar>

            <div className="flex">
                {/* Left Sidebar */}
                <Sidebar className="h-[calc(100vh-65px)] w-64">
                    <Sidebar.Items>
                        <Sidebar.ItemGroup>
                            {visibleItems.map((item) => (
                                <Sidebar.Item
                                    key={item.to}
                                    as={NavLink}
                                    to={item.to}
                                    icon={item.icon}
                                >
                                    {item.label}
                                </Sidebar.Item>
                            ))}
                        </Sidebar.ItemGroup>
                    </Sidebar.Items>
                </Sidebar>

                {/* Main Content Area */}
                <main className="flex-1 p-6">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
