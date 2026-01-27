import { Table, Badge, Pagination } from 'flowbite-react';

/**
 * Table displaying user's requests with pagination.
 * Extracted from RequestsPage.jsx.
 * 
 * @param {Object} props
 * @param {Array} props.requests - List of request objects
 * @param {Object} props.pagination - { page, limit, total, totalPages }
 * @param {Function} props.onPageChange - (page: number) => void
 */
export default function MyRequestsTable({ requests, pagination, onPageChange }) {
    // Filter out invalid requests (defensive - backend always returns _id, but good practice)
    const safeRequests = (requests || []).filter(r => r?._id);
    const isEmpty = safeRequests.length === 0;
    const safePagination = pagination || { page: 1, totalPages: 0 };

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
        // P2: Guard against invalid dates (e.g., "2026-02-31")
        if (isNaN(date.getTime())) return 'N/A';
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

    const getStatusBadge = (status) => {
        const config = {
            PENDING: { color: 'warning', label: 'Chờ duyệt' },
            APPROVED: { color: 'success', label: 'Đã duyệt' },
            REJECTED: { color: 'failure', label: 'Từ chối' },
        };
        const { color, label } = config[status] || { color: 'gray', label: status || 'N/A' };
        return <Badge color={color}>{label}</Badge>;
    };

    const getLeaveTypeLabel = (type) => {
        const labels = {
            ANNUAL: 'Phép năm',
            SICK: 'Ốm đau',
            UNPAID: 'Không lương',
        };
        return labels[type] || 'Nghỉ phép';
    };

    const getTypeBadge = (type) => {
        if (type === 'LEAVE') {
            return <Badge color="cyan">Nghỉ phép</Badge>;
        }
        return <Badge color="purple">Điều chỉnh</Badge>;
    };

    return (
        <>
            <div className="overflow-x-auto">
                <Table striped>
                    <Table.Head>
                        <Table.HeadCell>Loại</Table.HeadCell>
                        <Table.HeadCell>Ngày / Khoảng</Table.HeadCell>
                        <Table.HeadCell>Chi tiết</Table.HeadCell>
                        <Table.HeadCell>Lý do</Table.HeadCell>
                        <Table.HeadCell>Trạng thái</Table.HeadCell>
                        <Table.HeadCell>Tạo lúc</Table.HeadCell>
                    </Table.Head>
                    <Table.Body className="divide-y">
                        {isEmpty ? (
                            <Table.Row>
                                <Table.Cell colSpan={6} className="text-center py-8 text-gray-500">
                                    Bạn chưa có yêu cầu nào
                                </Table.Cell>
                            </Table.Row>
                        ) : (
                            safeRequests.map((req) => (
                                <Table.Row key={req._id} className="bg-white">
                                    {/* Type Badge */}
                                    <Table.Cell>
                                        {getTypeBadge(req.type)}
                                    </Table.Cell>

                                    {/* Date / Range */}
                                    <Table.Cell className="font-medium whitespace-nowrap">
                                        {req.type === 'LEAVE' ? (
                                            <span>
                                                {formatDate(req.leaveStartDate)} → {formatDate(req.leaveEndDate)}
                                            </span>
                                        ) : (
                                            formatDate(req.date)
                                        )}
                                    </Table.Cell>

                                    {/* Details (Time or Leave Type + Days) */}
                                    <Table.Cell className="whitespace-nowrap">
                                        {req.type === 'LEAVE' ? (
                                            <div className="flex flex-col gap-1">
                                                <Badge color="blue" size="sm">
                                                    {getLeaveTypeLabel(req.leaveType)}
                                                </Badge>
                                                <span className="text-xs text-gray-600">
                                                    {req.leaveDaysCount ?? 0} ngày làm việc
                                                </span>
                                            </div>
                                        ) : (
                                            <div className="flex flex-col gap-1">
                                                <span className="text-sm">
                                                    Vào: {formatTime(req.requestedCheckInAt)}
                                                </span>
                                                <span className="text-sm">
                                                    Ra: {formatTime(req.requestedCheckOutAt)}
                                                </span>
                                            </div>
                                        )}
                                    </Table.Cell>

                                    {/* Reason */}
                                    <Table.Cell className="max-w-xs truncate" title={req.reason}>
                                        {req.reason || '—'}
                                    </Table.Cell>

                                    {/* Status */}
                                    <Table.Cell>
                                        {getStatusBadge(req.status)}
                                    </Table.Cell>

                                    {/* Created At */}
                                    <Table.Cell className="text-sm text-gray-500 whitespace-nowrap">
                                        {formatDateTime(req.createdAt)}
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
