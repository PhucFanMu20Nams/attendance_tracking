import { useState, useMemo } from 'react';
import {
    Card,
    Label,
    TextInput,
    Textarea,
    Button,
    Alert,
    Spinner,
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
        date: today,
        checkInTime: '',
        checkOutTime: '',
        reason: '',
    }));
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState('');
    const [formSuccess, setFormSuccess] = useState('');

    // Handle input changes
    const handleInputChange = (e) => {
        const { name, value } = e.target;
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

        // Validation
        if (!formData.date) {
            setFormError('Vui lòng chọn ngày');
            return;
        }
        if (!formData.checkInTime && !formData.checkOutTime) {
            setFormError('Vui lòng nhập ít nhất check-in hoặc check-out');
            return;
        }
        if (!formData.reason.trim()) {
            setFormError('Vui lòng nhập lý do');
            return;
        }
        if (formData.reason.trim().length > 1000) {
            setFormError('Lý do không được quá 1000 ký tự');
            return;
        }
        if (formData.checkInTime && formData.checkOutTime && 
            formData.checkOutTime <= formData.checkInTime) {
            setFormError('Giờ check-out phải sau giờ check-in');
            return;
        }

        setSubmitting(true);
        try {
            const payload = {
                date: formData.date,
                reason: formData.reason.trim(),
            };

            if (formData.checkInTime) {
                payload.requestedCheckInAt = buildIsoTimestamp(formData.date, formData.checkInTime);
            }
            if (formData.checkOutTime) {
                payload.requestedCheckOutAt = buildIsoTimestamp(formData.date, formData.checkOutTime);
            }

            await createRequest(payload);
            setFormSuccess('Đã tạo yêu cầu thành công!');
            
            // Reset form
            setFormData({
                date: today,
                checkInTime: '',
                checkOutTime: '',
                reason: '',
            });
            
            // Notify parent
            onSuccess?.();
        } catch (err) {
            // 409 = Duplicate pending request (backend already handles via partial unique index + E11000 catch)
            if (err.response?.status === 409) {
                setFormError('Bạn đã có yêu cầu pending cho ngày này. Vui lòng chờ phê duyệt hoặc hủy yêu cầu cũ.');
            } else {
                setFormError(err.response?.data?.message || 'Tạo yêu cầu thất bại');
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

                {/* Reason */}
                <div>
                    <Label htmlFor="reason" value="Lý do *" />
                    <Textarea
                        id="reason"
                        name="reason"
                        value={formData.reason}
                        onChange={handleInputChange}
                        placeholder="Nhập lý do điều chỉnh..."
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
