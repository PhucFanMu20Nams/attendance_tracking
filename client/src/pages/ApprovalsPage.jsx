import { useState, useEffect, useCallback } from 'react';
import { Table, Button, Modal, Spinner, Alert } from 'flowbite-react';
import { HiCheck, HiX } from 'react-icons/hi';
import client from '../api/client';

/**
 * ApprovalsPage: Manager/Admin views pending requests + approve/reject.
 *
 * Features:
 * - Pending requests table with employee info
 * - Approve/Reject buttons with confirm modal
 * - Silent refetch after action (no spinner jump)
 * - RBAC: Manager sees team only, Admin sees all (handled by backend)
 */
export default function ApprovalsPage() {
    // Data states
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Modal states
    const [modalOpen, setModalOpen] = useState(false);
    const [modalAction, setModalAction] = useState(null); // 'approve' | 'reject'
    const [selectedRequest, setSelectedRequest] = useState(null);
    const [actionLoading, setActionLoading] = useState(false);
    const [actionError, setActionError] = useState('');

    // Fetch pending requests with AbortController + showLoading pattern
    const fetchRequests = useCallback(async (signal, showLoading = true) => {
        if (showLoading) setLoading(true);
        if (showLoading) setError('');
        try {
            const config = signal ? { signal } : undefined;
            const res = await client.get('/requests/pending', config);
            // Clone array before sort, defensive fallback
            const items = Array.isArray(res.data?.items) ? [...res.data.items] : [];
            // Sort by createdAt desc (newest first)
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

    // Format date (YYYY-MM-DD → dd/mm/yyyy GMT+7)
    const formatDate = (dateStr) => {
        if (!dateStr) return 'N/A';
        const date = new Date(dateStr + 'T00:00:00+07:00');
        return date.toLocaleDateString('vi-VN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
        });
    };

    // Format time (ISO → HH:mm GMT+7)
    const formatTime = (isoString) => {
        if (!isoString) return '--:--';
        return new Date(isoString).toLocaleTimeString('vi-VN', {
            timeZone: 'Asia/Ho_Chi_Minh',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    // Format datetime
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

    // Modal handlers
    const handleOpenModal = (request, action) => {
        setSelectedRequest(request);
        setModalAction(action);
        setActionError('');
        setModalOpen(true);
    };

    const handleCloseModal = () => {
        if (actionLoading) return; // Prevent close during action
        setModalOpen(false);
        setSelectedRequest(null);
        setModalAction(null);
        setActionError('');
    };

    const handleConfirm = async () => {
        if (!selectedRequest || !modalAction) return;

        setActionLoading(true);
        setActionError('');
        try {
            const endpoint = `/requests/${selectedRequest._id}/${modalAction}`;
            await client.post(endpoint);
            setModalOpen(false);
            setSelectedRequest(null);
            setModalAction(null);
            // Silent refetch to update list
            await fetchRequests(undefined, false);
        } catch (err) {
            setActionError(err.response?.data?.message || `${modalAction === 'approve' ? 'Duyệt' : 'Từ chối'} thất bại`);
        } finally {
            setActionLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Page Title */}
            <h1 className="text-2xl font-bold text-gray-800">Duyệt yêu cầu</h1>

            {/* Error Alert */}
            {error && (
                <Alert color="failure" onDismiss={() => setError('')}>
                    {error}
                </Alert>
            )}

            {/* Pending Requests Table */}
            <div className="overflow-x-auto">
                {loading ? (
                    <div className="flex justify-center py-12">
                        <Spinner size="lg" />
                    </div>
                ) : requests.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                        Không có yêu cầu nào đang chờ duyệt
                    </div>
                ) : (
                    <Table striped>
                        <Table.Head>
                            <Table.HeadCell>Nhân viên</Table.HeadCell>
                            <Table.HeadCell>Ngày</Table.HeadCell>
                            <Table.HeadCell>Check-in</Table.HeadCell>
                            <Table.HeadCell>Check-out</Table.HeadCell>
                            <Table.HeadCell>Lý do</Table.HeadCell>
                            <Table.HeadCell>Tạo lúc</Table.HeadCell>
                            <Table.HeadCell>Thao tác</Table.HeadCell>
                        </Table.Head>
                        <Table.Body className="divide-y">
                            {requests.map((req) => (
                                <Table.Row key={req._id} className="bg-white">
                                    <Table.Cell className="font-medium">
                                        <div>{req.userId?.name || 'N/A'}</div>
                                        <div className="text-xs text-gray-500">
                                            {req.userId?.employeeCode || ''}
                                        </div>
                                    </Table.Cell>
                                    <Table.Cell>{formatDate(req.date)}</Table.Cell>
                                    <Table.Cell>{formatTime(req.requestedCheckInAt)}</Table.Cell>
                                    <Table.Cell>{formatTime(req.requestedCheckOutAt)}</Table.Cell>
                                    <Table.Cell className="max-w-xs truncate" title={req.reason}>
                                        {req.reason}
                                    </Table.Cell>
                                    <Table.Cell className="text-sm text-gray-500">
                                        {formatDateTime(req.createdAt)}
                                    </Table.Cell>
                                    <Table.Cell>
                                        <div className="flex gap-2">
                                            <Button
                                                size="xs"
                                                color="success"
                                                onClick={() => handleOpenModal(req, 'approve')}
                                                disabled={actionLoading}
                                            >
                                                <HiCheck className="mr-1" />
                                                Duyệt
                                            </Button>
                                            <Button
                                                size="xs"
                                                color="failure"
                                                onClick={() => handleOpenModal(req, 'reject')}
                                                disabled={actionLoading}
                                            >
                                                <HiX className="mr-1" />
                                                Từ chối
                                            </Button>
                                        </div>
                                    </Table.Cell>
                                </Table.Row>
                            ))}
                        </Table.Body>
                    </Table>
                )}
            </div>

            {/* Confirm Modal */}
            <Modal show={modalOpen} onClose={handleCloseModal} size="md">
                <Modal.Header>
                    {modalAction === 'approve' ? 'Xác nhận duyệt' : 'Xác nhận từ chối'}
                </Modal.Header>
                <Modal.Body>
                    {actionError && (
                        <Alert color="failure" className="mb-4">
                            {actionError}
                        </Alert>
                    )}
                    <div className="space-y-3">
                        <p>
                            Bạn có chắc chắn muốn{' '}
                            <strong>{modalAction === 'approve' ? 'duyệt' : 'từ chối'}</strong>{' '}
                            yêu cầu của <strong>{selectedRequest?.userId?.name}</strong>?
                        </p>
                        <div className="bg-gray-50 p-3 rounded text-sm space-y-1">
                            <p><span className="text-gray-500">Ngày:</span> {formatDate(selectedRequest?.date)}</p>
                            <p><span className="text-gray-500">Check-in:</span> {formatTime(selectedRequest?.requestedCheckInAt)}</p>
                            <p><span className="text-gray-500">Check-out:</span> {formatTime(selectedRequest?.requestedCheckOutAt)}</p>
                            <p><span className="text-gray-500">Lý do:</span> {selectedRequest?.reason}</p>
                        </div>
                    </div>
                </Modal.Body>
                <Modal.Footer>
                    <Button
                        color={modalAction === 'approve' ? 'success' : 'failure'}
                        onClick={handleConfirm}
                        disabled={actionLoading}
                    >
                        {actionLoading ? <Spinner size="sm" className="mr-2" /> : null}
                        Xác nhận
                    </Button>
                    <Button color="gray" onClick={handleCloseModal} disabled={actionLoading}>
                        Hủy
                    </Button>
                </Modal.Footer>
            </Modal>
        </div>
    );
}
