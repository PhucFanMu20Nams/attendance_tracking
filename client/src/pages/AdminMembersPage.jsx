import { useState, useEffect, useCallback, useRef } from 'react';
import {
    Table, Button, Modal, Spinner, Alert, Select, Label, TextInput
} from 'flowbite-react';
import { HiRefresh, HiPencil, HiKey, HiEye, HiCheck, HiPlus } from 'react-icons/hi';
import { useNavigate } from 'react-router-dom';
import {
    getTeams, getTodayAttendance, updateUser, resetPassword
} from '../api/memberApi';
import { createUser } from '../api/adminApi';
import { PageHeader, StatusBadge } from '../components/ui';
import ToastNotification from '../components/ui/ToastNotification';
import EditMemberModal from '../components/modals/EditMemberModal';
import ResetPasswordModal from '../components/modals/ResetPasswordModal';
import { useToast } from '../hooks/useToast';
import { formatTime } from '../utils/dateTimeFormat';
import { isValidEmail, MAX_LENGTHS } from '../utils/validation';

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
    const { toast, showToast, hideToast } = useToast();

    // Filter states
    const [scope, setScope] = useState('company');
    const [teamId, setTeamId] = useState('');
    const [debouncedTeamId, setDebouncedTeamId] = useState(''); // Debounced to prevent spam requests
    const [teams, setTeams] = useState([]);

    // Data states
    const [members, setMembers] = useState([]);
    const [todayDate, setTodayDate] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Modal states (simplified with new components)
    const [editUser, setEditUser] = useState(null);
    const [resetUser, setResetUser] = useState(null);

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

    // Debounce teamId changes to prevent spam requests (Phase 5.1B)
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedTeamId(teamId);
        }, 300);
        return () => clearTimeout(timer);
    }, [teamId]);

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

    // Fetch members when scope/debouncedTeamId changes
    const fetchMembers = useCallback(async () => {
        const currentRequestId = ++requestIdRef.current;

        // Guard: if scope=team but no teamId selected, don't fetch yet
        if (scope === 'team' && !debouncedTeamId) {
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
            if (scope === 'team' && debouncedTeamId) {
                params.teamId = debouncedTeamId;
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
    }, [scope, debouncedTeamId]);

    useEffect(() => {
        fetchMembers();
    }, [fetchMembers]);

    // Edit member handler (simplified - uses EditMemberModal component)
    // Modal calls: onSubmit(data, userId) - errors propagate to modal's catch block
    const handleEditSubmit = async (data, userId) => {
        await updateUser(userId, data);
        // Modal already calls onClose() on success, no need setEditUser(null)
        showToast('Member updated successfully', 'success');
        fetchMembers();
    };

    // Reset password handler (simplified - uses ResetPasswordModal component)
    // Modal calls: onSubmit(password) - errors propagate to modal's catch block
    const handleResetSubmit = async (newPassword) => {
        if (!resetUser?._id) return; // Defensive guard
        await resetPassword(resetUser._id, newPassword);
        // Modal already calls onClose() on success, no need setResetUser(null)
        showToast('Password updated', 'success');
    };

    // Validate create form
    const validateCreateForm = () => {
        if (!createForm.employeeCode.trim()) return 'Employee code is required';
        if (!createForm.name.trim()) return 'Name is required';
        if (!createForm.email.trim()) return 'Email is required';
        if (!isValidEmail(createForm.email)) return 'Invalid email format';
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
                <Button color="light" onClick={fetchMembers} disabled={loading}>
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
                            if (e.target.value === 'company') {
                                setTeamId('');
                                setDebouncedTeamId(''); // Reset immediately for state cleanliness
                            }
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
                    {scope === 'team' && !debouncedTeamId
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
                                                onClick={() => setEditUser(item.user)}
                                            >
                                                <HiPencil className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                size="xs"
                                                color="light"
                                                onClick={() => setResetUser(item.user)}
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
            <EditMemberModal
                show={!!editUser}
                user={editUser}
                teams={teams}
                onClose={() => setEditUser(null)}
                onSubmit={handleEditSubmit}
            />

            {/* Reset Password Modal */}
            <ResetPasswordModal
                show={!!resetUser}
                userName={resetUser?.name}
                onClose={() => setResetUser(null)}
                onSubmit={handleResetSubmit}
            />

            {/* Create User Modal */}
            <Modal show={createModal} onClose={() => { if (!createLoading) { setCreateModal(false); resetCreateForm(); } }}>
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
                                    maxLength={MAX_LENGTHS.employeeCode}
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
                                maxLength={MAX_LENGTHS.name}
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
                                maxLength={MAX_LENGTHS.email}
                            />
                        </div>

                        <div>
                            <Label htmlFor="create-username" value="Username" />
                            <TextInput
                                id="create-username"
                                value={createForm.username}
                                onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })}
                                placeholder="Optional"
                                maxLength={MAX_LENGTHS.username}
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
                                maxLength={MAX_LENGTHS.password}
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
                    <Button color="gray" onClick={() => { setCreateModal(false); resetCreateForm(); }} disabled={createLoading}>
                        Hủy
                    </Button>
                </Modal.Footer>
            </Modal>

            {/* Toast */}
            <ToastNotification {...toast} onClose={hideToast} />
        </div>
    );
}