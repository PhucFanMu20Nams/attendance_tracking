import { useState, useEffect, useCallback } from 'react';
import { Card, Button, Badge, Spinner, Alert } from 'flowbite-react';
import { HiClock, HiCheckCircle, HiXCircle } from 'react-icons/hi';
import client from '../api/client';

/**
 * DashboardPage: Main page showing today's attendance status + check-in/out buttons.
 *
 * Features:
 * - Display today's date (GMT+7)
 * - Show status: NOT_CHECKED_IN / WORKING / DONE
 * - Check-in button (enabled when not checked in)
 * - Check-out button (enabled when working)
 * - Display check-in/out times when available
 */
export default function DashboardPage() {
    const [todayAttendance, setTodayAttendance] = useState(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [error, setError] = useState('');

    // Get today in GMT+7 format "YYYY-MM-DD"
    const today = new Date().toLocaleDateString('sv-SE', {
        timeZone: 'Asia/Ho_Chi_Minh',
    });

    const currentMonth = today.slice(0, 7); // "YYYY-MM"

    // Fetch attendance with AbortController to avoid race conditions
    // showLoading: true for initial load (show spinner), false for action refetch (no spinner)
    const fetchTodayAttendance = useCallback(async (signal, showLoading = true) => {
        if (showLoading) setLoading(true);
        setError('');
        try {
            const config = signal ? { signal } : undefined;
            const res = await client.get(`/attendance/me?month=${currentMonth}`, config);
            // Defensive: ensure items is array before find
            const items = Array.isArray(res.data?.items) ? res.data.items : [];
            const todayRecord = items.find((item) => item.date === today);
            setTodayAttendance(todayRecord || null);
        } catch (err) {
            // Ignore abort errors
            if (err.name === 'CanceledError' || err.name === 'AbortError' || err?.code === 'ERR_CANCELED') return;
            setError(err.response?.data?.message || 'Failed to load attendance');
        } finally {
            // Guard: don't setState after abort/unmount
            if (signal?.aborted) return;
            if (showLoading) setLoading(false);
        }
    }, [currentMonth, today]);

    // Fetch on mount with cleanup
    useEffect(() => {
        const controller = new AbortController();
        fetchTodayAttendance(controller.signal, true);
        return () => controller.abort();
    }, [fetchTodayAttendance]);

    const handleCheckIn = async () => {
        setActionLoading(true);
        setError('');
        try {
            await client.post('/attendance/check-in');
            // Refetch without showing spinner (smooth UX)
            await fetchTodayAttendance(undefined, false);
        } catch (err) {
            setError(err.response?.data?.message || 'Check-in failed');
        } finally {
            setActionLoading(false);
        }
    };

    const handleCheckOut = async () => {
        setActionLoading(true);
        setError('');
        try {
            await client.post('/attendance/check-out');
            // Refetch without showing spinner (smooth UX)
            await fetchTodayAttendance(undefined, false);
        } catch (err) {
            setError(err.response?.data?.message || 'Check-out failed');
        } finally {
            setActionLoading(false);
        }
    };

    // Determine display state
    const hasCheckedIn = Boolean(todayAttendance?.checkInAt);
    const hasCheckedOut = Boolean(todayAttendance?.checkOutAt);

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
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            timeZone: 'Asia/Ho_Chi_Minh',
        });
    };

    return (
        <div className="max-w-xl mx-auto">
            {/* Page Title */}
            <h1 className="text-2xl font-bold text-gray-800 mb-6">Dashboard</h1>

            {/* Today's Date Card */}
            <Card className="mb-6">
                <div className="text-center">
                    <p className="text-gray-500 text-sm">Hôm nay</p>
                    <p className="text-lg font-semibold text-gray-800">
                        {formatDate(today)}
                    </p>
                </div>
            </Card>

            {/* Error Alert */}
            {error && (
                <Alert color="failure" className="mb-4" onDismiss={() => setError('')}>
                    {error}
                </Alert>
            )}

            {/* Attendance Status Card */}
            <Card>
                {loading ? (
                    <div className="flex justify-center py-8">
                        <Spinner size="lg" />
                    </div>
                ) : (
                    <div className="text-center space-y-6">
                        {/* Status Badge */}
                        <div>
                            {!hasCheckedIn ? (
                                <Badge color="gray" size="lg" icon={HiXCircle}>
                                    Chưa check-in
                                </Badge>
                            ) : !hasCheckedOut ? (
                                <Badge color="success" size="lg" icon={HiClock}>
                                    Đang làm việc
                                </Badge>
                            ) : (
                                <Badge color="info" size="lg" icon={HiCheckCircle}>
                                    Đã check-out
                                </Badge>
                            )}
                        </div>

                        {/* Check-in/out Times */}
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div className="bg-gray-50 rounded-lg p-4">
                                <p className="text-gray-500">Check-in</p>
                                <p className="text-xl font-bold text-gray-800">
                                    {formatTime(todayAttendance?.checkInAt)}
                                </p>
                            </div>
                            <div className="bg-gray-50 rounded-lg p-4">
                                <p className="text-gray-500">Check-out</p>
                                <p className="text-xl font-bold text-gray-800">
                                    {formatTime(todayAttendance?.checkOutAt)}
                                </p>
                            </div>
                        </div>

                        {/* Late/Work/OT Info (if checked in) */}
                        {hasCheckedIn && (
                            <div className="grid grid-cols-3 gap-2 text-xs">
                                <div className="bg-yellow-50 rounded p-2">
                                    <p className="text-yellow-600">Đi muộn</p>
                                    <p className="font-semibold">
                                        {todayAttendance?.lateMinutes || 0} phút
                                    </p>
                                </div>
                                <div className="bg-blue-50 rounded p-2">
                                    <p className="text-blue-600">Làm việc</p>
                                    <p className="font-semibold">
                                        {todayAttendance?.workMinutes || 0} phút
                                    </p>
                                </div>
                                <div className="bg-green-50 rounded p-2">
                                    <p className="text-green-600">OT</p>
                                    <p className="font-semibold">
                                        {todayAttendance?.otMinutes || 0} phút
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Action Buttons */}
                        <div className="flex gap-4 justify-center">
                            {!hasCheckedIn && (
                                <Button
                                    color="cyan"
                                    size="lg"
                                    onClick={handleCheckIn}
                                    disabled={actionLoading || loading}
                                >
                                    {actionLoading ? (
                                        <Spinner size="sm" className="mr-2" />
                                    ) : null}
                                    Check-in
                                </Button>
                            )}
                            {hasCheckedIn && !hasCheckedOut && (
                                <Button
                                    color="failure"
                                    size="lg"
                                    onClick={handleCheckOut}
                                    disabled={actionLoading || loading}
                                >
                                    {actionLoading ? (
                                        <Spinner size="sm" className="mr-2" />
                                    ) : null}
                                    Check-out
                                </Button>
                            )}
                            {hasCheckedOut && (
                                <p className="text-gray-500 italic">
                                    Bạn đã hoàn thành ngày làm việc!
                                </p>
                            )}
                        </div>
                    </div>
                )}
            </Card>
        </div>
    );
}
