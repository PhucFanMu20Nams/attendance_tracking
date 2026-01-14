import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Label, TextInput, Button, Alert, Spinner } from 'flowbite-react';
import { useAuth } from '../context/AuthContext';

/**
 * LoginPage: Login form with identifier (email/username) and password.
 * - Uses AuthContext.login() for authentication
 * - Shows error Alert on failure
 * - Redirects to /dashboard on success
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
        setError('');

        // Client-side validation before API call
        if (!identifier.trim() || !password.trim()) {
            setError('Please enter identifier and password');
            return;
        }

        setLoading(true);

        try {
            await login(identifier.trim(), password);
            navigate('/dashboard', { replace: true });
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
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <Card className="w-full max-w-md">
                <h1 className="text-2xl font-bold text-center mb-4">Attendance App</h1>

                {error && (
                    <Alert color="failure" className="mb-4">
                        {error}
                    </Alert>
                )}

                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    <div>
                        <Label htmlFor="identifier" value="Email or Username" />
                        <TextInput
                            id="identifier"
                            type="text"
                            value={identifier}
                            onChange={(e) => setIdentifier(e.target.value)}
                            required
                        />
                    </div>

                    <div>
                        <Label htmlFor="password" value="Password" />
                        <TextInput
                            id="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                    </div>

                    <Button type="submit" disabled={loading}>
                        {loading ? <Spinner size="sm" className="mr-2" /> : null}
                        {loading ? 'Logging in...' : 'Login'}
                    </Button>
                </form>
            </Card>
        </div>
    );
}
