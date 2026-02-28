import { useState } from 'react';
import { Table, Badge, Pagination, Button } from 'flowbite-react';
import { cancelOtRequest } from '../../api/requestApi';

/**
 * Table displaying user's requests with pagination.
 * Extracted from RequestsPage.jsx.
 * 
 * @param {Object} props
 * @param {Array} props.requests - List of request objects
 * @param {Object} props.pagination - { page, limit, total, totalPages }
 * @param {Function} props.onPageChange - (page: number) => void
 * @param {Function} props.onRefresh - Callback to refresh data after OT cancel
 */
export default function MyRequestsTable({ requests, pagination, onPageChange, onRefresh }) {
    // State for cancel loading
    const [cancelLoading, setCancelLoading] = useState(null);
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
        const date = new Date(isoString);
        if (isNaN(date.getTime())) return '--:--';
        return date.toLocaleTimeString('vi-VN', {
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
        const date = new Date(isoString);
        if (isNaN(date.getTime())) return 'N/A';
        return date.toLocaleString('vi-VN', {
            timeZone: 'Asia/Ho_Chi_Minh',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    /**
     * Extract date string (YYYY-MM-DD) in VN timezone (GMT+7)
     * Always parses input as Date object to handle UTC strings correctly
     * 
     * CRITICAL: Mongoose serializes Date fields to UTC ISO strings with Z suffix.
     * String slicing would give wrong date for VN times 00:00-06:59 (UTC -7 hours).
     * Example: "2026-02-09T18:00:00.000Z" is 01:00 VN on 2026-02-10, not 2026-02-09.
     * 
     * @param {string|Date} dateValue - ISO string or Date object
     * @returns {string|null} Date in YYYY-MM-DD format or null
     */
    const getVnDateString = (dateValue) => {
        if (!dateValue) return null;
        
        // Always parse as Date to handle all string formats (UTC Z, +07:00, no timezone)
        // en-CA locale gives YYYY-MM-DD format directly
        try {
            return new Date(dateValue).toLocaleDateString('en-CA', {
                timeZone: 'Asia/Ho_Chi_Minh'
            });
        } catch (err) {
            console.warn('Failed to format date in VN timezone:', dateValue, err);
            return null;
        }
    };

    /**
     * Detect if request has cross-midnight checkout
     * 
     * Priority hierarchy:
     * 1. Use checkInDate/checkOutDate (backend-computed, most reliable)
     * 2. Compare timestamps in VN timezone (handles Date objects safely)
     * 3. Compare checkout with request.date
     * 
     * Uses getVnDateString to avoid toISOString() UTC conversion bug
     */
    const isCrossMidnight = (req) => {
        if (req.type !== 'ADJUST_TIME') return false;
        if (!req.requestedCheckOutAt) return false;
        
        // P1: Prefer model fields (checkInDate, checkOutDate) - most reliable
        if (req.checkInDate && req.checkOutDate) {
            return req.checkOutDate > req.checkInDate;
        }
        
        // P2: Fallback to timestamp comparison (for legacy data)
        if (req.requestedCheckInAt && req.requestedCheckOutAt) {
            const checkInDay = getVnDateString(req.requestedCheckInAt);
            const checkOutDay = getVnDateString(req.requestedCheckOutAt);
            
            // Guard: if conversion failed, can't determine
            if (!checkInDay || !checkOutDay) return false;
            
            return checkOutDay > checkInDay;
        }
        
        // P3: Checkout-only case
        if (req.date && req.requestedCheckOutAt) {
            const checkOutDay = getVnDateString(req.requestedCheckOutAt);
            
            if (!checkOutDay) return false;
            
            return checkOutDay > req.date;
        }
        
        return false;
    };

    /**
     * Add days to a date string (timezone-safe, pure string manipulation)
     * Handles month/year boundaries correctly
     * Returns null if input is invalid
     */
    const addDaysToDate = (dateStr, days) => {
        if (!dateStr || typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
            return null;
        }
        
        const [year, month, day] = dateStr.split('-').map(Number);
        
        if (isNaN(year) || isNaN(month) || isNaN(day)) {
            return null;
        }
        
        if (month < 1 || month > 12 || day < 1 || day > 31) {
            return null;
        }
        
        const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        
        const isLeapYear = (y) => (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0);
        if (isLeapYear(year)) {
            daysInMonth[1] = 29;
        }
        
        let newDay = day + days;
        let newMonth = month;
        let newYear = year;
        
        while (newDay > daysInMonth[newMonth - 1]) {
            newDay -= daysInMonth[newMonth - 1];
            newMonth++;
            
            if (newMonth > 12) {
                newMonth = 1;
                newYear++;
                daysInMonth[1] = isLeapYear(newYear) ? 29 : 28;
            }
        }
        
        return `${newYear}-${String(newMonth).padStart(2, '0')}-${String(newDay).padStart(2, '0')}`;
    };

    /**
     * Format time with date information for cross-midnight sessions
     * Shows clear date instead of confusing +1 badge
     * 
     * @param {string} isoString - ISO timestamp to format
     * @param {boolean} isCrossMidnightFlag - Whether session crosses midnight
     * @param {string} baseDate - Primary date (req.date)
     * @param {string} fallbackDate - Fallback date (req.checkInDate) when baseDate is null
     */
    const formatTimeWithDate = (isoString, isCrossMidnightFlag, baseDate, fallbackDate) => {
        if (!isoString) return '--:--';
        
        const time = formatTime(isoString);
        if (!isCrossMidnightFlag) return time;
        
        // Use baseDate or fallback to checkInDate (handles edge case of missing req.date)
        const effectiveBase = baseDate || fallbackDate;
        if (!effectiveBase) return time;
        
        const nextDay = addDaysToDate(effectiveBase, 1);
        if (nextDay) {
            const [, month, day] = nextDay.split('-');
            return `${time} (${day}/${month})`;
        }
        
        return `${time} (+1)`;
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
        if (type === 'OT_REQUEST') {
            return <Badge color="purple">Đăng ký OT</Badge>;
        }
        return <Badge color="indigo">Điều chỉnh</Badge>;
    };

    /**
     * Handle OT cancellation
     */
    const handleCancelOt = async (requestId, date) => {
        const confirmMsg = `Bạn có chắc muốn hủy yêu cầu OT ngày ${formatDate(date)}?`;
        
        if (!window.confirm(confirmMsg)) return;
        
        setCancelLoading(requestId);
        
        try {
            await cancelOtRequest(requestId);
            alert('✅ Đã hủy yêu cầu OT');
            
            // Trigger refetch
            if (onRefresh) {
                onRefresh();
            }
        } catch (err) {
            const errorMsg = err.response?.data?.message || 'Không thể hủy yêu cầu OT';
            alert(`❌ ${errorMsg}`);
        } finally {
            setCancelLoading(null);
        }
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
                        <Table.HeadCell>Thao tác</Table.HeadCell>
                    </Table.Head>
                    <Table.Body className="divide-y">
                        {isEmpty ? (
                            <Table.Row>
                                <Table.Cell colSpan={7} className="text-center py-8 text-gray-500">
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

                                    {/* Details (Time or Leave Type + Days or OT Info) */}
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
                                        ) : req.type === 'OT_REQUEST' ? (
                                            <div className="text-sm space-y-1">
                                                <div>
                                                    <span className="text-gray-600">⏰ Dự kiến về:</span>
                                                    <span className="ml-2 font-medium">{formatTime(req.estimatedEndTime)}</span>
                                                </div>
                                                {req.actualOtMinutes != null && (
                                                    <div>
                                                        <span className="text-gray-600">✅ OT thực tế:</span>
                                                        <span className="ml-2 font-bold text-green-600">
                                                            {Math.floor(req.actualOtMinutes / 60)}h {req.actualOtMinutes % 60}m
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="flex flex-col gap-1">
                                                <span className="text-sm">
                                                    Vào: {formatTime(req.requestedCheckInAt)}
                                                </span>
                                                <span className="text-sm">
                                                    Ra: {formatTimeWithDate(req.requestedCheckOutAt, isCrossMidnight(req), req.date, req.checkInDate)}
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

                                    {/* Actions */}
                                    <Table.Cell>
                                        {req.status === 'PENDING' && req.type === 'OT_REQUEST' ? (
                                            <Button
                                                size="xs"
                                                color="failure"
                                                onClick={() => handleCancelOt(req._id, req.date)}
                                                disabled={cancelLoading === req._id}
                                            >
                                                {cancelLoading === req._id ? '...' : '🗑️ Hủy'}
                                            </Button>
                                        ) : (
                                            <span className="text-gray-400 text-xs">—</span>
                                        )}
                                    </Table.Cell>
                                </Table.Row>
                            ))
                        )}
                    </Table.Body>
                </Table>
            </div>

            {/* Pagination - at bottom */}
            {safePagination.totalPages > 1 && (
                <div className="mt-4 flex flex-col items-center gap-2">
                    {/* Page indicator text */}
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                        Trang {currentPage} / {safePagination.totalPages}
                    </div>
                    
                    {/* Pagination buttons */}
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
