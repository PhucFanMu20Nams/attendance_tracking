import { useState, useEffect, useRef } from 'react';
import { Modal, Button, Label, TextInput, Select, Alert, Spinner } from 'flowbite-react';
import { HiCheck } from 'react-icons/hi';
import { createUser } from '../../api/adminApi';
import { isValidEmail, MAX_LENGTHS } from '../../utils/validation';

/**
 * Modal for creating a new member/user.
 * Extracted from AdminMembersPage.jsx.
 * 
 * Features:
 * - Form validation with proper error messages
 * - Loading state with double-submit protection
 * - Reset form on close/success
 * - isMountedRef to prevent setState after unmount
 * - Safe callback handling (won't crash if parent throws)
 * 
 * @param {Object} props
 * @param {boolean} props.show - Modal visibility
 * @param {Array} props.teams - List of teams for dropdown [{ _id, name }]
 * @param {Function} props.onClose - Close handler () => void
 * @param {Function} props.onSuccess - Called after successful creation () => void
 */
export default function CreateMemberModal({ show, teams, onClose, onSuccess }) {
    // ═══════════════════════════════════════════════════════════════════════
    // FORM STATE
    // ═══════════════════════════════════════════════════════════════════════

    const [form, setForm] = useState({
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
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // ═══════════════════════════════════════════════════════════════════════
    // P1 FIX: isMountedRef to prevent setState after unmount
    // ═══════════════════════════════════════════════════════════════════════

    const isMountedRef = useRef(true);

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    // ═══════════════════════════════════════════════════════════════════════
    // P2 FIX: Reset form when modal closes (prevents flicker)
    // Inline logic to avoid eslint exhaustive-deps warning
    // ═══════════════════════════════════════════════════════════════════════

    useEffect(() => {
        if (!show) {
            setForm({
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
            setError('');
        }
    }, [show]);

    // ═══════════════════════════════════════════════════════════════════════
    // VALIDATION
    // P2 FIX: Trim password to prevent whitespace-only passwords
    // ═══════════════════════════════════════════════════════════════════════

    const validateForm = () => {
        if (!form.employeeCode.trim()) return 'Employee code is required';
        if (!form.name.trim()) return 'Name is required';
        if (!form.email.trim()) return 'Email is required';
        if (!isValidEmail(form.email)) return 'Invalid email format';
        if (!form.password) return 'Password is required';
        // P2 FIX: Trim password before length check to prevent whitespace-only passwords
        if (form.password.trim().length < 8) return 'Password must be at least 8 characters';
        if (!form.role) return 'Role is required';
        return null;
    };

    // ═══════════════════════════════════════════════════════════════════════
    // SUBMIT HANDLER
    // P1 FIX: Double submit guard, isMountedRef check, safe callbacks
    // ═══════════════════════════════════════════════════════════════════════

    const handleSubmit = async () => {
        // P1 FIX: Guard against double submit
        if (loading) return;

        const validationError = validateForm();
        if (validationError) {
            setError(validationError);
            return;
        }

        setLoading(true);
        setError('');

        try {
            const payload = {
                employeeCode: form.employeeCode.trim(),
                name: form.name.trim(),
                email: form.email.trim(),
                password: form.password, // Backend will hash, don't trim here
                role: form.role,
            };

            // Optional fields - only send if not empty
            if (form.username.trim()) payload.username = form.username.trim();
            if (form.teamId) payload.teamId = form.teamId;
            if (form.startDate) payload.startDate = form.startDate;
            // isActive is always boolean, no need to check !== undefined
            payload.isActive = form.isActive;

            await createUser(payload);

            // Success - P1 FIX: Wrap callbacks in try-catch to prevent crash
            // Call onClose first (modal closes), then onSuccess (parent refreshes data)
            try { onClose?.(); } catch (e) { console.error('onClose error:', e); }
            try { onSuccess?.(); } catch (e) { console.error('onSuccess error:', e); }
            // Note: resetForm is handled by useEffect when show becomes false
        } catch (err) {
            // P1 FIX: Only set error if still mounted
            if (isMountedRef.current) {
                setError(err.response?.data?.message || 'Failed to create member');
            }
        } finally {
            // P1 FIX: Only setLoading if still mounted
            if (isMountedRef.current) {
                setLoading(false);
            }
        }
    };

    // ═══════════════════════════════════════════════════════════════════════
    // CLOSE HANDLER
    // ═══════════════════════════════════════════════════════════════════════

    const handleClose = () => {
        if (loading) return; // Prevent close during loading
        onClose();
        // Note: resetForm is handled by useEffect when show becomes false
    };

    // ═══════════════════════════════════════════════════════════════════════
    // RENDER
    // ═══════════════════════════════════════════════════════════════════════

    return (
        <Modal show={show} onClose={handleClose}>
            <Modal.Header>Thêm nhân viên mới</Modal.Header>
            <Modal.Body>
                {error && (
                    <Alert color="failure" className="mb-4">{error}</Alert>
                )}
                <div className="space-y-4">
                    {/* Row 1: Employee Code + Role */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label htmlFor="create-employeeCode" value="Mã NV *" />
                            <TextInput
                                id="create-employeeCode"
                                value={form.employeeCode}
                                onChange={(e) => setForm({ ...form, employeeCode: e.target.value })}
                                placeholder="EMP001"
                                maxLength={MAX_LENGTHS.employeeCode}
                                autoComplete="off"
                            />
                        </div>
                        <div>
                            <Label htmlFor="create-role" value="Role *" />
                            <Select
                                id="create-role"
                                value={form.role}
                                onChange={(e) => setForm({ ...form, role: e.target.value })}
                            >
                                <option value="EMPLOYEE">EMPLOYEE</option>
                                <option value="MANAGER">MANAGER</option>
                                <option value="ADMIN">ADMIN</option>
                            </Select>
                        </div>
                    </div>

                    {/* Name */}
                    <div>
                        <Label htmlFor="create-name" value="Họ tên *" />
                        <TextInput
                            id="create-name"
                            value={form.name}
                            onChange={(e) => setForm({ ...form, name: e.target.value })}
                            placeholder="Nguyễn Văn A"
                            maxLength={MAX_LENGTHS.name}
                            autoComplete="off"
                        />
                    </div>

                    {/* Email */}
                    <div>
                        <Label htmlFor="create-email" value="Email *" />
                        <TextInput
                            id="create-email"
                            type="email"
                            value={form.email}
                            onChange={(e) => setForm({ ...form, email: e.target.value })}
                            placeholder="user@company.com"
                            maxLength={MAX_LENGTHS.email}
                            autoComplete="off"
                        />
                    </div>

                    {/* Username (optional) */}
                    <div>
                        <Label htmlFor="create-username" value="Username" />
                        <TextInput
                            id="create-username"
                            value={form.username}
                            onChange={(e) => setForm({ ...form, username: e.target.value })}
                            placeholder="Optional"
                            maxLength={MAX_LENGTHS.username}
                            autoComplete="off"
                        />
                    </div>

                    {/* Password */}
                    <div>
                        <Label htmlFor="create-password" value="Mật khẩu *" />
                        <TextInput
                            id="create-password"
                            type="password"
                            value={form.password}
                            onChange={(e) => setForm({ ...form, password: e.target.value })}
                            placeholder="Min 8 characters"
                            maxLength={MAX_LENGTHS.password}
                            autoComplete="new-password"
                        />
                    </div>

                    {/* Team (optional) */}
                    <div>
                        <Label htmlFor="create-teamId" value="Team" />
                        <Select
                            id="create-teamId"
                            value={form.teamId}
                            onChange={(e) => setForm({ ...form, teamId: e.target.value })}
                        >
                            <option value="">Select team...</option>
                            {(teams || []).map((team) => (
                                <option key={team._id} value={team._id}>
                                    {team.name}
                                </option>
                            ))}
                        </Select>
                    </div>

                    {/* Row: Start Date + Status */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label htmlFor="create-startDate" value="Ngày bắt đầu" />
                            <TextInput
                                id="create-startDate"
                                type="date"
                                value={form.startDate}
                                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                            />
                        </div>
                        <div>
                            <Label htmlFor="create-isActive" value="Trạng thái" />
                            <Select
                                id="create-isActive"
                                value={form.isActive.toString()}
                                onChange={(e) => setForm({ ...form, isActive: e.target.value === 'true' })}
                            >
                                <option value="true">Active</option>
                                <option value="false">Inactive</option>
                            </Select>
                        </div>
                    </div>
                </div>
            </Modal.Body>
            <Modal.Footer>
                <Button onClick={handleSubmit} disabled={loading}>
                    {loading ? <Spinner size="sm" className="mr-2" /> : <HiCheck className="mr-2" />}
                    Tạo nhân viên
                </Button>
                <Button color="gray" onClick={handleClose} disabled={loading}>
                    Hủy
                </Button>
            </Modal.Footer>
        </Modal>
    );
}
