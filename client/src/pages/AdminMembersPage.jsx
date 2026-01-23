import { useState, useEffect } from 'react';
import { Button, Alert, Spinner } from 'flowbite-react';
import { HiRefresh, HiPlus } from 'react-icons/hi';
import { useNavigate } from 'react-router-dom';

// API
import { getTeams, updateUser, resetPassword } from '../api/memberApi';
import { getAdminUsers } from '../api/adminApi';

// Hooks
import { usePagination } from '../hooks/usePagination';
import { useMembersFetch } from '../hooks/useMembersFetch';
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

    // Modal states
    const [editUser, setEditUser] = useState(null);
    const [resetUser, setResetUser] = useState(null);
    const [createModal, setCreateModal] = useState(false);

    // ═══════════════════════════════════════════════════════════════════════
    // CUSTOM HOOKS
    // ═══════════════════════════════════════════════════════════════════════

    // Today Activity data
    const {
        members,
        todayDate,
        loading: todayLoading,
        error: todayError,
        refetch: refetchToday
    } = useMembersFetch({
        enabled: viewMode === 'today',
        scope,
        teamId
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
            return { items: res.data.items, pagination: res.data.pagination };
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
                }
            } catch (err) {
                console.error('Failed to fetch teams:', err);
                if (isMounted) {
                    setTeams([]); // Set empty on error to stop loading state
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
            showToast('Password updated', 'success');
        } catch (e) {
            showToast(e.response?.data?.message || 'Failed to reset password', 'failure');
        }
    };

    const handleCreateSuccess = () => {
        showToast('Member created successfully', 'success');
        viewMode === 'today' ? refetchToday() : refetchAllUsers();
    };

    const handleViewDetail = (userId) => {
        navigate(`/admin/members/${userId}`);
    };

    const handleRefresh = () => {
        viewMode === 'today' ? refetchToday() : refetchAllUsers();
    };

    const handleViewModeChange = (mode) => {
        setViewMode(mode);
        if (mode === 'all') {
            setPage(1); // Reset page when switching to All Users
        }
    };

    // ═══════════════════════════════════════════════════════════════════════
    // DERIVED VALUES
    // ═══════════════════════════════════════════════════════════════════════

    const isLoading = viewMode === 'today' ? todayLoading : allUsersLoading;
    const error = viewMode === 'today' ? todayError : allUsersError;

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
                    todayDate={todayDate}
                />
            )}

            {viewMode === 'all' && (
                <MemberSearchBar
                    value={search}
                    onChange={setSearch}
                    totalCount={pagination.total}
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