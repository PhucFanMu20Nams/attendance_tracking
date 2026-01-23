import { useState, useEffect } from 'react';
import { Button, Alert, Spinner } from 'flowbite-react';
import { HiRefresh, HiPlus } from 'react-icons/hi';
import { useNavigate } from 'react-router-dom';

// API
import { getTeams, getTodayAttendance, updateUser, resetPassword } from '../api/memberApi';
import { getAdminUsers } from '../api/adminApi';

// Hooks
import { usePagination } from '../hooks/usePagination';
import { useToast } from '../hooks/useToast';

// Components - UI
import { PageHeader } from '../components/ui';
import ToastNotification from '../components/ui/ToastNotification';

// Components - Modals
import EditMemberModal from '../components/modals/EditMemberModal';
import ResetPasswordModal from '../components/modals/ResetPasswordModal';
import CreateMemberModal from '../components/modals/CreateMemberModal';

// Components - Members
import MemberFilters from '../components/members/MemberFilters';
import MemberSearchBar from '../components/members/MemberSearchBar';
import TodayActivityTable from '../components/members/TodayActivityTable';
import AllUsersTable from '../components/members/AllUsersTable';

/**
 * AdminMembersPage: Admin views all members with today's activity or paginated user list.
 * 
 * Features:
 * - View mode toggle: Today Activity | All Users
 * - Today Activity: Scope filter + status badges
 * - All Users: Search + pagination (B1 feature)
 * - Edit member modal (whitelist fields)
 * - Reset password modal
 * - Create member modal
 * 
 * RBAC: ADMIN only (enforced by route + backend)
 * 
 * Refactored from 714 lines to ~220 lines (-69%)
 * - Extracted: useMembersFetch, MemberFilters, MemberSearchBar, 
 *   TodayActivityTable, AllUsersTable, CreateMemberModal
 */
