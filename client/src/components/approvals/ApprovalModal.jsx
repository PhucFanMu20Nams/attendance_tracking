import { Modal, Button, Alert, Spinner } from 'flowbite-react';

/**
 * Confirmation modal for approve/reject actions.
 * Extracted from ApprovalsPage.jsx.
 * 
 * @param {Object} props
 * @param {boolean} props.show - Modal visibility
 * @param {Object} props.request - Selected request object
 * @param {string} props.action - 'approve' | 'reject'
 * @param {boolean} props.loading - During action
 * @param {string} props.error - Error message
 * @param {Function} props.onConfirm - () => void
 * @param {Function} props.onClose - () => void
 */
export default function ApprovalModal({
    show,
    request,
    action,
    loading,
    error,
    onConfirm,
    onClose
}) {
    // Format helpers
    const formatTime = (isoString) => {
        if (!isoString) return '--:--';
        return new Date(isoString).toLocaleTimeString('vi-VN', {
            timeZone: 'Asia/Ho_Chi_Minh',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return 'N/A';
        const date = new Date(dateStr + 'T00:00:00+07:00');
        return date.toLocaleDateString('vi-VN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
        });
    };

    const isApprove = action === 'approve';
    const actionLabel = isApprove ? 'duyệt' : 'từ chối';

    return (
        <Modal show={show} onClose={loading ? () => {} : onClose} size="md">
            <Modal.Header>
                Xác nhận {actionLabel}
            </Modal.Header>
            <Modal.Body>
                {error && (
                    <Alert color="failure" className="mb-4">
                        {error}
                    </Alert>
                )}

                <div className="space-y-3">
                    <p>
                        Bạn có chắc chắn muốn{' '}
                        <strong>{actionLabel}</strong>{' '}
                        yêu cầu của <strong>{request?.userId?.name}</strong>?
                    </p>

                    <div className="bg-gray-50 p-3 rounded text-sm space-y-1">
                        <p><span className="text-gray-500">Ngày:</span> {formatDate(request?.date)}</p>
                        <p><span className="text-gray-500">Check-in:</span> {formatTime(request?.requestedCheckInAt)}</p>
                        <p><span className="text-gray-500">Check-out:</span> {formatTime(request?.requestedCheckOutAt)}</p>
                        <p><span className="text-gray-500">Lý do:</span> {request?.reason}</p>
                    </div>
                </div>
            </Modal.Body>
            <Modal.Footer>
                <Button
                    color={isApprove ? 'success' : 'failure'}
                    onClick={onConfirm}
                    disabled={loading}
                >
                    {loading ? <Spinner size="sm" className="mr-2" /> : null}
                    Xác nhận
                </Button>
                <Button color="gray" onClick={onClose} disabled={loading}>
                    Hủy
                </Button>
            </Modal.Footer>
        </Modal>
    );
}
