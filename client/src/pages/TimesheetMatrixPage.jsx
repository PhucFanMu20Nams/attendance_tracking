import { useState, useEffect, useCallback, useMemo } from 'react';
import { Table, Select, Spinner, Alert } from 'flowbite-react';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';

/**
 * TimesheetMatrixPage: Manager/Admin views team/company attendance matrix.
 *
 * Features:
 * - Matrix view: Rows (Employees) x Columns (Days of Month)
 * - Color-coded cells based on status (KEYS in RULES.md)
 * - Scope selector for Admin (Team vs Company)
 * - Month selector (Last 12 months)
 */
export default function TimesheetMatrixPage() {
    const { user } = useAuth();
    const isAdmin = user?.role === 'ADMIN';

    // Today in GMT+7 for month calculation
    const today = useMemo(() => new Date().toLocaleDateString('sv-SE', {
        timeZone: 'Asia/Ho_Chi_Minh'
    }), []);

    // Filter states
    const [selectedMonth, setSelectedMonth] = useState(today.slice(0, 7));
    const [scope, setScope] = useState('team'); // 'team' | 'company' (Admin only)

    // Force scope to 'team' if not admin (handle role change or reuse state)
    useEffect(() => {
        if (!isAdmin && scope === 'company') setScope('team');
    }, [isAdmin, scope]);

    // Data states
    const [data, setData] = useState({ days: [], rows: [] });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Generate last 12 months options (GMT+7)
    const monthOptions = useMemo(() => {
        const options = [];
        const [year, month] = today.split('-').map(Number);
        for (let i = 0; i < 12; i++) {
            const d = new Date(year, month - 1 - i, 1);
            const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            const label = d.toLocaleDateString('vi-VN', {
                year: 'numeric',
                month: 'long',
                timeZone: 'Asia/Ho_Chi_Minh',
            });
            options.push({ value, label });
        }
        return options;
    }, [today]);

    // Fetch matrix data
    const fetchMatrix = useCallback(async (signal, showLoading = true) => {
        if (showLoading) setLoading(true);
        if (showLoading) setError('');
        try {
            const config = signal ? { signal } : undefined;
            const endpoint = scope === 'company' && isAdmin
                ? `/timesheet/company?month=${selectedMonth}`
                : `/timesheet/team?month=${selectedMonth}`;

            const res = await client.get(endpoint, config);
            setData({
                days: Array.isArray(res.data?.days) ? res.data.days : [],
                rows: Array.isArray(res.data?.rows) ? res.data.rows : [],
            });
        } catch (err) {
            if (err.name === 'CanceledError' || err.name === 'AbortError' || err?.code === 'ERR_CANCELED') return;
            setError(err.response?.data?.message || 'Failed to load timesheet');
        } finally {
            if (signal?.aborted) return;
            if (showLoading) setLoading(false);
        }
    }, [selectedMonth, scope, isAdmin]);

    // Fetch on filters change
    useEffect(() => {
        const controller = new AbortController();
        fetchMatrix(controller.signal, true);
        return () => controller.abort();
    }, [fetchMatrix]);

    // Color mapping helper
    const getStatusColor = (status) => {
        const colorMap = {
            ON_TIME: 'bg-green-200 text-green-800',
            LATE: 'bg-red-200 text-red-800',
            EARLY_LEAVE: 'bg-yellow-200 text-yellow-800',
            MISSING_CHECKOUT: 'bg-yellow-200 text-yellow-800',
            ABSENT: 'bg-gray-100 text-gray-500',
            WEEKEND: 'bg-gray-300 text-gray-600',
            HOLIDAY: 'bg-purple-200 text-purple-800',
            WORKING: 'bg-blue-100 text-blue-800',
        };
        return colorMap[status] || 'bg-white text-gray-400';
    };

    // Status abbreviation helper
    const getStatusAbbr = (status) => {
        const abbrMap = {
            ON_TIME: '✓',
            LATE: 'M',      // Muộn
            EARLY_LEAVE: 'S', // Sớm
            MISSING_CHECKOUT: '?',
            ABSENT: 'V',    // Vắng
            WEEKEND: '-',
            HOLIDAY: 'L',   // Lễ
            WORKING: 'W',
        };
        return abbrMap[status] || '';
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <h1 className="text-2xl font-bold text-gray-800">Bảng chấm công</h1>

                <div className="flex flex-wrap gap-4 items-center">
                    {/* Scope Selector (Admin only) */}
                    {isAdmin && (
                        <Select
                            value={scope}
                            onChange={e => setScope(e.target.value)}
                            disabled={loading}
                        >
                            <option value="team">Team của tôi</option>
                            <option value="company">Toàn công ty</option>
                        </Select>
                    )}

                    {/* Month Selector */}
                    <Select
                        value={selectedMonth}
                        onChange={e => setSelectedMonth(e.target.value)}
                        disabled={loading}
                    >
                        {monthOptions.map(opt => (
                            <option key={opt.value} value={opt.value}>
                                {opt.label}
                            </option>
                        ))}
                    </Select>
                </div>
            </div>

            {error && (
                <Alert color="failure" onDismiss={() => setError('')}>
                    {error}
                </Alert>
            )}

            <div className="overflow-x-auto bg-white rounded-lg shadow">
                {loading ? (
                    <div className="flex justify-center py-12">
                        <Spinner size="lg" />
                    </div>
                ) : data.rows.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                        Không có dữ liệu chấm công cho tháng này
                    </div>
                ) : (
                    <Table hoverable>
                        <Table.Head>
                            <Table.HeadCell className="whitespace-nowrap min-w-[200px] sticky left-0 bg-gray-50 z-10">
                                Nhân viên
                            </Table.HeadCell>
                            {data.days.map(day => (
                                <Table.HeadCell key={day} className="text-center w-8 px-1">
                                    {day}
                                </Table.HeadCell>
                            ))}
                        </Table.Head>
                        <Table.Body className="divide-y">
                            {data.rows.map(row => (
                                <Table.Row key={row.user._id} className="bg-white">
                                    <Table.Cell className="whitespace-nowrap font-medium text-gray-900 sticky left-0 bg-white z-10 border-r">
                                        <div>{row.user.name}</div>
                                        <div className="text-xs text-gray-500">{row.user.employeeCode}</div>
                                    </Table.Cell>
                                    {row.cells.map((cell, idx) => (
                                        <Table.Cell
                                            key={cell.date || idx}
                                            className={`text-center text-xs p-1 h-10 w-8 border ${getStatusColor(cell.status)}`}
                                            title={`${cell.date}: ${cell.status || 'N/A'}`}
                                        >
                                            {getStatusAbbr(cell.status)}
                                        </Table.Cell>
                                    ))}
                                </Table.Row>
                            ))}
                        </Table.Body>
                    </Table>
                )}
            </div>

            {/* Legend */}
            {!loading && data.rows.length > 0 && (
                <div className="flex flex-wrap gap-4 text-xs text-gray-600 mt-4 p-4 bg-gray-50 rounded">
                    <div className="flex items-center gap-1"><span className="w-4 h-4 bg-green-200 border"></span> Đúng giờ (✓)</div>
                    <div className="flex items-center gap-1"><span className="w-4 h-4 bg-red-200 border"></span> Đi muộn (M)</div>
                    <div className="flex items-center gap-1"><span className="w-4 h-4 bg-yellow-200 border"></span> Về sớm/Thiếu checkout (S/?)</div>
                    <div className="flex items-center gap-1"><span className="w-4 h-4 bg-gray-100 border"></span> Vắng (V)</div>
                    <div className="flex items-center gap-1"><span className="w-4 h-4 bg-purple-200 border"></span> Lễ (L)</div>
                    <div className="flex items-center gap-1"><span className="w-4 h-4 bg-blue-100 border"></span> Đang làm (W)</div>
                </div>
            )}
        </div>
    );
}
