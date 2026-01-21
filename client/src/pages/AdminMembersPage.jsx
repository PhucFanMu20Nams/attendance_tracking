import { useState, useEffect, useCallback, useRef } from 'react';
import {
    Table, Button, Modal, Spinner, Alert, Select, Label, TextInput, Toast
} from 'flowbite-react';
import { HiRefresh, HiPencil, HiKey, HiEye, HiCheck, HiX, HiPlus } from 'react-icons/hi';
import { useNavigate } from 'react-router-dom';
import {
    getTeams, getTodayAttendance, updateUser, resetPassword
} from '../api/memberApi';
import { createUser } from '../api/adminApi';
import { PageHeader, StatusBadge } from '../components/ui';

/**
 * AdminMembersPage: Admin views all members with today's activity.
 * 
 * Features:
 * - Scope filter: company | team
 * - Team dropdown (when scope=team)
 * - Today activity table with status badges
 * - Edit member modal (whitelist fields)
 * - Reset password modal
 * 
 * RBAC: ADMIN only (enforced by route + backend)
 */
export default function AdminMembersPage() {
    const navigate = useNavigate();

    // Filter states
    const [scope, setScope] = useState('company');
    const [teamId, setTeamId] = useState('');
    const [teams, setTeams] = useState([]);

    // Data states
    const [members, setMembers] = useState([]);
    const [todayDate, setTodayDate] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Edit modal states
    const [editModal, setEditModal] = useState({ open: false, user: null });
    const [editForm, setEditForm] = useState({});
    const [editLoading, setEditLoading] = useState(false);
    const [editError, setEditError] = useState('');

    // Reset password modal states
    const [resetModal, setResetModal] = useState({ open: false, user: null });
    const [newPassword, setNewPassword] = useState('');
    const [resetLoading, setResetLoading] = useState(false);
    const [resetError, setResetError] = useState('');

    // Create user modal states
    const [createModal, setCreateModal] = useState(false);
    const [createForm, setCreateForm] = useState({
        employeeCode: '',
        name: '',
        email: '',
        username: '',
        password: '',
        role: 'EMPLOYEE',
        teamId: '',
        startDate: '',
        isActive: true
    });
    const [createLoading, setCreateLoading] = useState(false);
    const [createError, setCreateError] = useState('');

    // Toast state
    const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

    // Race condition protection
    const requestIdRef = useRef(0);
    const isMounted = useRef(false);

    // Track mount state
    useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false;
        };
    }, []);

    // Fetch teams on mount
    useEffect(() => {
        const fetchTeamsList = async () => {
            try {
                const res = await getTeams();
                setTeams(res.data.items || []);
            } catch (err) {
                console.error('Failed to fetch teams:', err);
            }
        };
        fetchTeamsList();
    }, []);

    // Fetch members when scope/teamId changes
    const fetchMembers = useCallback(async () => {
        const currentRequestId = ++requestIdRef.current;

        // Guard: if scope=team but no teamId selected, don't fetch yet
        if (scope === 'team' && !teamId) {
            setMembers([]);
            setTodayDate(''); // Reset to avoid stale date display
            setError('');
            setLoading(false);
            return;
        }

        setLoading(true);
        setError('');
        try {
            const params = { scope };
            if (scope === 'team' && teamId) {
                params.teamId = teamId;
            }
            const res = await getTodayAttendance(params);

            // Ignore stale response
            if (!isMounted.current || currentRequestId !== requestIdRef.current) return;

            setTodayDate(res.data.date || '');
            setMembers(res.data.items || []);
        } catch (err) {
            if (err.name === 'CanceledError' || err.name === 'AbortError' || err?.code === 'ERR_CANCELED') return;
            // Ignore stale error
            if (!isMounted.current || currentRequestId !== requestIdRef.current) return;
            setError(err.response?.data?.message || 'Failed to load members');
        } finally {
            if (isMounted.current && currentRequestId === requestIdRef.current) {
                setLoading(false);
            }
        }
    }, [scope, teamId]);

    useEffect(() => {
        fetchMembers();
    }, [fetchMembers]);

    // Format time (ISO → HH:mm GMT+7)
    const formatTime = (isoString) => {
        if (!isoString) return '-';
        return new Date(isoString).toLocaleTimeString('vi-VN', {
            timeZone: 'Asia/Ho_Chi_Minh',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    // Open edit modal
    const handleEditClick = (user) => {
        setEditForm({
            name: user.name || '',
            email: user.email || '',
            username: user.username || '',
            teamId: user.teamId || '',
            isActive: user.isActive ?? true,
            startDate: user.startDate ? user.startDate.split('T')[0] : ''
        });
        setEditError('');
        setEditModal({ open: true, user });
    };

    // Submit edit
    const handleEditSubmit = async () => {
        if (!editModal.user) return;
        setEditLoading(true);
        setEditError('');
        try {
            // Only send changed fields (whitelist)
            const data = {};
            if (editForm.name !== editModal.user.name) data.name = editForm.name;
            if (editForm.email !== editModal.user.email) data.email = editForm.email;
            // Only send username if changed and not empty (avoid sending '' which may conflict)
            if (editForm.username !== (editModal.user.username || '') && editForm.username) {
                data.username = editForm.username;
            }
            // FIX: Skip teamId if empty string (backend rejects '' as invalid ObjectId)
            // Only send if user actually changed to a valid team
            const originalTeamId = editModal.user.teamId || '';
            if (editForm.teamId !== originalTeamId && editForm.teamId) {
                data.teamId = editForm.teamId;
            }
            if (editForm.isActive !== editModal.user.isActive) data.isActive = editForm.isActive;
            if (editForm.startDate) {
                const originalDate = editModal.user.startDate ? editModal.user.startDate.split('T')[0] : '';
                if (editForm.startDate !== originalDate) data.startDate = editForm.startDate;
            }

            if (Object.keys(data).length === 0) {
                setEditModal({ open: false, user: null });
                return;
            }

            await updateUser(editModal.user._id, data);
            setEditModal({ open: false, user: null });
            showToast('Member updated successfully', 'success');
            fetchMembers();
        } catch (err) {
            setEditError(err.response?.data?.message || 'Failed to update member');
        } finally {
            setEditLoading(false);
        }
    };

    // Open reset password modal
    const handleResetClick = (user) => {
        setNewPassword('');
        setResetError('');
        setResetModal({ open: true, user });
    };

    // Submit reset password
    const handleResetSubmit = async () => {
        if (!resetModal.user || !newPassword) return;
        if (newPassword.length < 8) {
            setResetError('Password must be at least 8 characters');
            return;
        }
        setResetLoading(true);
        setResetError('');
        try {
            await resetPassword(resetModal.user._id, newPassword);
            setResetModal({ open: false, user: null });
            showToast('Password updated', 'success');
        } catch (err) {
            setResetError(err.response?.data?.message || 'Failed to reset password');
        } finally {
            setResetLoading(false);
        }
    };

    // Validate create form
    const validateCreateForm = () => {
        if (!createForm.employeeCode.trim()) return 'Employee code is required';
        if (!createForm.name.trim()) return 'Name is required';
        if (!createForm.email.trim()) return 'Email is required';
        if (!createForm.password) return 'Password is required';
        if (createForm.password.length < 8) return 'Password must be at least 8 characters';
        if (!createForm.role) return 'Role is required';
        return null;
    };

    // Submit create user
    const handleCreateSubmit = async () => {
        const validationError = validateCreateForm();
        if (validationError) {
            setCreateError(validationError);
            return;
        }

        setCreateLoading(true);
        setCreateError('');
        try {
            const payload = {
                employeeCode: createForm.employeeCode.trim(),
                name: createForm.name.trim(),
                email: createForm.email.trim(),
                password: createForm.password,
                role: createForm.role,
            };

            // Optional fields
            if (createForm.username.trim()) payload.username = createForm.username.trim();
            if (createForm.teamId) payload.teamId = createForm.teamId;
            if (createForm.startDate) payload.startDate = createForm.startDate;
            if (createForm.isActive !== undefined) payload.isActive = createForm.isActive;

            await createUser(payload);
            setCreateModal(false);
            resetCreateForm();
            showToast('Member created successfully', 'success');
            fetchMembers();
        } catch (err) {
            setCreateError(err.response?.data?.message || 'Failed to create member');
        } finally {
            setCreateLoading(false);
        }
    };

    // Reset create form
    const resetCreateForm = () => {
        setCreateForm({
            employeeCode: '',
            name: '',
            email: '',
            username: '',
            password: '',
            role: 'EMPLOYEE',
            teamId: '',
            startDate: '',
            isActive: true
        });
        setCreateError('');
    };

    // Toast helper
    const showToast = (message, type = 'success') => {
        setToast({ show: true, message, type });
        setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000);
    };

    // View detail navigation
    const handleViewDetail = (userId) => {
        navigate(`/admin/members/${userId}`);
    };

    return (
        <div>
            <PageHeader title="Quản lý nhân viên">
                <Button color="success" onClick={() => setCreateModal(true)}>
                    <HiPlus className="mr-2 h-4 w-4" />
                    Thêm nhân viên
                </Button>
                <Button color="light" onClick={() => fetchMembers()}>
                    <HiRefresh className="mr-2 h-4 w-4" />
                    Làm mới
                </Button>
            </PageHeader>

            {/* Filters */}
            <div className="flex gap-4 mb-4">
                <div>
                    <Label htmlFor="scope" value="Scope" className="mb-1 block" />
                    <Select
                        id="scope"
                        value={scope}
                        onChange={(e) => {
                            setScope(e.target.value);
                            if (e.target.value === 'company') setTeamId('');
                        }}
                    >
                        <option value="company">All Company</option>
                        <option value="team">By Team</option>
                    </Select>
                </div>

                {scope === 'team' && (
                    <div>
                        <Label htmlFor="teamId" value="Team" className="mb-1 block" />
                        <Select
                            id="teamId"
                            value={teamId}
                            onChange={(e) => setTeamId(e.target.value)}
                        >
                            <option value="">Select team...</option>
                            {teams.map((team) => (
                                <option key={team._id} value={team._id}>
                                    {team.name}
                                </option>
                            ))}
                        </Select>
                    </div>
                )}

                {todayDate && (
                    <div className="ml-auto self-end text-sm text-gray-500">
                        Today: {todayDate}
                    </div>
                )}
            </div>

            {/* Error alert */}
            {error && (
                <Alert color="failure" className="mb-4">
                    {error}
                </Alert>
            )}

            {/* Loading */}
            {loading && (
                <div className="flex justify-center py-10">
                    <Spinner size="lg" />
                </div>
            )}

            {/* Empty state */}
            {!loading && !error && members.length === 0 && (
                <Alert color="info">
                    {scope === 'team' && !teamId
                        ? 'Please select a team to view members.'
                        : 'No members found.'}
                </Alert>
            )}

            {/* Members table */}
            {!loading && members.length > 0 && (
                <div className="overflow-x-auto">
                    <Table striped>
                        <Table.Head>
                            <Table.HeadCell>Code</Table.HeadCell>
                            <Table.HeadCell>Name</Table.HeadCell>
                            <Table.HeadCell>Email</Table.HeadCell>
                            <Table.HeadCell>Status</Table.HeadCell>
                            <Table.HeadCell>Check In</Table.HeadCell>
                            <Table.HeadCell>Check Out</Table.HeadCell>
                            <Table.HeadCell>Actions</Table.HeadCell>
                        </Table.Head>
                        <Table.Body className="divide-y">
                            {members.map((item) => (
                                <Table.Row key={item.user._id} className="bg-white">
                                    <Table.Cell className="font-medium text-gray-900">
                                        {item.user.employeeCode}
                                    </Table.Cell>
                                    <Table.Cell>{item.user.name}</Table.Cell>
                                    <Table.Cell className="text-gray-500 text-sm">
                                        {item.user.email}
                                    </Table.Cell>
                                    <Table.Cell>
                                        <StatusBadge status={item.computed?.status} />
                                    </Table.Cell>
                                    <Table.Cell>
                                        {formatTime(item.attendance?.checkInAt)}
                                    </Table.Cell>
                                    <Table.Cell>
                                        {formatTime(item.attendance?.checkOutAt)}
                                    </Table.Cell>
                                    <Table.Cell>
                                        <div className="flex gap-2">
                                            <Button
                                                size="xs"
                                                color="light"
                                                onClick={() => handleViewDetail(item.user._id)}
                                            >
                                                <HiEye className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                size="xs"
                                                color="light"
                                                onClick={() => handleEditClick(item.user)}
                                            >
                                                <HiPencil className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                size="xs"
                                                color="light"
                                                onClick={() => handleResetClick(item.user)}
                                            >
                                                <HiKey className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </Table.Cell>
                                </Table.Row>
                            ))}
                        </Table.Body>
                    </Table>
                </div>
            )}

            {/* Edit Modal */}
            <Modal show={editModal.open} onClose={() => setEditModal({ open: false, user: null })}>
                <Modal.Header>Edit Member: {editModal.user?.name}</Modal.Header>
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
                    <Button color="gray" onClick={() => setEditModal({ open: false, user: null })}>
                        Cancel
                    </Button>
                </Modal.Footer>
            </Modal>

            {/* Reset Password Modal */}
            <Modal show={resetModal.open} onClose={() => setResetModal({ open: false, user: null })}>
                <Modal.Header>Reset Password: {resetModal.user?.name}</Modal.Header>
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
                    <Button color="gray" onClick={() => setResetModal({ open: false, user: null })}>
                        Cancel
                    </Button>
                </Modal.Footer>
            </Modal>

            {/* Create User Modal */}
            <Modal show={createModal} onClose={() => { setCreateModal(false); resetCreateForm(); }}>
                <Modal.Header>Thêm nhân viên mới</Modal.Header>
                <Modal.Body>
                    {createError && (
                        <Alert color="failure" className="mb-4">{createError}</Alert>
                    )}
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label htmlFor="create-employeeCode" value="Mã NV *" />
                                <TextInput
                                    id="create-employeeCode"
                                    value={createForm.employeeCode}
                                    onChange={(e) => setCreateForm({ ...createForm, employeeCode: e.target.value })}
                                    placeholder="EMP001"
                                />
                            </div>
                            <div>
                                <Label htmlFor="create-role" value="Role *" />
                                <Select
                                    id="create-role"
                                    value={createForm.role}
                                    onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}
                                >
                                    <option value="EMPLOYEE">EMPLOYEE</option>
                                    <option value="MANAGER">MANAGER</option>
                                    <option value="ADMIN">ADMIN</option>
                                </Select>
                            </div>
                        </div>

                        <div>
                            <Label htmlFor="create-name" value="Họ tên *" />
                            <TextInput
                                id="create-name"
                                value={createForm.name}
                                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                                placeholder="Nguyễn Văn A"
                            />
                        </div>

                        <div>
                            <Label htmlFor="create-email" value="Email *" />
                            <TextInput
                                id="create-email"
                                type="email"
                                value={createForm.email}
                                onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                                placeholder="user@company.com"
                            />
                        </div>

                        <div>
                            <Label htmlFor="create-username" value="Username" />
                            <TextInput
                                id="create-username"
                                value={createForm.username}
                                onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })}
                                placeholder="Optional"
                            />
                        </div>

                        <div>
                            <Label htmlFor="create-password" value="Mật khẩu *" />
                            <TextInput
                                id="create-password"
                                type="password"
                                value={createForm.password}
                                onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                                placeholder="Min 8 characters"
                            />
                        </div>

                        <div>
                            <Label htmlFor="create-teamId" value="Team" />
                            <Select
                                id="create-teamId"
                                value={createForm.teamId}
                                onChange={(e) => setCreateForm({ ...createForm, teamId: e.target.value })}
                            >
                                <option value="">Select team...</option>
                                {teams.map((team) => (
                                    <option key={team._id} value={team._id}>
                                        {team.name}
                                    </option>
                                ))}
                            </Select>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label htmlFor="create-startDate" value="Ngày bắt đầu" />
                                <TextInput
                                    id="create-startDate"
                                    type="date"
                                    value={createForm.startDate}
                                    onChange={(e) => setCreateForm({ ...createForm, startDate: e.target.value })}
                                />
                            </div>
                            <div>
                                <Label htmlFor="create-isActive" value="Trạng thái" />
                                <Select
                                    id="create-isActive"
                                    value={createForm.isActive.toString()}
                                    onChange={(e) => setCreateForm({ ...createForm, isActive: e.target.value === 'true' })}
                                >
                                    <option value="true">Active</option>
                                    <option value="false">Inactive</option>
                                </Select>
                            </div>
                        </div>
                    </div>
                </Modal.Body>
                <Modal.Footer>
                    <Button onClick={handleCreateSubmit} disabled={createLoading}>
                        {createLoading ? <Spinner size="sm" className="mr-2" /> : <HiCheck className="mr-2" />}
                        Tạo nhân viên
                    </Button>
                    <Button color="gray" onClick={() => { setCreateModal(false); resetCreateForm(); }}>
                        Hủy
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