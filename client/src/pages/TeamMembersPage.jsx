import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Table, Button, Spinner, Alert, Badge
} from 'flowbite-react';
import { HiRefresh, HiEye } from 'react-icons/hi';
import { getTodayAttendance } from '../api/memberApi';

/**
 * TeamMembersPage: Manager views list of same-team members with today's activity.
 * 
 * Features:
 * - Display team members table with today's status
 * - Navigate to detail page on View click
 * - No scope filter (Manager can only see their own team)
 * - NO Edit/Reset buttons (Manager is read-only)
 * 
 * RBAC: MANAGER only (enforced by route + backend)
 * Backend auto-filters to manager's team via getTodayAttendance(scope='team')
 */
export default function TeamMembersPage() {
    const navigate = useNavigate();
    const isMounted = useRef(true);

    // Get current date in GMT+7 for display
    const getTodayDate = () => {
        const now = new Date();
        const utcMs = now.getTime() + (now.getTimezoneOffset() * 60000);
        const gmt7Ms = utcMs + (7 * 60 * 60 * 1000);
        const gmt7 = new Date(gmt7Ms);
        const day = String(gmt7.getDate()).padStart(2, '0');
        const month = String(gmt7.getMonth() + 1).padStart(2, '0');
        const year = gmt7.getFullYear();
        return `${day}/${month}/${year}`;
    };

    // Data states
    const [members, setMembers] = useState([]);
    const [todayDate, setTodayDate] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Race condition protection
    const requestIdRef = useRef(0);

    // Status badge colors per RULES.md line 102-109
    const statusColors = {
        'ON_TIME': 'success',      // green
        'LATE': 'warning',         // orange
        'WORKING': 'info',         // blue
        'MISSING_CHECKOUT': 'warning', // yellow per RULES.md
        'WEEKEND_OR_HOLIDAY': 'gray',  // grey per RULES.md
        'ABSENT': 'failure',           // red
        null: 'gray'                   // neutral / not checked in yet
    };

    const statusLabels = {
        'ON_TIME': 'On Time',
        'LATE': 'Late',
        'WORKING': 'Working',
        'MISSING_CHECKOUT': 'Missing Checkout',
        'WEEKEND_OR_HOLIDAY': 'Weekend/Holiday',
        'ABSENT': 'Absent',
        null: 'Not Checked In'
    };

    // Cleanup on unmount
    useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false;
        };
    }, []);

    // Fetch team members
    const fetchMembers = useCallback(async () => {
        const currentRequestId = ++requestIdRef.current;

        setLoading(true);
        setError('');
        try {
            // Manager: backend auto-filters to same team
            const res = await getTodayAttendance({ scope: 'team' });

            if (isMounted.current && currentRequestId === requestIdRef.current) {
                setMembers(res.data.items || []);
                // FIX: Format backend date (YYYY-MM-DD) to DD/MM/YYYY for display
                const backendDate = res.data.date;
                if (backendDate) {
                    const [year, month, day] = backendDate.split('-');
                    setTodayDate(`${day}/${month}/${year}`);
                } else {
                    setTodayDate(getTodayDate()); // Fallback same format
                }
            }
        } catch (err) {
            console.error('Failed to fetch team members:', err);
            if (isMounted.current && currentRequestId === requestIdRef.current) {
                setMembers([]);
                if (err.response?.status === 403) {
                    setError('You do not have a team assigned. Please contact admin.');
                } else {
                    setError(err.response?.data?.message || 'Failed to load team members');
                }
            }
        } finally {
            if (isMounted.current && currentRequestId === requestIdRef.current) {
                setLoading(false);
            }
        }
    }, []);

    // Fetch on mount
    useEffect(() => {
        fetchMembers();
    }, [fetchMembers]);

    // Format time (ISO → HH:mm GMT+7)
    const formatTime = (isoString) => {
        if (!isoString) return '-';
        return new Date(isoString).toLocaleTimeString('vi-VN', {
            timeZone: 'Asia/Ho_Chi_Minh',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    // Navigate to member detail
    const handleViewClick = (userId) => {
        navigate(`/team/members/${userId}`);
    };

    return (
        <div className="p-4">
            {/* Header */}
            <div className="flex justify-between items-center mb-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Team Members</h1>
                    {todayDate && (
                        <p className="text-sm text-gray-500">Today: {todayDate}</p>
                    )}
                </div>
                <Button color="light" onClick={fetchMembers} disabled={loading}>
                    <HiRefresh className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                </Button>
            </div>

            {/* Error Alert */}
            {error && (
                <Alert color="failure" className="mb-4">
                    {error}
                </Alert>
            )}

            {/* Loading State */}
            {loading ? (
                <div className="flex justify-center py-20">
                    <Spinner size="xl" />
                </div>
            ) : members.length === 0 && !error ? (
                <Alert color="info">
                    No team members found. Your team may be empty.
                </Alert>
            ) : (
                /* Members Table */
                <div className="overflow-x-auto">
                    <Table striped>
                        <Table.Head>
                            <Table.HeadCell>Code</Table.HeadCell>
                            <Table.HeadCell>Name</Table.HeadCell>
                            <Table.HeadCell>Email</Table.HeadCell>
                            <Table.HeadCell>Status</Table.HeadCell>
                            <Table.HeadCell>Check In</Table.HeadCell>
                            <Table.HeadCell>Check Out</Table.HeadCell>
                            <Table.HeadCell>Actions</Table.HeadCell>
                        </Table.Head>
                        <Table.Body className="divide-y">
                            {members.map((item) => (
                                <Table.Row key={item.user._id} className="bg-white">
                                    <Table.Cell className="font-medium">
                                        {item.user.employeeCode}
                                    </Table.Cell>
                                    <Table.Cell>{item.user.name}</Table.Cell>
                                    <Table.Cell className="text-gray-500">
                                        {item.user.email}
                                    </Table.Cell>
                                    <Table.Cell>
                                        <Badge color={statusColors[item.computed?.status] || 'gray'}>
                                            {statusLabels[item.computed?.status] || 'Unknown'}
                                        </Badge>
                                    </Table.Cell>
                                    <Table.Cell>
                                        {formatTime(item.attendance?.checkInAt)}
                                    </Table.Cell>
                                    <Table.Cell>
                                        {formatTime(item.attendance?.checkOutAt)}
                                    </Table.Cell>
                                    <Table.Cell>
                                        <Button
                                            size="xs"
                                            color="light"
                                            onClick={() => handleViewClick(item.user._id)}
                                        >
                                            <HiEye className="mr-1 h-4 w-4" />
                                            View
                                        </Button>
                                    </Table.Cell>
                                </Table.Row>
                            ))}
                        </Table.Body>
                    </Table>
                </div>
            )}
        </div>
    );
}
