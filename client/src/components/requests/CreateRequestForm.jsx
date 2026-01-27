import { useState, useMemo } from 'react';
import {
    Card,
    Label,
    TextInput,
    Textarea,
    Button,
    Alert,
    Spinner,
    Select,
} from 'flowbite-react';
import { HiPlus } from 'react-icons/hi';
import { createRequest } from '../../api/requestApi';

/**
 * Form for creating attendance adjustment requests.
 * Extracted from RequestsPage.jsx.
 * 
 * @param {Object} props
 * @param {Function} props.onSuccess - Called after successful creation
 */
export default function CreateRequestForm({ onSuccess }) {
    // Get today in GMT+7 for default date
    const today = useMemo(() => {
        return new Date().toLocaleDateString('sv-SE', {
            timeZone: 'Asia/Ho_Chi_Minh',
        });
    }, []);

    // Form state
    const [formData, setFormData] = useState(() => ({
        requestType: 'ADJUST_TIME',  // Default to preserve backward compat
        date: today,
        checkInTime: '',
        checkOutTime: '',
        leaveStartDate: today,       // Default to today for UX
        leaveEndDate: today,
        leaveType: 'ANNUAL',         // Default to most common type
        reason: '',
    }));
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState('');
    const [formSuccess, setFormSuccess] = useState('');

    // Handle input changes
    const handleInputChange = (e) => {
        const { name, value } = e.target;

        // P0 Fix: Clear errors/success when switching type
        if (name === 'requestType') {
            setFormError('');
            setFormSuccess('');

            // Single setFormData call with branching logic
            setFormData((prev) => {
                if (value === 'LEAVE') {
                    return {
                        ...prev,
                        requestType: value,
                        checkInTime: '',
                        checkOutTime: '',
                    };
                }
                return {
                    ...prev,
                    requestType: value,
                    leaveStartDate: today,
                    leaveEndDate: today,
                    leaveType: 'ANNUAL',
                };
            });

            return;  // Early return to avoid double state update
        }

        // Normal field update
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    // Build ISO timestamp from date + time (GMT+7)
    const buildIsoTimestamp = (dateStr, timeStr) => {
        if (!dateStr || !timeStr) return null;
        const hhmm = timeStr.slice(0, 5);
        return `${dateStr}T${hhmm}:00+07:00`;
    };

    // Handle form submit
    const handleSubmit = async (e) => {
        e.preventDefault();
        
        // Double-submit guard
        if (submitting) return;
        
        setFormError('');
        setFormSuccess('');

        // Validation: Common reason check first
        if (!formData.reason.trim()) {
            setFormError('Vui lòng nhập lý do');
            return;
        }
        if (formData.reason.trim().length > 1000) {
            setFormError('Lý do không được quá 1000 ký tự');
            return;
        }

        // Type-specific validation
        if (formData.requestType === 'LEAVE') {
            // LEAVE validations
            if (!formData.leaveStartDate || !formData.leaveEndDate) {
                setFormError('Vui lòng chọn ngày bắt đầu và kết thúc');
                return;
            }
            if (formData.leaveStartDate > formData.leaveEndDate) {
                setFormError('Ngày kết thúc phải sau hoặc bằng ngày bắt đầu');
                return;
            }
            // P1: Max 30 days validation (timezone-safe calculation)
            const toUtcDay = (dateStr) => {
                const [y, m, d] = dateStr.split('-').map(Number);
                return Date.UTC(y, m - 1, d);
            };
            const diffDays = Math.floor(
                (toUtcDay(formData.leaveEndDate) - toUtcDay(formData.leaveStartDate)) / 86400000
            ) + 1;
            if (diffDays > 30) {
                setFormError('Khoảng nghỉ không được vượt quá 30 ngày');
                return;
            }
        } else {
            // ADJUST_TIME validations (existing logic)
            if (!formData.date) {
                setFormError('Vui lòng chọn ngày');
                return;
            }
            if (!formData.checkInTime && !formData.checkOutTime) {
                setFormError('Vui lòng nhập ít nhất check-in hoặc check-out');
                return;
            }
            if (formData.checkInTime && formData.checkOutTime && 
                formData.checkOutTime <= formData.checkInTime) {
                setFormError('Giờ check-out phải sau giờ check-in');
                return;
            }
        }

        setSubmitting(true);
        try {
            const payload = {
                type: formData.requestType,
                reason: formData.reason.trim(),
            };

            if (formData.requestType === 'LEAVE') {
                payload.leaveStartDate = formData.leaveStartDate;
                payload.leaveEndDate = formData.leaveEndDate;
                payload.leaveType = formData.leaveType;
            } else {
                // ADJUST_TIME (existing logic)
                payload.date = formData.date;
                if (formData.checkInTime) {
                    payload.requestedCheckInAt = buildIsoTimestamp(formData.date, formData.checkInTime);
                }
                if (formData.checkOutTime) {
                    payload.requestedCheckOutAt = buildIsoTimestamp(formData.date, formData.checkOutTime);
                }
            }

            await createRequest(payload);
            setFormSuccess('Đã tạo yêu cầu thành công!');
            
            // Reset form
            setFormData({
                requestType: 'ADJUST_TIME',
                date: today,
                checkInTime: '',
                checkOutTime: '',
                leaveStartDate: today,
                leaveEndDate: today,
                leaveType: 'ANNUAL',
                reason: '',
            });
            
            // Notify parent
            onSuccess?.();
        } catch (err) {
            // P0: Smart 409 handling - prioritize backend message
            const backendMsg = err.response?.data?.message;
            if (err.response?.status === 409) {
                // Prioritize backend message (handles both duplicate + overlap)
                if (backendMsg) {
                    setFormError(backendMsg);
                } else if (formData.requestType === 'ADJUST_TIME') {
                    setFormError('Bạn đã có yêu cầu pending cho ngày này. Vui lòng chờ phê duyệt hoặc hủy yêu cầu cũ.');
                } else {
                    setFormError('Yêu cầu bị trùng hoặc chồng lấn với yêu cầu khác.');
                }
            } else {
                setFormError(backendMsg || 'Tạo yêu cầu thất bại');
            }
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Card>
            <h2 className="text-lg font-semibold text-gray-700 mb-4">Tạo yêu cầu mới</h2>

            {formError && (
                <Alert color="failure" className="mb-4" onDismiss={() => setFormError('')}>
                    {formError}
                </Alert>
            )}
            {formSuccess && (
                <Alert color="success" className="mb-4" onDismiss={() => setFormSuccess('')}>
                    {formSuccess}
                </Alert>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
                {/* Type Selector */}
                <div>
                    <Label htmlFor="requestType" value="Loại yêu cầu *" />
                    <Select
                        id="requestType"
                        name="requestType"
                        value={formData.requestType}
                        onChange={handleInputChange}
                        required
                    >
                        <option value="ADJUST_TIME">Điều chỉnh giờ</option>
                        <option value="LEAVE">Nghỉ phép</option>
                    </Select>
                </div>

                {/* Conditional Fields based on type */}
                {formData.requestType === 'ADJUST_TIME' ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Date */}
                        <div>
                            <Label htmlFor="date" value="Ngày cần điều chỉnh *" />
                            <TextInput
                                id="date"
                                name="date"
                                type="date"
                                value={formData.date}
                                onChange={handleInputChange}
                                max={today}
                                required
                            />
                        </div>

                        {/* Check-in Time */}
                        <div>
                            <Label htmlFor="checkInTime" value="Giờ check-in (tùy chọn)" />
                            <TextInput
                                id="checkInTime"
                                name="checkInTime"
                                type="time"
                                value={formData.checkInTime}
                                onChange={handleInputChange}
                            />
                        </div>

                        {/* Check-out Time */}
                        <div>
                            <Label htmlFor="checkOutTime" value="Giờ check-out (tùy chọn)" />
                            <TextInput
                                id="checkOutTime"
                                name="checkOutTime"
                                type="time"
                                value={formData.checkOutTime}
                                onChange={handleInputChange}
                            />
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Leave Start Date */}
                        <div>
                            <Label htmlFor="leaveStartDate" value="Từ ngày *" />
                            <TextInput
                                id="leaveStartDate"
                                name="leaveStartDate"
                                type="date"
                                value={formData.leaveStartDate}
                                onChange={handleInputChange}
                                required
                            />
                        </div>

                        {/* Leave End Date */}
                        <div>
                            <Label htmlFor="leaveEndDate" value="Đến ngày *" />
                            <TextInput
                                id="leaveEndDate"
                                name="leaveEndDate"
                                type="date"
                                value={formData.leaveEndDate}
                                onChange={handleInputChange}
                                required
                            />
                        </div>

                        {/* Leave Type */}
                        <div>
                            <Label htmlFor="leaveType" value="Loại nghỉ" />
                            <Select
                                id="leaveType"
                                name="leaveType"
                                value={formData.leaveType}
                                onChange={handleInputChange}
                            >
                                <option value="ANNUAL">Phép năm</option>
                                <option value="SICK">Ốm đau</option>
                                <option value="UNPAID">Không lương</option>
                            </Select>
                        </div>
                    </div>
                )}

                {/* Reason */}
                <div>
                    <Label htmlFor="reason" value="Lý do *" />
                    <Textarea
                        id="reason"
                        name="reason"
                        value={formData.reason}
                        onChange={handleInputChange}
                        placeholder={
                            formData.requestType === 'LEAVE' 
                                ? 'Nhập lý do nghỉ phép...'
                                : 'Nhập lý do điều chỉnh...'
                        }
                        rows={3}
                        maxLength={1000}
                        required
                    />
                    <p className="text-xs text-gray-500 mt-1">
                        {formData.reason.length}/1000 ký tự
                    </p>
                </div>

                {/* Submit */}
                <Button type="submit" disabled={submitting} color="cyan">
                    {submitting ? <Spinner size="sm" className="mr-2" /> : <HiPlus className="mr-2" />}
                    Tạo yêu cầu
                </Button>
            </form>
        </Card>
    );
}
