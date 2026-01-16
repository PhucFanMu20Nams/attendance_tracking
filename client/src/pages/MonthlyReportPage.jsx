import { useState, useEffect, useCallback, useMemo } from 'react';
import { Table, Select, Button, Spinner, Alert } from 'flowbite-react';
import { HiDownload } from 'react-icons/hi';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import { downloadBlob } from '../utils/downloadBlob';

/**
 * MonthlyReportPage: Manager/Admin views monthly summary + exports Excel.
 *
 * Features:
 * - Summary table: Employee stats (work hours, late days, OT)
 * - Scope selector for Admin (Team vs Company)
 * - Month selector (Last 12 months)
 * - Excel export via new tab download
 */
export default function MonthlyReportPage() {
    const { user } = useAuth();
    const isAdmin = user?.role === 'ADMIN';

    // Today in GMT+7 for month calculation
    const today = useMemo(() => new Date().toLocaleDateString('sv-SE', {
        timeZone: 'Asia/Ho_Chi_Minh'
    }), []);

    // Filter states
    const [selectedMonth, setSelectedMonth] = useState(today.slice(0, 7));
    // Default: Admin sees company, Manager sees team (avoids 400 when Admin has no teamId)
    const [scope, setScope] = useState(isAdmin ? 'company' : 'team');

    // Data states
    const [summary, setSummary] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [exporting, setExporting] = useState(false); // Export loading state

    // Derived scope: non-admin always uses 'team' (prevents race condition on role change)
    const effectiveScope = isAdmin ? scope : 'team';

    // Defense-in-depth: ensure Admin uses 'company' if isAdmin changes after mount
    useEffect(() => {
        if (isAdmin && scope === 'team') setScope('company');
    }, [isAdmin, scope]);

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

    // Fetch report data
    const fetchReport = useCallback(async (signal, showLoading = true) => {
        if (showLoading) setLoading(true);
        if (showLoading) setError('');
        try {
            const config = signal ? { signal } : undefined;
            const endpoint = `/reports/monthly?month=${selectedMonth}&scope=${effectiveScope}`;
            const res = await client.get(endpoint, config);
            setSummary(Array.isArray(res.data?.summary) ? res.data.summary : []);
        } catch (err) {
            if (err.name === 'CanceledError' || err.name === 'AbortError' || err?.code === 'ERR_CANCELED') return;
            setError(err.response?.data?.message || 'Failed to load report');
        } finally {
            // Guard setState - don't update if aborted (component may be unmounted)
            if (!signal?.aborted && showLoading) {
                setLoading(false);
            }
        }
    }, [selectedMonth, effectiveScope]);

    // Fetch on filters change
    useEffect(() => {
        const controller = new AbortController();
        fetchReport(controller.signal, true);
        return () => controller.abort();
    }, [fetchReport]);

    // Handle Excel export (secure Blob download - OWASP A09 compliant)
    const handleExport = async () => {
        setExporting(true);
        setError('');
        try {
            const response = await client.get(
                `/reports/monthly/export?month=${selectedMonth}&scope=${effectiveScope}`,
                { responseType: 'blob' }
            );

            // Get filename from Content-Disposition header if available
            const contentDisposition = response.headers['content-disposition'];
            let filename = `report-${selectedMonth}-${effectiveScope}.xlsx`;
            if (contentDisposition) {
                const match = contentDisposition.match(/filename[^;=\n]*=(['"]?)([^'"\n]*?)\1(?:;|$)/);
                if (match && match[2]) {
                    filename = match[2];
                }
            }

            downloadBlob(response.data, filename);
        } catch (err) {
            // Handle blob error response (parse JSON message from blob)
            let errorMessage = 'Xuất báo cáo thất bại';
            if (err.response?.status === 401) {
                errorMessage = 'Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.';
            } else if (err.response?.data instanceof Blob) {
                try {
                    const text = await err.response.data.text();
                    const json = JSON.parse(text);
                    errorMessage = json.message || errorMessage;
                } catch { /* ignore parse error */ }
            } else {
                errorMessage = err.response?.data?.message || errorMessage;
            }
            setError(errorMessage);
        } finally {
            setExporting(false);
        }
    };

    // Format minutes to hours (e.g., 480 → "8.0h")
    const formatHours = (minutes) => {
        if (!minutes || minutes <= 0) return '0h';
        return `${(minutes / 60).toFixed(1)}h`;
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <h1 className="text-2xl font-bold text-gray-800">Báo cáo tháng</h1>

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

                    {/* Export Button */}
                    <Button
                        color="success"
                        onClick={handleExport}
                        disabled={loading || exporting || summary.length === 0}
                    >
                        {exporting ? (
                            <>
                                <Spinner size="sm" className="mr-2" />
                                Đang tải...
                            </>
                        ) : (
                            <>
                                <HiDownload className="mr-2 h-5 w-5" />
                                Xuất Excel
                            </>
                        )}
                    </Button>
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
                ) : summary.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                        Không có dữ liệu báo cáo cho tháng này
                    </div>
                ) : (
                    <Table striped>
                        <Table.Head>
                            <Table.HeadCell>Mã NV</Table.HeadCell>
                            <Table.HeadCell>Họ tên</Table.HeadCell>
                            <Table.HeadCell className="text-right">Tổng giờ làm</Table.HeadCell>
                            <Table.HeadCell className="text-right">Số ngày đi muộn</Table.HeadCell>
                            <Table.HeadCell className="text-right">Tổng OT</Table.HeadCell>
                        </Table.Head>
                        <Table.Body className="divide-y">
                            {summary.map(row => (
                                <Table.Row key={row.user._id} className="bg-white">
                                    <Table.Cell className="font-medium text-gray-900">
                                        {row.user.employeeCode || 'N/A'}
                                    </Table.Cell>
                                    <Table.Cell>
                                        {row.user.name || 'N/A'}
                                    </Table.Cell>
                                    <Table.Cell className="text-right">
                                        {formatHours(row.totalWorkMinutes)}
                                    </Table.Cell>
                                    <Table.Cell className="text-right">
                                        <span className={row.totalLateCount > 0 ? 'text-red-600 font-medium' : ''}>
                                            {row.totalLateCount || 0}
                                        </span>
                                    </Table.Cell>
                                    <Table.Cell className="text-right">
                                        <span className={row.totalOtMinutes > 0 ? 'text-blue-600 font-medium' : ''}>
                                            {formatHours(row.totalOtMinutes)}
                                        </span>
                                    </Table.Cell>
                                </Table.Row>
                            ))}
                        </Table.Body>
                    </Table>
                )}
            </div>

            {/* Summary footer */}
            {!loading && summary.length > 0 && (
                <div className="text-sm text-gray-500">
                    Tổng: {summary.length} nhân viên
                </div>
            )}
        </div>
    );
}
