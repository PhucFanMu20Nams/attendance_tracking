import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Label, TextInput, Button, Alert, Spinner } from 'flowbite-react';
import { HiClipboardCheck } from 'react-icons/hi';
import { useAuth } from '../context/AuthContext';

/**
 * LoginPage: Login form with identifier (email/username) and password.
 * - Uses AuthContext.login() for authentication
 * - Shows error Alert on failure
 * - Redirects based on user role:
 *   - ADMIN → /admin/members
 *   - MANAGER → /team/members
 *   - EMPLOYEE → /dashboard
 */
export default function LoginPage() {
    const navigate = useNavigate();
    const { login } = useAuth();

    const [identifier, setIdentifier] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        // Double-submit guard
        if (loading) return;
        
        setError('');

        // Client-side validation (don't trim password - may contain intentional spaces)
        const trimmedIdentifier = identifier.trim();
        if (!trimmedIdentifier || !password) {
            setError('Please enter identifier and password');
            return;
        }

        setLoading(true);

        try {
            const data = await login(trimmedIdentifier, password);
            
            // Role-based redirect after successful login
            // Normalize role to handle case sensitivity and whitespace
            const userRole = String(data.user?.role || '').trim().toUpperCase();
            let redirectPath = '/dashboard'; // Default for EMPLOYEE
            
            if (userRole === 'ADMIN') {
                redirectPath = '/admin/members';
            } else if (userRole === 'MANAGER') {
                redirectPath = '/team/members';
            }
            
            navigate(redirectPath, { replace: true });
        } catch (err) {
            // Handle both API errors and network errors gracefully
            const msg =
                err?.response?.data?.message ||
                err?.response?.data?.error ||
                err?.message ||
                'Login failed';
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 via-white to-primary-100">
            <Card className="w-full max-w-md shadow-lg">
                {/* Brand Header */}
                <div className="text-center mb-6">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary-100 mb-4">
                        <HiClipboardCheck className="h-8 w-8 text-primary-600" />
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900">Chào mừng trở lại</h1>
                    <p className="text-sm text-gray-500 mt-1">Đăng nhập để tiếp tục</p>
                </div>

                {error && (
                    <Alert color="failure" className="mb-4" role="alert">
                        {error}
                    </Alert>
                )}

                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    <div>
                        <Label htmlFor="identifier" value="Email hoặc Username" />
                        <TextInput
                            id="identifier"
                            type="text"
                            value={identifier}
                            onChange={(e) => {
                                setIdentifier(e.target.value);
                                if (error) setError('');
                            }}
                            autoComplete="username"
                            required
                        />
                    </div>

                    <div>
                        <Label htmlFor="password" value="Mật khẩu" />
                        <TextInput
                            id="password"
                            type="password"
                            value={password}
                            onChange={(e) => {
                                setPassword(e.target.value);
                                if (error) setError('');
                            }}
                            autoComplete="current-password"
                            required
                        />
                    </div>

                    <Button type="submit" disabled={loading} color="blue" className="w-full">
                        {loading ? <Spinner size="sm" className="mr-2" /> : null}
                        {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
                    </Button>
                </form>
            </Card>
        </div>
    );
}
