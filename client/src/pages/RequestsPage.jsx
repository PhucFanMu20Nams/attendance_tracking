import { useState, useEffect, useMemo, useCallback } from 'react';
import {
    Card,
    Label,
    TextInput,
    Textarea,
    Button,
    Table,
    Badge,
    Alert,
    Spinner,
} from 'flowbite-react';
import { HiPlus } from 'react-icons/hi';
import client from '../api/client';

/**
 * RequestsPage: Employee creates requests + views their own requests.
 *
 * Features:
 * - Create request form (date, check-in time, check-out time, reason)
 * - My requests table with status badges
 * - All dates/times in GMT+7
 */
export default function RequestsPage() {
    // Get today in GMT+7 for default date (computed first for initial state)
    const today = useMemo(() => {
        return new Date().toLocaleDateString('sv-SE', {
            timeZone: 'Asia/Ho_Chi_Minh',
        });
    }, []);

    // Requests list state
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Form state - default date to today for better UX
    const [formData, setFormData] = useState(() => ({
        date: today,
        checkInTime: '',
        checkOutTime: '',
        reason: '',
    }));
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState('');
    const [formSuccess, setFormSuccess] = useState('');
    // showLoading: true for initial load, false for refetch after action (no spinner)
    const fetchRequests = useCallback(async (signal, showLoading = true) => {
        if (showLoading) setLoading(true);
        if (showLoading) setError('');
        try {
            const config = signal ? { signal } : undefined;
            const res = await client.get('/requests/me', config);
            // Clone array to avoid mutating response, defensive fallback
            const items = Array.isArray(res.data?.items) ? [...res.data.items] : [];
            // Sort by createdAt desc (newest first), fallback for null createdAt
            items.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
            setRequests(items);
        } catch (err) {
            if (err.name === 'CanceledError' || err.name === 'AbortError' || err?.code === 'ERR_CANCELED') return;
            setError(err.response?.data?.message || 'Failed to load requests');
        } finally {
            if (signal?.aborted) return;
            if (showLoading) setLoading(false);
        }
    }, []);

    // Fetch on mount with cleanup
    useEffect(() => {
        const controller = new AbortController();
        fetchRequests(controller.signal, true);
        return () => controller.abort();
    }, [fetchRequests]);

    // Handle form input changes
    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    // Build ISO timestamp from date + time (GMT+7)
    const buildIsoTimestamp = (dateStr, timeStr) => {
        if (!dateStr || !timeStr) return null;
        // Ensure HH:mm format (some browsers return HH:mm:ss)
        const hhmm = timeStr.slice(0, 5);
        return `${dateStr}T${hhmm}:00+07:00`;
    };

    // Handle form submit
    const handleSubmit = async (e) => {
        e.preventDefault();
        setFormError('');
        setFormSuccess('');

        // Validate required fields
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
        if (formData.reason.trim().length > 500) {
            setFormError('Lý do không được quá 500 ký tự');
            return;
        }
        // Validate checkOut must be after checkIn
        if (formData.checkInTime && formData.checkOutTime && formData.checkOutTime <= formData.checkInTime) {
            setFormError('Giờ check-out phải sau giờ check-in');
            return;
        }

        setSubmitting(true);
        try {
            const payload = {
                date: formData.date,
                reason: formData.reason.trim(),
            };

            // Add timestamps if provided
            if (formData.checkInTime) {
                payload.requestedCheckInAt = buildIsoTimestamp(formData.date, formData.checkInTime);
            }
            if (formData.checkOutTime) {
                payload.requestedCheckOutAt = buildIsoTimestamp(formData.date, formData.checkOutTime);
            }

            await client.post('/requests', payload);
            setFormSuccess('Đã tạo yêu cầu thành công!');
            // Reset form with today as default date for quick multi-create
            setFormData({
                date: today,
                checkInTime: '',
                checkOutTime: '',
                reason: '',
            });
            // Refetch requests without spinner (smooth UX)
            await fetchRequests(undefined, false);
        } catch (err) {
            setFormError(err.response?.data?.message || 'Tạo yêu cầu thất bại');
        } finally {
            setSubmitting(false);
        }
    };

    // Format time for display (GMT+7)
    const formatTime = (isoString) => {
        if (!isoString) return '--:--';
        return new Date(isoString).toLocaleTimeString('vi-VN', {
            timeZone: 'Asia/Ho_Chi_Minh',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    // Format date for display
    const formatDate = (dateStr) => {
        if (!dateStr) return 'N/A';
        const date = new Date(dateStr + 'T00:00:00+07:00');
        return date.toLocaleDateString('vi-VN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
        });
    };

    // Format datetime for createdAt
    const formatDateTime = (isoString) => {
        if (!isoString) return 'N/A';
        return new Date(isoString).toLocaleString('vi-VN', {
            timeZone: 'Asia/Ho_Chi_Minh',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    // Status badge
    const getStatusBadge = (status) => {
        const config = {
            PENDING: { color: 'warning', label: 'Chờ duyệt' },
            APPROVED: { color: 'success', label: 'Đã duyệt' },
            REJECTED: { color: 'failure', label: 'Từ chối' },
        };
        const { color, label } = config[status] || { color: 'gray', label: status || 'N/A' };
        return <Badge color={color}>{label}</Badge>;
    };

    return (
        <div className="space-y-6">
            {/* Page Title */}
            <h1 className="text-2xl font-bold text-gray-800">Yêu cầu điều chỉnh</h1>

            {/* Create Request Form */}
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
                            maxLength={500}
                            required
                        />
                        <p className="text-xs text-gray-500 mt-1">
                            {formData.reason.length}/500 ký tự
                        </p>
                    </div>

                    {/* Submit */}
                    <Button type="submit" disabled={submitting || loading} color="cyan">
                        {submitting ? <Spinner size="sm" className="mr-2" /> : <HiPlus className="mr-2" />}
                        Tạo yêu cầu
                    </Button>
                </form>
            </Card>

            {/* Error Alert */}
            {error && (
                <Alert color="failure" onDismiss={() => setError('')}>
                    {error}
                </Alert>
            )}

            {/* Requests Table */}
            <Card>
                <h2 className="text-lg font-semibold text-gray-700 mb-4">Danh sách yêu cầu của tôi</h2>

                <div className="overflow-x-auto">
                    {loading ? (
                        <div className="flex justify-center py-12">
                            <Spinner size="lg" />
                        </div>
                    ) : requests.length === 0 ? (
                        <div className="text-center py-12 text-gray-500">
                            Bạn chưa có yêu cầu nào
                        </div>
                    ) : (
                        <Table striped>
                            <Table.Head>
                                <Table.HeadCell>Ngày</Table.HeadCell>
                                <Table.HeadCell>Check-in</Table.HeadCell>
                                <Table.HeadCell>Check-out</Table.HeadCell>
                                <Table.HeadCell>Lý do</Table.HeadCell>
                                <Table.HeadCell>Trạng thái</Table.HeadCell>
                                <Table.HeadCell>Tạo lúc</Table.HeadCell>
                            </Table.Head>
                            <Table.Body className="divide-y">
                                {requests.map((req) => (
                                    <Table.Row key={req._id} className="bg-white">
                                        <Table.Cell className="font-medium">
                                            {formatDate(req.date)}
                                        </Table.Cell>
                                        <Table.Cell>
                                            {formatTime(req.requestedCheckInAt)}
                                        </Table.Cell>
                                        <Table.Cell>
                                            {formatTime(req.requestedCheckOutAt)}
                                        </Table.Cell>
                                        <Table.Cell className="max-w-xs truncate" title={req.reason}>
                                            {req.reason}
                                        </Table.Cell>
                                        <Table.Cell>
                                            {getStatusBadge(req.status)}
                                        </Table.Cell>
                                        <Table.Cell className="text-sm text-gray-500">
                                            {formatDateTime(req.createdAt)}
                                        </Table.Cell>
                                    </Table.Row>
                                ))}
                            </Table.Body>
                        </Table>
                    )}
                </div>
            </Card>
        </div>
    );
}
