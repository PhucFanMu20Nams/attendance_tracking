import { useState } from 'react';
import {
    Card,
    Label,
    TextInput,
    Textarea,
    Button,
    Alert,
    Spinner,
    Select,
    Modal,
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
    // Get today in GMT+7 for default date (recompute on each render to avoid stale)
    const today = new Date().toLocaleDateString('sv-SE', {
        timeZone: 'Asia/Ho_Chi_Minh',
    });

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
        // OT fields
        estimatedEndTime: '',  // Format: "HH:mm" (e.g., "20:00")
    }));
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState('');
    const [formSuccess, setFormSuccess] = useState('');
    const [isNextDayCheckout, setIsNextDayCheckout] = useState(false);
    // OT modal state
    const [showOtConfirmModal, setShowOtConfirmModal] = useState(false);
    const [estimatedOtMinutes, setEstimatedOtMinutes] = useState(0);

    // Handle input changes
    const handleInputChange = (e) => {
        const { name, value } = e.target;

        // P0 Fix: Clear errors/success when switching type
        if (name === 'requestType') {
            setFormError('');
            setFormSuccess('');
            setIsNextDayCheckout(false);

            setFormData((prev) => {
                if (value === 'LEAVE') {
                    return {
                        ...prev,
                        requestType: value,
                        checkInTime: '',
                        checkOutTime: '',
                        estimatedEndTime: '',  // Clear OT field
                    };
                } else if (value === 'OT_REQUEST') {
                    // Clear non-OT fields
                    return {
                        ...prev,
                        requestType: value,
                        date: today,  // Keep today
                        checkInTime: '',
                        checkOutTime: '',
                        leaveStartDate: today,
                        leaveEndDate: today,
                        leaveType: 'ANNUAL',  // Reset for clean state
                        estimatedEndTime: '',
                    };
                } else {
                    // ADJUST_TIME
                    return {
                        ...prev,
                        requestType: value,
                        leaveStartDate: today,
                        leaveEndDate: today,
                        leaveType: 'ANNUAL',
                        estimatedEndTime: '',  // Clear OT field
                    };
                }
            });

            return;  // Early return to avoid double state update
        }

        // Clear checkbox if changing times (user might be adjusting)
        if (name === 'checkInTime' || name === 'checkOutTime') {
            setIsNextDayCheckout(false);
        }

        // Normal field update
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    /**
     * Add days to a date string (timezone-safe, pure string manipulation)
     * Handles month/year boundaries correctly
     * Returns null if input is invalid
     */
    const addDaysToDate = (dateStr, days) => {
        // Defensive: validate input format
        if (!dateStr || typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
            return null;
        }
        
        const [year, month, day] = dateStr.split('-').map(Number);
        
        // Defensive: check for NaN after parsing
        if (isNaN(year) || isNaN(month) || isNaN(day)) {
            return null;
        }
        
        // Defensive: validate date ranges
        if (month < 1 || month > 12 || day < 1 || day > 31) {
            return null;
        }
        
        // Days in each month (non-leap year)
        const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        
        // Check leap year for February
        const isLeapYear = (y) => (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0);
        if (isLeapYear(year)) {
            daysInMonth[1] = 29;
        }
        
        let newDay = day + days;
        let newMonth = month;
        let newYear = year;
        
        // Handle month overflow
        while (newDay > daysInMonth[newMonth - 1]) {
            newDay -= daysInMonth[newMonth - 1];
            newMonth++;
            
            // Handle year overflow
            if (newMonth > 12) {
                newMonth = 1;
                newYear++;
                // Recalculate leap year for new year
                daysInMonth[1] = isLeapYear(newYear) ? 29 : 28;
            }
        }
        
        return `${newYear}-${String(newMonth).padStart(2, '0')}-${String(newDay).padStart(2, '0')}`;
    };

    /**
     * Detect if checkout time is cross-midnight (checkout < checkin means next day)
     * Only applies when BOTH times are provided
     */
    const isCrossMidnightCheckout = (checkInTime, checkOutTime) => {
        if (!checkInTime || !checkOutTime) return false;
        // String comparison: "02:00" < "22:00" = true → cross-midnight
        return checkOutTime < checkInTime;
    };

    /**
     * Format next day date for hint display (DD/MM/YYYY)
     */
    const getNextDayDisplay = (dateStr) => {
        if (!dateStr) return '';
        const nextDay = addDaysToDate(dateStr, 1);
        if (!nextDay) return ''; // Handle invalid input
        const [year, month, day] = nextDay.split('-');
        return `${day}/${month}/${year}`;
    };

    // Build ISO timestamp from date + time (GMT+7)
    // Supports cross-midnight by adding days to the date
    const buildIsoTimestamp = (dateStr, timeStr, addDays = 0) => {
        if (!dateStr || !timeStr) return null;
        
        let targetDate = dateStr;
        if (addDays > 0) {
            targetDate = addDaysToDate(dateStr, addDays);
            if (!targetDate) return null; // Handle invalid date arithmetic
        }
        
        const hhmm = timeStr.slice(0, 5);
        return `${targetDate}T${hhmm}:00+07:00`;
    };

    /**
     * Validate OT request business rules
     * REUSES existing buildIsoTimestamp helper
     */
    const validateOtRequest = () => {
        const { date, estimatedEndTime, reason } = formData;

        // Required fields
        if (!date) return { valid: false, error: 'Vui lòng chọn ngày làm OT' };
        if (!estimatedEndTime) return { valid: false, error: 'Vui lòng nhập giờ về dự kiến' };
        if (!reason?.trim()) return { valid: false, error: 'Vui lòng nhập lý do' };

        // E1: No retroactive (date check)
        const todayStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });
        if (date < todayStr) {
            return { valid: false, error: 'Không thể đăng ký OT cho ngày trong quá khứ' };
        }

        // E1.5: Same-day retroactive time check (CRITICAL - matches backend validation)
        // Backend checks: if (date === today && estimatedEndTime <= now) reject
        // Both dates are compared in UTC internally by JavaScript for timezone-safe comparison
        if (date === todayStr) {
            const now = new Date();
            const estimatedTime = new Date(`${date}T${estimatedEndTime}:00+07:00`);
            
            if (estimatedTime <= now) {
                return { 
                    valid: false, 
                    error: 'Giờ về dự kiến phải sau thời điểm hiện tại. Không thể đăng ký OT đã qua.' 
                };
            }
        }

        // D1: Must be after 17:31
        if (estimatedEndTime <= '17:31') {
            return { valid: false, error: 'Giờ về phải sau 17:31 (hết giờ làm việc)' };
        }

        // D1: Minimum 30 minutes
        try {
            const otStart = new Date(`${date}T17:31:00+07:00`);
            const otEnd = new Date(`${date}T${estimatedEndTime}:00+07:00`);
            const diffMinutes = Math.floor((otEnd - otStart) / 60000);

            if (diffMinutes < 30) {
                return { valid: false, error: 'Thời gian OT tối thiểu là 30 phút (từ 18:01 trở đi)' };
            }

            // Sanity check
            if (estimatedEndTime > '23:59') {
                return { valid: false, error: 'Giờ về không hợp lệ' };
            }

            return { valid: true, error: '', otMinutes: diffMinutes };
        } catch (err) {
            return { valid: false, error: 'Ngày hoặc giờ không hợp lệ' };
        }
    };

    // Handle form submit
    const handleSubmit = async (e) => {
        e.preventDefault();
        
        // Double-submit guard
        if (submitting) return;
        
        setFormError('');
        setFormSuccess('');

        // OT_REQUEST HANDLING
        if (formData.requestType === 'OT_REQUEST') {
            const validation = validateOtRequest();
            
            if (!validation.valid) {
                setFormError(validation.error);
                return;
            }

            // Clear form error to avoid duplicate display in modal
            setFormError('');
            
            // Show confirmation modal (J2 requirement)
            setEstimatedOtMinutes(validation.otMinutes);
            setShowOtConfirmModal(true);
            return; // Wait for user confirmation
        }

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
            // Cross-midnight validation: allow checkout < checkin (means next day)
            // Backend will validate session length (max 24h)
            if (formData.checkInTime && formData.checkOutTime) {
                const isCrossMidnight = isCrossMidnightCheckout(formData.checkInTime, formData.checkOutTime);
                if (!isCrossMidnight && formData.checkOutTime <= formData.checkInTime) {
                    setFormError('Giờ check-out phải sau giờ check-in');
                    return;
                }
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
                // ADJUST_TIME: Support cross-midnight checkout
                payload.date = formData.date;
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
            }

            await createRequest(payload);
            setFormSuccess('Đã tạo yêu cầu thành công!');
            
            // Reset form
            // Fix #3 (P3): Include estimatedEndTime to prevent controlled/uncontrolled warning
            setFormData({
                requestType: 'ADJUST_TIME',
                date: today,
                checkInTime: '',
                checkOutTime: '',
                leaveStartDate: today,
                leaveEndDate: today,
                leaveType: 'ANNUAL',
                reason: '',
                estimatedEndTime: '',
            });
            setIsNextDayCheckout(false);
            
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

    /**
     * Handle OT confirmation from modal
     * REUSES existing buildIsoTimestamp helper
     */
    const handleConfirmOtRequest = async () => {
        setSubmitting(true);
        setFormError('');

        try {
            // Build payload
            const payload = {
                type: 'OT_REQUEST',
                date: formData.date,
                estimatedEndTime: buildIsoTimestamp(formData.date, formData.estimatedEndTime, 0),
                reason: formData.reason.trim()
            };

            await createRequest(payload);

            // Success
            setFormSuccess('Đã gửi yêu cầu OT thành công!');
            
            // Reset form (keep today as default)
            setFormData({
                requestType: 'ADJUST_TIME',
                date: today,
                checkInTime: '',
                checkOutTime: '',
                leaveStartDate: today,
                leaveEndDate: today,
                leaveType: 'ANNUAL',
                reason: '',
                estimatedEndTime: '',
            });

            setShowOtConfirmModal(false);

            // Trigger parent refetch
            if (onSuccess) {
                onSuccess();
            }

        } catch (err) {
            const errorMsg = err.response?.data?.message || 'Không thể tạo yêu cầu OT';
            setFormError(errorMsg);
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
                        <option value="OT_REQUEST">Đăng ký OT</option>
                    </Select>
                </div>

                {/* Conditional Fields based on type */}
                {/* Fix #1 (P3): Split ternary into 3 explicit conditionals to prevent field overlap */}
                {formData.requestType === 'ADJUST_TIME' && (
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
                )}

                {formData.requestType === 'LEAVE' && (
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

                {/* OT_REQUEST Fields */}
                {formData.requestType === 'OT_REQUEST' && (
                    <div className="space-y-4 p-4 bg-purple-50 border border-purple-200 rounded-lg">
                        <div className="flex items-center space-x-2 mb-2">
                            <svg className="w-5 h-5 text-purple-600" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                            </svg>
                            <h3 className="font-semibold text-purple-900">Đăng ký làm thêm giờ (OT)</h3>
                        </div>

                        {/* Date Field */}
                        <div>
                            <Label htmlFor="ot-date" value="Ngày làm OT *" />
                            <TextInput
                                id="ot-date"
                                name="date"
                                type="date"
                                value={formData.date}
                                onChange={handleInputChange}
                                min={today}
                                required
                            />
                            <p className="text-xs text-gray-600 mt-1">
                                Chỉ có thể đăng ký cho ngày hôm nay hoặc tương lai
                            </p>
                        </div>

                        {/* Estimated End Time */}
                        <div>
                            <Label htmlFor="ot-time" value="Dự kiến giờ về *" />
                            <TextInput
                                id="ot-time"
                                name="estimatedEndTime"
                                type="time"
                                value={formData.estimatedEndTime}
                                onChange={handleInputChange}
                                required
                            />
                            <div className="text-xs text-gray-600 mt-1 space-y-1">
                                <p>Phải sau 17:31 (hết giờ làm việc)</p>
                                <p>Tối thiểu 30 phút OT (tức là từ 18:01 trở đi)</p>
                            </div>
                        </div>

                        {/* Real-time OT Duration Display */}
                        {formData.date && formData.estimatedEndTime && (() => {
                            try {
                                const otStart = new Date(`${formData.date}T17:31:00+07:00`);
                                const otEnd = new Date(`${formData.date}T${formData.estimatedEndTime}:00+07:00`);
                                const minutes = Math.floor((otEnd - otStart) / 60000);
                                
                                if (minutes > 0) {
                                    const hours = Math.floor(minutes / 60);
                                    const mins = minutes % 60;
                                    const timeStr = hours > 0 ? `${hours} giờ ${mins} phút` : `${mins} phút`;
                                    
                                    return (
                                        <Alert color={minutes >= 30 ? 'success' : 'warning'}>
                                            <div className="flex items-center">
                                                <span className="font-semibold mr-2">Thời gian OT dự kiến:</span>
                                                <span className="text-lg">{timeStr}</span>
                                                {minutes < 30 && (
                                                    <span className="ml-2 text-sm">(Tối thiểu 30 phút)</span>
                                                )}
                                            </div>
                                        </Alert>
                                    );
                                }
                            } catch (e) {
                                // Invalid date/time
                            }
                            return null;
                        })()}

                        {/* Reason */}
                        <div>
                            <Label htmlFor="ot-reason" value="Lý do *" />
                            <Textarea
                                id="ot-reason"
                                name="reason"
                                value={formData.reason}
                                onChange={handleInputChange}
                                placeholder="Ví dụ: Deploy production, Fix critical bug..."
                                rows={3}
                                required
                            />
                        </div>

                        {/* Notice */}
                        <Alert color="warning">
                            <div className="text-sm">
                                <p className="font-semibold mb-1">Lưu ý:</p>
                                <ul className="list-disc list-inside space-y-1 text-xs">
                                    <li>Phải có approval từ manager trước khi checkout</li>
                                    <li>Nếu không có approval: giờ làm tính đến 17:30, OT = 0</li>
                                    <li>Có thể hủy nếu còn ở trạng thái PENDING</li>
                                </ul>
                            </div>
                        </Alert>
                    </div>
                )}

                {/* Reason */}
                {/* Fix #2 (P3): Hide common reason field for OT (has its own in OT block) */}
                {formData.requestType !== 'OT_REQUEST' && (
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
                )}

                {/* Submit */}
                <Button type="submit" disabled={submitting} color="cyan">
                    {submitting ? <Spinner size="sm" className="mr-2" /> : <HiPlus className="mr-2" />}
                    Tạo yêu cầu
                </Button>
            </form>

            {/* OT Confirmation Modal */}
            <Modal 
                show={showOtConfirmModal} 
                onClose={() => !submitting && setShowOtConfirmModal(false)}
                size="lg"
            >
                <Modal.Header>
                    <div className="flex items-center space-x-2">
                        <svg className="w-6 h-6 text-purple-600" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                        </svg>
                        <span>Xác nhận đăng ký OT</span>
                    </div>
                </Modal.Header>
                
                <Modal.Body>
                    <div className="space-y-4">
                        {/* OT Info */}
                        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                            <h3 className="font-semibold text-purple-900 mb-3">
                                Thông tin đăng ký OT
                            </h3>
                            
                            <div className="space-y-2">
                                <div className="flex justify-between">
                                    <span className="text-gray-600">Ngày:</span>
                                    <span className="font-medium">
                                        {new Date(formData.date + 'T00:00:00+07:00').toLocaleDateString('vi-VN')}
                                    </span>
                                </div>
                                
                                <div className="flex justify-between">
                                    <span className="text-gray-600">Dự kiến về:</span>
                                    <span className="font-medium">{formData.estimatedEndTime}</span>
                                </div>
                                
                                <div className="flex justify-between bg-green-50 rounded p-2">
                                    <span className="text-gray-600">Thời gian OT:</span>
                                    <span className="font-bold text-green-600">
                                        {Math.floor(estimatedOtMinutes / 60) > 0 && `${Math.floor(estimatedOtMinutes / 60)} giờ `}
                                        {estimatedOtMinutes % 60} phút
                                    </span>
                                </div>
                                
                                <div className="pt-2 border-t">
                                    <span className="text-gray-600 block mb-1">Lý do:</span>
                                    <p className="font-medium bg-white p-2 rounded border">
                                        {formData.reason}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Error Display */}
                        {formError && (
                            <Alert color="failure">
                                {formError}
                            </Alert>
                        )}

                        {/* Warning */}
                        <Alert color="warning">
                            <div className="text-sm">
                                <p className="font-semibold mb-1">Lưu ý:</p>
                                <ul className="list-disc list-inside space-y-1 text-xs">
                                    <li>Yêu cầu OT cần manager phê duyệt trước checkout</li>
                                    <li>Nếu không có phê duyệt: giờ làm tính đến 17:30, OT = 0</li>
                                </ul>
                            </div>
                        </Alert>
                    </div>
                </Modal.Body>
                
                <Modal.Footer>
                    <Button 
                        onClick={handleConfirmOtRequest} 
                        disabled={submitting}
                        color="purple"
                    >
                        {submitting ? (
                            <>
                                <Spinner size="sm" className="mr-2" />
                                Đang gửi...
                            </>
                        ) : (
                            'Xác nhận gửi'
                        )}
                    </Button>
                    
                    <Button 
                        color="gray" 
                        onClick={() => setShowOtConfirmModal(false)}
                        disabled={submitting}
                    >
                        Hủy
                    </Button>
                </Modal.Footer>
            </Modal>
        </Card>
    );
}
