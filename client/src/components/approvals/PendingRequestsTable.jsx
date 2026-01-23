import { Table, Button, Pagination } from 'flowbite-react';
import { HiCheck, HiX } from 'react-icons/hi';

/**
 * Table displaying pending requests for approval.
 * Extracted from ApprovalsPage.jsx.
 * 
 * @param {Object} props
 * @param {Array} props.requests - List of pending request objects
 * @param {Object} props.pagination - { page, limit, total, totalPages }
 * @param {Function} props.onPageChange - (page: number) => void
 * @param {Function} props.onApprove - (request: Object) => void
 * @param {Function} props.onReject - (request: Object) => void
 * @param {boolean} props.actionLoading - Disable buttons during action
 */
export default function PendingRequestsTable({
    requests,
    pagination,
    onPageChange,
    onApprove,
    onReject,
    actionLoading = false
}) {
    // Filter out invalid requests (defensive - backend always returns _id, but good practice)
    const safeRequests = (requests || []).filter(r => r?._id);
    const isEmpty = safeRequests.length === 0;
    
    // Normalize pagination fields to prevent undefined access
    const safePagination = {
        page: pagination?.page ?? 1,
        totalPages: pagination?.totalPages ?? 0,
    };

    // Clamp currentPage to valid range (prevent out-of-bounds from partial API response)
    const currentPage = Math.min(
        Math.max(1, safePagination.page || 1),
        safePagination.totalPages || 1
    );

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

    return (
        <>
            <div className="overflow-x-auto">
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
                        {isEmpty ? (
                            <Table.Row>
                                <Table.Cell colSpan={7} className="text-center py-8 text-gray-500">
                                    Không có yêu cầu nào đang chờ duyệt
                                </Table.Cell>
                            </Table.Row>
                        ) : (
                            safeRequests.map((req) => (
                                <Table.Row key={req._id} className="bg-white">
                                    <Table.Cell className="font-medium">
                                        <div>{req.userId?.name || 'N/A'}</div>
                                        <div className="text-xs text-gray-500">
                                            {req.userId?.employeeCode || '—'}
                                        </div>
                                    </Table.Cell>
                                    <Table.Cell className="whitespace-nowrap">
                                        {formatDate(req.date)}
                                    </Table.Cell>
                                    <Table.Cell className="whitespace-nowrap">
                                        {formatTime(req.requestedCheckInAt)}
                                    </Table.Cell>
                                    <Table.Cell className="whitespace-nowrap">
                                        {formatTime(req.requestedCheckOutAt)}
                                    </Table.Cell>
                                    <Table.Cell className="max-w-xs truncate" title={req.reason}>
                                        {req.reason || '—'}
                                    </Table.Cell>
                                    <Table.Cell className="text-sm text-gray-500 whitespace-nowrap">
                                        {formatDateTime(req.createdAt)}
                                    </Table.Cell>
                                    <Table.Cell>
                                        <div className="flex gap-2">
                                            <Button
                                                size="xs"
                                                color="success"
                                                onClick={() => onApprove?.(req)}
                                                disabled={actionLoading}
                                                aria-label="Approve request"
                                            >
                                                <HiCheck className="mr-1" />
                                                Duyệt
                                            </Button>
                                            <Button
                                                size="xs"
                                                color="failure"
                                                onClick={() => onReject?.(req)}
                                                disabled={actionLoading}
                                                aria-label="Reject request"
                                            >
                                                <HiX className="mr-1" />
                                                Từ chối
                                            </Button>
                                        </div>
                                    </Table.Cell>
                                </Table.Row>
                            ))
                        )}
                    </Table.Body>
                </Table>
            </div>

            {/* Pagination - at bottom */}
            {safePagination.totalPages > 1 && (
                <div className="mt-4 flex justify-center">
                    <Pagination
                        currentPage={currentPage}
                        totalPages={safePagination.totalPages}
                        onPageChange={(p) => onPageChange?.(p)}
                        showIcons
                    />
                </div>
            )}
        </>
    );
}
