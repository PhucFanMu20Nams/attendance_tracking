import { useState } from 'react';
import {
    Label,
    TextInput,
    Textarea,
    Button,
    Spinner,
} from 'flowbite-react';
import { HiPlus } from 'react-icons/hi';
import { createRequest } from '../../api/requestApi';
import {
    buildIsoTimestamp,
    isCrossMidnightCheckout,
    getNextDayDisplay,
} from '../../utils/dateDisplay';

/**
 * Form for creating ADJUST_TIME requests.
 * Extracted from CreateRequestForm.jsx (Option B wrapper pattern).
 *
 * @param {Object} props
 * @param {Object} props.formData - Canonical wrapper draft state
 * @param {Function} props.onFieldChange - Update wrapper draft field
 * @param {boolean} props.isNextDayCheckout - Wrapper-managed next-day flag
 * @param {Function} props.setIsNextDayCheckout - Set wrapper next-day flag
 * @param {Function} props.onSuccess - Called after successful creation
 * @param {Function} props.setFormError - Set error message on parent
 * @param {Function} props.setFormSuccess - Set success message on parent
 */
export default function AdjustTimeForm({
    formData,
    onFieldChange,
    isNextDayCheckout,
    setIsNextDayCheckout,
    onSuccess,
    setFormError,
    setFormSuccess,
}) {
    // Get today in GMT+7 for default date
    const today = new Date().toLocaleDateString('sv-SE', {
        timeZone: 'Asia/Ho_Chi_Minh',
    });

    const [submitting, setSubmitting] = useState(false);

    const handleInputChange = (e) => {
        const { name, value } = e.target;

        // Clear checkbox if changing times
        if (name === 'checkInTime' || name === 'checkOutTime') {
            setIsNextDayCheckout(false);
        }

        onFieldChange(name, value);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        // Double-submit guard
        if (submitting) return;

        setFormError('');
        setFormSuccess('');

        // Validation: reason
        if (!formData.reason.trim()) {
            setFormError('Vui lòng nhập lý do');
            return;
        }
        if (formData.reason.trim().length > 1000) {
            setFormError('Lý do không được quá 1000 ký tự');
            return;
        }

        // ADJUST_TIME validations
        if (!formData.date) {
            setFormError('Vui lòng chọn ngày');
            return;
        }
        if (!formData.checkInTime && !formData.checkOutTime) {
            setFormError('Vui lòng nhập ít nhất check-in hoặc check-out');
            return;
        }
        // Cross-midnight validation: allow checkout < checkin (means next day)
        if (formData.checkInTime && formData.checkOutTime) {
            const isCrossMidnight = isCrossMidnightCheckout(formData.checkInTime, formData.checkOutTime);
            if (!isCrossMidnight && formData.checkOutTime <= formData.checkInTime) {
                setFormError('Giờ check-out phải sau giờ check-in');
                return;
            }
        }

        setSubmitting(true);
        try {
            const payload = {
                type: 'ADJUST_TIME',
                reason: formData.reason.trim(),
                date: formData.date,
            };

            if (formData.checkInTime) {
                payload.requestedCheckInAt = buildIsoTimestamp(formData.date, formData.checkInTime);
            }
            if (formData.checkOutTime) {
                // Cross-midnight detection:
                // 1. Auto-detect: checkout < checkin (both provided)
                // 2. Explicit: checkbox checked (for checkout-only case)
                const autoDetectCrossMidnight = isCrossMidnightCheckout(formData.checkInTime, formData.checkOutTime);
                const explicitCrossMidnight = isNextDayCheckout && !formData.checkInTime;
                const crossMidnight = autoDetectCrossMidnight || explicitCrossMidnight;

                payload.requestedCheckOutAt = buildIsoTimestamp(
                    formData.date,
                    formData.checkOutTime,
                    crossMidnight ? 1 : 0
                );
            }

            await createRequest(payload);
            setFormSuccess('Đã tạo yêu cầu thành công!');

            onSuccess?.();
        } catch (err) {
            const backendMsg = err.response?.data?.message;
            if (err.response?.status === 409) {
                if (backendMsg) {
                    setFormError(backendMsg);
                } else {
                    setFormError('Bạn đã có yêu cầu pending cho ngày này. Vui lòng chờ phê duyệt hoặc hủy yêu cầu cũ.');
                }
            } else {
                setFormError(backendMsg || 'Tạo yêu cầu thất bại');
            }
        } finally {
            setSubmitting(false);
        }
    };

    return (
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

                    {/* Cross-midnight auto-detection hint */}
                    {isCrossMidnightCheckout(formData.checkInTime, formData.checkOutTime) && (
                        <p className="text-xs text-indigo-600 mt-1">
                            ⏰ Check-out sẽ tính là ngày {getNextDayDisplay(formData.date)}
                        </p>
                    )}

                    {/* Checkbox for checkout-only cross-midnight */}
                    {formData.checkOutTime && !formData.checkInTime && (
                        <label className="flex items-center mt-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={isNextDayCheckout}
                                onChange={(e) => setIsNextDayCheckout(e.target.checked)}
                                className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                            />
                            <span className="ml-2 text-sm text-gray-700">
                                Check-out là ngày hôm sau
                                {isNextDayCheckout && ` (${getNextDayDisplay(formData.date)})`}
                            </span>
                        </label>
                    )}
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
    );
}
