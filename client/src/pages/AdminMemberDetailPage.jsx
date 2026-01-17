import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Card, Table, Button, Modal, Spinner, Alert, Badge, Select, Label, TextInput, Toast
} from 'flowbite-react';
import { HiArrowLeft, HiPencil, HiKey, HiCheck, HiX } from 'react-icons/hi';
import {
    getTeams, getUserById, getUserAttendance, updateUser, resetPassword
} from '../api/memberApi';

/**
 * AdminMemberDetailPage: Admin views member profile + monthly attendance history.
 * 
 * Features:
 * - Profile card with user info
 * - Monthly attendance table with month picker
 * - Edit member modal
 * - Reset password modal
 * 
 * RBAC: ADMIN only (enforced by route + backend)
 */
export default function AdminMemberDetailPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const isMounted = useRef(true);

    // Get current month in YYYY-MM format (GMT+7)
    const getCurrentMonth = () => {
        const now = new Date();
        const gmt7 = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
        return `${gmt7.getFullYear()}-${String(gmt7.getMonth() + 1).padStart(2, '0')}`;
    };

    // Data states
    const [user, setUser] = useState(null);
    const [attendance, setAttendance] = useState([]);
    const [teams, setTeams] = useState([]);
    const [month, setMonth] = useState(getCurrentMonth());
    const [loading, setLoading] = useState(true);
    const [attendanceLoading, setAttendanceLoading] = useState(false);
    const [attendanceError, setAttendanceError] = useState(''); // Distinguish API error vs no data
    const [error, setError] = useState('');

    // Race condition protection: track latest request
    const attendanceRequestIdRef = useRef(0);

    // Edit modal states
    const [editModal, setEditModal] = useState(false);
    const [editForm, setEditForm] = useState({});
    const [editLoading, setEditLoading] = useState(false);
    const [editError, setEditError] = useState('');

    // Reset password modal states
    const [resetModal, setResetModal] = useState(false);
    const [newPassword, setNewPassword] = useState('');
    const [resetLoading, setResetLoading] = useState(false);
    const [resetError, setResetError] = useState('');

    // Toast state
    const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
    const toastTimeoutRef = useRef(null);

    // Status badge colors per RULES.md line 102-109
    const statusColors = {
        'ON_TIME': 'success',      // green
        'LATE': 'warning',         // orange/red → Flowbite warning is orange
        'WORKING': 'info',         // blue
        'MISSING_CHECKOUT': 'warning', // yellow per RULES.md
        'WEEKEND_OR_HOLIDAY': 'gray',  // grey per RULES.md
        'ABSENT': 'failure',           // red
        null: 'gray'                   // neutral
    };

    const statusLabels = {
        'ON_TIME': 'On Time',
        'LATE': 'Late',
        'WORKING': 'Working',
        'MISSING_CHECKOUT': 'Missing Checkout',
        'WEEKEND_OR_HOLIDAY': 'Weekend/Holiday',
        'ABSENT': 'Absent',
        null: '-'
    };

    // Cleanup on unmount
    useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false;
            if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
        };
    }, []);

    // Fetch teams for edit modal
    useEffect(() => {
        const fetchTeamsList = async () => {
            try {
                const res = await getTeams();
                if (isMounted.current) setTeams(res.data.items || []);
            } catch (err) {
                console.error('Failed to fetch teams:', err);
            }
        };
        fetchTeamsList();
    }, []);

    // Fetch user profile on mount
    useEffect(() => {
        const fetchUser = async () => {
            setLoading(true);
            setError('');
            try {
                const res = await getUserById(id);
                if (isMounted.current) setUser(res.data.user);
            } catch (err) {
                if (isMounted.current) {
                    if (err.response?.status === 404) {
                        setError('User not found');
                    } else if (err.response?.status === 403) {
                        setError('Access denied');
                    } else {
                        setError(err.response?.data?.message || 'Failed to load user');
                    }
                }
            } finally {
                if (isMounted.current) setLoading(false);
            }
        };
        if (id) fetchUser();
    }, [id]);

    // Fetch attendance when month changes (with race condition protection)
    const fetchAttendance = useCallback(async () => {
        if (!id || !month) return;

        // Race condition guard: increment requestId
        const currentRequestId = ++attendanceRequestIdRef.current;

        setAttendanceLoading(true);
        setAttendanceError('');
        try {
            const res = await getUserAttendance(id, month);
            // Only update if this is still the latest request
            if (isMounted.current && currentRequestId === attendanceRequestIdRef.current) {
                setAttendance(res.data.items || []);
            }
        } catch (err) {
            console.error('Failed to fetch attendance:', err);
            // Only update if this is still the latest request
            if (isMounted.current && currentRequestId === attendanceRequestIdRef.current) {
                setAttendance([]);
                setAttendanceError(err.response?.data?.message || 'Failed to load attendance');
            }
        } finally {
            if (isMounted.current && currentRequestId === attendanceRequestIdRef.current) {
                setAttendanceLoading(false);
            }
        }
    }, [id, month]);

    useEffect(() => {
        fetchAttendance();
    }, [fetchAttendance]);

    // Format date (YYYY-MM-DD → dd/mm/yyyy)
    const formatDate = (dateStr) => {
        if (!dateStr) return '-';
        const [year, month, day] = dateStr.split('-');
        return `${day}/${month}/${year}`;
    };

    // Format time (ISO → HH:mm GMT+7)
    const formatTime = (isoString) => {
        if (!isoString) return '-';
        return new Date(isoString).toLocaleTimeString('vi-VN', {
            timeZone: 'Asia/Ho_Chi_Minh',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    // Format minutes to hours
    const formatMinutes = (minutes) => {
        if (minutes === null || minutes === undefined) return '-';
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
    };

    // Generate month options (last 12 months)
    const getMonthOptions = () => {
        const options = [];
        const now = new Date();
        for (let i = 0; i < 12; i++) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            const label = d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
            options.push({ value, label });
        }
        return options;
    };

    // Open edit modal
    const handleEditClick = () => {
        if (!user) return;
        setEditForm({
            name: user.name || '',
            email: user.email || '',
            username: user.username || '',
            teamId: user.teamId || '',
            isActive: user.isActive ?? true,
            startDate: user.startDate ? user.startDate.split('T')[0] : ''
        });
        setEditError('');
        setEditModal(true);
    };

    // Submit edit
    const handleEditSubmit = async () => {
        if (!user) return;
        setEditLoading(true);
        setEditError('');
        try {
            const data = {};
            if (editForm.name !== user.name) data.name = editForm.name;
            if (editForm.email !== user.email) data.email = editForm.email;
            if (editForm.username !== (user.username || '') && editForm.username) {
                data.username = editForm.username;
            }
            const originalTeamId = user.teamId || '';
            if (editForm.teamId !== originalTeamId && editForm.teamId) {
                data.teamId = editForm.teamId;
            }
            if (editForm.isActive !== user.isActive) data.isActive = editForm.isActive;
            if (editForm.startDate) {
                const originalDate = user.startDate ? user.startDate.split('T')[0] : '';
                if (editForm.startDate !== originalDate) data.startDate = editForm.startDate;
            }

            if (Object.keys(data).length === 0) {
                setEditModal(false);
                return;
            }

            const res = await updateUser(user._id, data);
            if (isMounted.current) {
                setUser(res.data.user);
                setEditModal(false);
                showToast('Member updated successfully', 'success');
            }
        } catch (err) {
            if (isMounted.current) {
                setEditError(err.response?.data?.message || 'Failed to update member');
            }
        } finally {
            if (isMounted.current) setEditLoading(false);
        }
    };

    // Open reset password modal
    const handleResetClick = () => {
        setNewPassword('');
        setResetError('');
        setResetModal(true);
    };

    // Submit reset password
    const handleResetSubmit = async () => {
        if (!user || !newPassword) return;
        if (newPassword.length < 8) {
            setResetError('Password must be at least 8 characters');
            return;
        }
        setResetLoading(true);
        setResetError('');
        try {
            await resetPassword(user._id, newPassword);
            if (isMounted.current) {
                setResetModal(false);
                showToast('Password updated', 'success');
            }
        } catch (err) {
            if (isMounted.current) {
                setResetError(err.response?.data?.message || 'Failed to reset password');
            }
        } finally {
            if (isMounted.current) setResetLoading(false);
        }
    };

    // Toast helper with cleanup
    const showToast = (message, type = 'success') => {
        if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
        setToast({ show: true, message, type });
        toastTimeoutRef.current = setTimeout(() => {
            if (isMounted.current) setToast({ show: false, message: '', type: 'success' });
        }, 3000);
    };

    // Get team name by ID
    const getTeamName = (teamId) => {
        const team = teams.find(t => t._id === teamId);
        return team?.name || 'No Team';
    };

    // Loading state
    if (loading) {
        return (
            <div className="flex justify-center py-20">
                <Spinner size="xl" />
            </div>
        );
    }

    // Error state
    if (error) {
        return (
            <div className="p-4">
                <Alert color="failure">
                    {error}
                </Alert>
                <Button color="light" className="mt-4" onClick={() => navigate('/admin/members')}>
                    <HiArrowLeft className="mr-2 h-4 w-4" />
                    Back to Members
                </Button>
            </div>
        );
    }

    return (
        <div className="p-4">
            {/* Header */}
            <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-4">
                    <Button color="light" onClick={() => navigate('/admin/members')}>
                        <HiArrowLeft className="h-4 w-4" />
                    </Button>
                    <h1 className="text-2xl font-bold text-gray-800">
                        {user?.name} ({user?.employeeCode})
                    </h1>
                </div>
                <div className="flex gap-2">
                    <Button color="light" onClick={handleEditClick}>
                        <HiPencil className="mr-2 h-4 w-4" />
                        Edit
                    </Button>
                    <Button color="light" onClick={handleResetClick}>
                        <HiKey className="mr-2 h-4 w-4" />
                        Reset Password
                    </Button>
                </div>
            </div>

            {/* Profile Card */}
            <Card className="mb-6">
                <h2 className="text-lg font-semibold text-gray-700 mb-4">Profile</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div>
                        <p className="text-sm text-gray-500">Email</p>
                        <p className="font-medium">{user?.email || '-'}</p>
                    </div>
                    <div>
                        <p className="text-sm text-gray-500">Username</p>
                        <p className="font-medium">{user?.username || '-'}</p>
                    </div>
                    <div>
                        <p className="text-sm text-gray-500">Role</p>
                        <Badge color="info">{user?.role}</Badge>
                    </div>
                    <div>
                        <p className="text-sm text-gray-500">Team</p>
                        <p className="font-medium">{user?.teamId ? getTeamName(user.teamId) : 'No Team'}</p>
                    </div>
                    <div>
                        <p className="text-sm text-gray-500">Start Date</p>
                        <p className="font-medium">
                            {user?.startDate ? formatDate(user.startDate.split('T')[0]) : '-'}
                        </p>
                    </div>
                    <div>
                        <p className="text-sm text-gray-500">Status</p>
                        <Badge color={user?.isActive ? 'success' : 'failure'}>
                            {user?.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                    </div>
                </div>
            </Card>

            {/* Monthly Attendance */}
            <Card>
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-lg font-semibold text-gray-700">Monthly Attendance</h2>
                    <div className="flex items-center gap-2">
                        <Label htmlFor="month" value="Month:" className="sr-only" />
                        <Select
                            id="month"
                            value={month}
                            onChange={(e) => setMonth(e.target.value)}
                            className="w-48"
                        >
                            {getMonthOptions().map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                </option>
                            ))}
                        </Select>
                    </div>
                </div>

                {attendanceLoading ? (
                    <div className="flex justify-center py-10">
                        <Spinner size="lg" />
                    </div>
                ) : attendanceError ? (
                    <Alert color="failure">{attendanceError}</Alert>
                ) : attendance.length === 0 ? (
                    <Alert color="info">No attendance records for this month.</Alert>
                ) : (
                    <div className="overflow-x-auto">
                        <Table striped>
                            <Table.Head>
                                <Table.HeadCell>Date</Table.HeadCell>
                                <Table.HeadCell>Check In</Table.HeadCell>
                                <Table.HeadCell>Check Out</Table.HeadCell>
                                <Table.HeadCell>Status</Table.HeadCell>
                                <Table.HeadCell>Work Time</Table.HeadCell>
                                <Table.HeadCell>OT</Table.HeadCell>
                            </Table.Head>
                            <Table.Body className="divide-y">
                                {attendance.map((item) => (
                                    <Table.Row key={item.date} className="bg-white">
                                        <Table.Cell className="font-medium">
                                            {formatDate(item.date)}
                                        </Table.Cell>
                                        <Table.Cell>{formatTime(item.checkInAt)}</Table.Cell>
                                        <Table.Cell>{formatTime(item.checkOutAt)}</Table.Cell>
                                        <Table.Cell>
                                            <Badge color={statusColors[item.status] || 'gray'}>
                                                {statusLabels[item.status] || 'Unknown'}
                                            </Badge>
                                        </Table.Cell>
                                        <Table.Cell>{formatMinutes(item.workMinutes)}</Table.Cell>
                                        <Table.Cell>{formatMinutes(item.otMinutes)}</Table.Cell>
                                    </Table.Row>
                                ))}
                            </Table.Body>
                        </Table>
                    </div>
                )}
            </Card>

            {/* Edit Modal */}
            <Modal show={editModal} onClose={() => setEditModal(false)}>
                <Modal.Header>Edit Member: {user?.name}</Modal.Header>
                <Modal.Body>
                    {editError && (
                        <Alert color="failure" className="mb-4">{editError}</Alert>
                    )}
                    <div className="space-y-4">
                        <div>
                            <Label htmlFor="edit-name" value="Name" />
                            <TextInput
                                id="edit-name"
                                value={editForm.name || ''}
                                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                            />
                        </div>
                        <div>
                            <Label htmlFor="edit-email" value="Email" />
                            <TextInput
                                id="edit-email"
                                type="email"
                                value={editForm.email || ''}
                                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                            />
                        </div>
                        <div>
                            <Label htmlFor="edit-username" value="Username" />
                            <TextInput
                                id="edit-username"
                                value={editForm.username || ''}
                                onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                            />
                        </div>
                        <div>
                            <Label htmlFor="edit-team" value="Team" />
                            <Select
                                id="edit-team"
                                value={editForm.teamId || ''}
                                onChange={(e) => setEditForm({ ...editForm, teamId: e.target.value })}
                            >
                                <option value="">No Team</option>
                                {teams.map((team) => (
                                    <option key={team._id} value={team._id}>{team.name}</option>
                                ))}
                            </Select>
                        </div>
                        <div>
                            <Label htmlFor="edit-startDate" value="Start Date" />
                            <TextInput
                                id="edit-startDate"
                                type="date"
                                value={editForm.startDate || ''}
                                onChange={(e) => setEditForm({ ...editForm, startDate: e.target.value })}
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <input
                                id="edit-isActive"
                                type="checkbox"
                                checked={editForm.isActive ?? true}
                                onChange={(e) => setEditForm({ ...editForm, isActive: e.target.checked })}
                                className="w-4 h-4 text-blue-600 rounded border-gray-300"
                            />
                            <Label htmlFor="edit-isActive" value="Active" />
                        </div>
                    </div>
                </Modal.Body>
                <Modal.Footer>
                    <Button onClick={handleEditSubmit} disabled={editLoading}>
                        {editLoading ? <Spinner size="sm" className="mr-2" /> : <HiCheck className="mr-2" />}
                        Save
                    </Button>
                    <Button color="gray" onClick={() => setEditModal(false)}>
                        Cancel
                    </Button>
                </Modal.Footer>
            </Modal>

            {/* Reset Password Modal */}
            <Modal show={resetModal} onClose={() => setResetModal(false)}>
                <Modal.Header>Reset Password: {user?.name}</Modal.Header>
                <Modal.Body>
                    {resetError && (
                        <Alert color="failure" className="mb-4">{resetError}</Alert>
                    )}
                    <div>
                        <Label htmlFor="new-password" value="New Password (min 8 characters)" />
                        <TextInput
                            id="new-password"
                            type="password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="Enter new password"
                        />
                    </div>
                </Modal.Body>
                <Modal.Footer>
                    <Button onClick={handleResetSubmit} disabled={resetLoading || newPassword.length < 8}>
                        {resetLoading ? <Spinner size="sm" className="mr-2" /> : <HiKey className="mr-2" />}
                        Reset Password
                    </Button>
                    <Button color="gray" onClick={() => setResetModal(false)}>
                        Cancel
                    </Button>
                </Modal.Footer>
            </Modal>

            {/* Toast */}
            {toast.show && (
                <div className="fixed bottom-4 right-4 z-50">
                    <Toast>
                        <div className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${toast.type === 'success'
                            ? 'bg-green-100 text-green-500'
                            : 'bg-red-100 text-red-500'
                            }`}>
                            {toast.type === 'success' ? <HiCheck className="h-5 w-5" /> : <HiX className="h-5 w-5" />}
                        </div>
                        <div className="ml-3 text-sm font-normal">{toast.message}</div>
                        <Toast.Toggle onClick={() => setToast({ ...toast, show: false })} />
                    </Toast>
                </div>
            )}
        </div>
    );
}
