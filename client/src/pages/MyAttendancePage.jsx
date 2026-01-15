import { useState, useEffect, useMemo, useCallback } from 'react';
import { Table, Badge, Select, Spinner, Alert } from 'flowbite-react';
import client from '../api/client';

/**
 * MyAttendancePage: Monthly attendance history table with status badges.
 *
 * Features:
 * - Month selector (default: current month)
 * - Table with: date, check-in, check-out, status, late, work, OT
 * - Color-coded status badges
 */
export default function MyAttendancePage() {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Get current month in GMT+7
    const today = new Date().toLocaleDateString('sv-SE', {
        timeZone: 'Asia/Ho_Chi_Minh',
    });
    const [selectedMonth, setSelectedMonth] = useState(today.slice(0, 7));

    // Generate months for selector (last 12 months) based on GMT+7
    const monthOptions = useMemo(() => {
        const options = [];
        // Parse today GMT+7 as base
        const [year, month] = today.split('-').map(Number);
        for (let i = 0; i < 12; i++) {
            const d = new Date(year, month - 1 - i, 1);
            // Format YYYY-MM using local year/month (NOT toISOString which is UTC)
            const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            const label = d.toLocaleDateString('vi-VN', {
                year: 'numeric',
                month: 'long',
            });
            options.push({ value, label });
        }
        return options;
    }, [today]);

    // Fetch attendance data when month changes (with AbortController)
    const fetchAttendance = useCallback(async (signal) => {
        setLoading(true);
        setError('');
        try {
            const config = signal ? { signal } : undefined;
            const res = await client.get(`/attendance/me?month=${selectedMonth}`, config);
            // Defensive: ensure items is array
            setItems(Array.isArray(res.data?.items) ? res.data.items : []);
        } catch (err) {
            // Ignore abort errors
            if (err.name === 'CanceledError' || err.name === 'AbortError' || err?.code === 'ERR_CANCELED') return;
            setError(err.response?.data?.message || 'Failed to load attendance');
        } finally {
            // Guard: don't setState after abort/unmount
            if (signal?.aborted) return;
            setLoading(false);
        }
    }, [selectedMonth]);

    // Effect with cleanup
    useEffect(() => {
        const controller = new AbortController();
        fetchAttendance(controller.signal);
        return () => controller.abort();
    }, [fetchAttendance]);

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
        const date = new Date(dateStr + 'T00:00:00+07:00');
        return date.toLocaleDateString('vi-VN', {
            weekday: 'short',
            day: '2-digit',
            month: '2-digit',
        });
    };

    // Status badge color mapping
    // Per rule: When status === null, distinguish date > today (future) vs date === today (not checked in yet)
    const getStatusBadge = (status, itemDate) => {
        const statusConfig = {
            WORKING: { color: 'success', label: 'Đang làm' },
            ON_TIME: { color: 'success', label: 'Đúng giờ' },
            LATE: { color: 'warning', label: 'Đi muộn' },
            EARLY_LEAVE: { color: 'warning', label: 'Về sớm' },
            MISSING_CHECKOUT: { color: 'failure', label: 'Thiếu checkout' },
            ABSENT: { color: 'failure', label: 'Vắng mặt' },
            WEEKEND: { color: 'gray', label: 'Cuối tuần' },
            HOLIDAY: { color: 'purple', label: 'Nghỉ lễ' },
        };

        // Handle null/undefined status based on date
        if (!status) {
            if (itemDate > today) {
                return <Badge color="gray">Chưa tới</Badge>;
            } else if (itemDate === today) {
                return <Badge color="gray">Chưa check-in</Badge>;
            } else {
                // Past day with no status - likely absent or no record
                return <Badge color="failure">Vắng mặt</Badge>;
            }
        }

        const config = statusConfig[status] || { color: 'gray', label: status };
        return <Badge color={config.color}>{config.label}</Badge>;
    };

    return (
        <div>
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
                <h1 className="text-2xl font-bold text-gray-800">Lịch sử chấm công</h1>
                <Select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="w-full sm:w-48"
                >
                    {monthOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                            {opt.label}
                        </option>
                    ))}
                </Select>
            </div>

            {/* Error Alert */}
            {error && (
                <Alert color="failure" className="mb-4" onDismiss={() => setError('')}>
                    {error}
                </Alert>
            )}

            {/* Attendance Table */}
            <div className="overflow-x-auto">
                {loading ? (
                    <div className="flex justify-center py-12">
                        <Spinner size="lg" />
                    </div>
                ) : items.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                        Không có dữ liệu chấm công trong tháng này
                    </div>
                ) : (
                    <Table striped>
                        <Table.Head>
                            <Table.HeadCell>Ngày</Table.HeadCell>
                            <Table.HeadCell>Check-in</Table.HeadCell>
                            <Table.HeadCell>Check-out</Table.HeadCell>
                            <Table.HeadCell>Trạng thái</Table.HeadCell>
                            <Table.HeadCell>Đi muộn</Table.HeadCell>
                            <Table.HeadCell>Làm việc</Table.HeadCell>
                            <Table.HeadCell>OT</Table.HeadCell>
                        </Table.Head>
                        <Table.Body className="divide-y">
                            {items.map((item) => (
                                <Table.Row key={item.date} className="bg-white">
                                    <Table.Cell className="font-medium">
                                        {formatDate(item.date)}
                                    </Table.Cell>
                                    <Table.Cell>{formatTime(item.checkInAt)}</Table.Cell>
                                    <Table.Cell>{formatTime(item.checkOutAt)}</Table.Cell>
                                    <Table.Cell>{getStatusBadge(item.status, item.date)}</Table.Cell>
                                    <Table.Cell>
                                        {item.lateMinutes > 0 ? (
                                            <span className="text-yellow-600">
                                                {item.lateMinutes} phút
                                            </span>
                                        ) : (
                                            <span className="text-gray-400">-</span>
                                        )}
                                    </Table.Cell>
                                    <Table.Cell>
                                        {item.workMinutes > 0 ? (
                                            <span>{item.workMinutes} phút</span>
                                        ) : (
                                            <span className="text-gray-400">-</span>
                                        )}
                                    </Table.Cell>
                                    <Table.Cell>
                                        {item.otMinutes > 0 ? (
                                            <span className="text-green-600">
                                                {item.otMinutes} phút
                                            </span>
                                        ) : (
                                            <span className="text-gray-400">-</span>
                                        )}
                                    </Table.Cell>
                                </Table.Row>
                            ))}
                        </Table.Body>
                    </Table>
                )}
            </div>
        </div>
    );
}