export default function AdminMembersPage() {
    const navigate = useNavigate();
    const { toast, showToast, hideToast } = useToast();

    // ═══════════════════════════════════════════════════════════════════════
    // VIEW MODE STATE
    // ═══════════════════════════════════════════════════════════════════════

    const [viewMode, setViewMode] = useState('today'); // 'today' | 'all'

    // Filter states (for Today Activity mode)
    const [scope, setScope] = useState('company');
    const [teamId, setTeamId] = useState('');
    const [teams, setTeams] = useState(null); // null = loading, [] = empty
    const [teamsFetchError, setTeamsFetchError] = useState(false); // P2 FIX: Track fetch error

    // Modal states
    const [editUser, setEditUser] = useState(null);
    const [resetUser, setResetUser] = useState(null);
    const [createModal, setCreateModal] = useState(false);

    // ═══════════════════════════════════════════════════════════════════════
    // CUSTOM HOOKS
    // ═══════════════════════════════════════════════════════════════════════

    // Today Activity data (paginated v2.5+)
    // P1 FIX: Only enable when scope != 'team' OR teamId is selected (prevent 400 spam)
    const todayEnabled = viewMode === 'today' && (scope !== 'team' || !!teamId);

    const {
        items: members,
        pagination: todayPagination,
        loading: todayLoading,
        error: todayError,
        setPage: setTodayPage,
        refetch: refetchToday
    } = usePagination({
        fetchFn: async (params, signal) => {
            const res = await getTodayAttendance(params, { signal });
            return {
                items: res.data.items ?? [],
                pagination: res.data.pagination ?? { page: 1, limit: 20, total: 0, totalPages: 0 }
            };
        },
        enabled: todayEnabled,
        extraParams: { scope, teamId: scope === 'team' ? teamId : undefined }
    });

    // All Users data (paginated)
    const {
        items: allUsers,
        pagination,
        loading: allUsersLoading,
        error: allUsersError,
        search,
        setSearch,
        setPage,
        refetch: refetchAllUsers
    } = usePagination({
        // P1 FIX: Signal signature - hook passes raw signal, not { signal }
        fetchFn: async (params, signal) => {
            const res = await getAdminUsers(params, { signal });
            return { 
                items: res.data.items ?? [], // P4 FIX: Null-safety consistent with Today Activity
                pagination: res.data.pagination 
            };
        },
        enabled: viewMode === 'all'
    });

    // ═══════════════════════════════════════════════════════════════════════
    // FETCH TEAMS ON MOUNT
    // ═══════════════════════════════════════════════════════════════════════

    // P2 FIX: isMounted guard to prevent setState after unmount
    useEffect(() => {
        let isMounted = true;

        const fetchTeamsList = async () => {
            try {
                const res = await getTeams();
                if (isMounted) {
                    setTeams(res.data.items || []);
                    setTeamsFetchError(false); // Clear error on success
                }
            } catch (err) {
                console.error('Failed to fetch teams:', err);
                if (isMounted) {
                    setTeams([]); // Set empty to stop loading state
                    setTeamsFetchError(true); // P2 FIX: Set error flag for UX
                }
            }
        };
        fetchTeamsList();

        return () => {
            isMounted = false;
        };
    }, []);

    // ═══════════════════════════════════════════════════════════════════════
    // HANDLERS
    // ═══════════════════════════════════════════════════════════════════════

    // P1 FIX: Try/catch for all async handlers to prevent unhandled rejections
    const handleEditSubmit = async (data, userId) => {
        try {
            await updateUser(userId, data);
            setEditUser(null); // P3 FIX: Close modal explicitly
            showToast('Member updated successfully', 'success');
            viewMode === 'today' ? refetchToday() : refetchAllUsers();
        } catch (e) {
            showToast(e.response?.data?.message || 'Failed to update member', 'failure');
        }
    };

    const handleResetSubmit = async (newPassword) => {
        if (!resetUser?._id) return;
        try {
            await resetPassword(resetUser._id, newPassword);
            setResetUser(null); // P3 FIX: Close modal explicitly
            showToast('Password updated', 'success');
        } catch (e) {
            showToast(e.response?.data?.message || 'Failed to reset password', 'failure');
        }
    };

    const handleCreateSuccess = () => {
        setCreateModal(false); // P3 FIX: Close modal explicitly
        showToast('Member created successfully', 'success');
        viewMode === 'today' ? refetchToday() : refetchAllUsers();
        // Note: NOT resetting page to 1 because backend sorts by employeeCode (ascending)
        // New user may not appear on page 1
    };

    const handleViewDetail = (userId) => {
        navigate(`/admin/members/${userId}`);
    };

    const handleRefresh = () => {
        viewMode === 'today' ? refetchToday() : refetchAllUsers();
    };

    const handleViewModeChange = (mode) => {
        setViewMode(mode);
        // P2 FIX: Reset page for both modes (consistent UX)
        if (mode === 'all') {
            setPage(1);
        } else if (mode === 'today') {
            setTodayPage(1);
        }
    };

    // ═══════════════════════════════════════════════════════════════════════
    // DERIVED VALUES
    // ═══════════════════════════════════════════════════════════════════════

    const isLoading = viewMode === 'today' ? todayLoading : allUsersLoading;
    const error = viewMode === 'today' ? todayError : allUsersError;
    
    // Today's date in GMT+7 (Asia/Ho_Chi_Minh) for display in MemberFilters
    const todayDate = new Date().toLocaleDateString('en-CA', { 
        timeZone: 'Asia/Ho_Chi_Minh' 
    }); // Returns 'YYYY-MM-DD'

    // ═══════════════════════════════════════════════════════════════════════
    // RENDER
    // ═══════════════════════════════════════════════════════════════════════

    return (
        <div>
            {/* Page Header */}
            <PageHeader title="Quản lý nhân viên">
                <Button color="success" onClick={() => setCreateModal(true)}>
                    <HiPlus className="mr-2 h-4 w-4" />
                    Thêm nhân viên
                </Button>
                <Button color="light" onClick={handleRefresh} disabled={isLoading}>
                    <HiRefresh className="mr-2 h-4 w-4" />
                    Làm mới
                </Button>
            </PageHeader>

            {/* View Mode Toggle */}
            <div className="mb-4 flex gap-2">
                <Button
                    color={viewMode === 'today' ? 'info' : 'gray'}
                    onClick={() => handleViewModeChange('today')}
                >
                    Today Activity
                </Button>
                <Button
                    color={viewMode === 'all' ? 'info' : 'gray'}
                    onClick={() => handleViewModeChange('all')}
                >
                    All Users
                </Button>
            </div>

            {/* Filters / Search */}
            {viewMode === 'today' && (
                <MemberFilters
                    scope={scope}
                    onScopeChange={setScope}
                    teamId={teamId}
                    onTeamChange={setTeamId}
                    teams={teams}
                    teamsFetchError={teamsFetchError}
                    todayDate={todayDate}
                />
            )}

            {viewMode === 'all' && (
                <MemberSearchBar
                    value={search}
                    onChange={setSearch}
                    totalCount={pagination?.total ?? 0}
                />
            )}

            {/* Error Alert */}
            {error && (
                <Alert color="failure" className="mb-4">{error}</Alert>
            )}

            {/* Loading State */}
            {isLoading && (
                <div className="flex justify-center py-10">
                    <Spinner size="lg" />
                </div>
            )}

            {/* Today Activity Table */}
            {viewMode === 'today' && !todayLoading && (
                <>
                    {/* Empty State for scope=team but no team selected */}
                    {scope === 'team' && !teamId ? (
                        <Alert color="info">
                            Please select a team to view members.
                        </Alert>
                    ) : (
                        <TodayActivityTable
                            members={members}
                            pagination={todayPagination}
                            onPageChange={setTodayPage}
                            onViewDetail={handleViewDetail}
                            onEdit={setEditUser}
                            onResetPassword={setResetUser}
                        />
                    )}
                </>
            )}

            {/* All Users Table */}
            {viewMode === 'all' && !allUsersLoading && (
                <AllUsersTable
                    users={allUsers}
                    pagination={pagination}
                    onPageChange={setPage}
                    onViewDetail={handleViewDetail}
                    onEdit={setEditUser}
                    onResetPassword={setResetUser}
                />
            )}

            {/* Modals - P2 FIX: Pass teams || [] for null safety */}
            <EditMemberModal
                show={!!editUser}
                user={editUser}
                teams={teams || []}
                onClose={() => setEditUser(null)}
                onSubmit={handleEditSubmit}
            />

            <ResetPasswordModal
                show={!!resetUser}
                userName={resetUser?.name}
                onClose={() => setResetUser(null)}
                onSubmit={handleResetSubmit}
            />

            <CreateMemberModal
                show={createModal}
                teams={teams || []}
                onClose={() => setCreateModal(false)}
                onSuccess={handleCreateSuccess}
            />

            {/* Toast */}
            <ToastNotification {...toast} onClose={hideToast} />
        </div>
    );
}