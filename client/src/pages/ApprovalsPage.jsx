import { useState } from 'react';
import { Alert, Spinner, Tabs } from 'flowbite-react';
import { usePagination } from '../hooks/usePagination';
import {
    getPendingRequests,
    getApprovalHistory,
    approveRequest,
    rejectRequest
} from '../api/requestApi';
import PendingRequestsTable from '../components/approvals/PendingRequestsTable';
import ApprovalModal from '../components/approvals/ApprovalModal';
import ApprovalHistoryTable from '../components/approvals/ApprovalHistoryTable';

/**
 * ApprovalsPage: Manager/Admin views pending requests + approve/reject.
 *
 * Features:
 * - Pending requests table with pagination
 * - Approve/Reject with confirmation modal
 * - RBAC: Manager sees team only, Admin sees all (handled by backend)
 * 
 * Refactored from 248 lines to ~120 lines
 */
export default function ApprovalsPage() {
    // Tab state (Flowbite Tabs uses numeric index)
    const [activeTabIndex, setActiveTabIndex] = useState(0); // 0: pending, 1: history

    // Modal states
    const [modalOpen, setModalOpen] = useState(false);
    const [modalAction, setModalAction] = useState(null); // 'approve' | 'reject'
    const [selectedRequest, setSelectedRequest] = useState(null);
    const [rejectReason, setRejectReason] = useState('');
    const [actionLoading, setActionLoading] = useState(false);
    const [actionError, setActionError] = useState('');
    const [historyStatusFilter, setHistoryStatusFilter] = useState('');

    // Paginated pending requests
    const {
        items: pendingRequests,
        pagination: pendingPagination,
        loading: pendingLoading,
        error: pendingError,
        setPage: setPendingPage,
        refetch: refetchPending
    } = usePagination({
        fetchFn: async (params, signal) => {
            const res = await getPendingRequests(params, { signal });
            return {
                items: res.data.items ?? [],
                pagination: res.data.pagination ?? { page: 1, limit: 20, total: 0, totalPages: 1 }
            };
        },
        enabled: activeTabIndex === 0
    });

    // Paginated approval history
    const {
        items: historyRequests,
        pagination: historyPagination,
        loading: historyLoading,
        error: historyError,
        setPage: setHistoryPage
    } = usePagination({
        fetchFn: async (params, signal) => {
            const res = await getApprovalHistory(params, { signal });
            return {
                items: res.data.items ?? [],
                pagination: res.data.pagination ?? { page: 1, limit: 20, total: 0, totalPages: 1 }
            };
        },
        extraParams: historyStatusFilter ? { status: historyStatusFilter } : {},
        enabled: activeTabIndex === 1
    });

    // Modal handlers
    const handleOpenModal = (request, action) => {
        setSelectedRequest(request);
        setModalAction(action);
        setRejectReason('');
        setActionError('');
        setModalOpen(true);
    };

    const handleCloseModal = () => {
        if (actionLoading) return;
        setModalOpen(false);
        setSelectedRequest(null);
        setModalAction(null);
        setRejectReason('');
        setActionError('');
    };

    const handleHistoryStatusChange = (status) => {
        setHistoryStatusFilter(status);
        setHistoryPage(1);
    };

    const handleConfirm = async () => {
        // #1 Double-submit guard
        if (actionLoading) return;
        // Validate request and action
        if (!selectedRequest?._id) return;
        if (!modalAction) return;

        setActionLoading(true);
        setActionError('');
        try {
            // #2 Explicit modalAction validation
            if (modalAction === 'approve') {
                await approveRequest(selectedRequest._id);
            } else if (modalAction === 'reject') {
                await rejectRequest(selectedRequest._id, rejectReason);
            } else {
                return; // Invalid action
            }

            // #5 Force close modal (don't call handleCloseModal during actionLoading)
            setModalOpen(false);
            setSelectedRequest(null);
            setModalAction(null);
            setRejectReason('');
            setActionError('');

            // Force refetch to update list (works even on page 1)
            refetchPending();
        } catch (err) {
            setActionError(err.response?.data?.message || 
                `${modalAction === 'approve' ? 'Duyệt' : 'Từ chối'} thất bại`);
        } finally {
            setActionLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Page Title */}
            <h1 className="text-2xl font-bold text-gray-800">
                Duyệt yêu cầu
            </h1>

            <Tabs
                variant="underline"
                onActiveTabChange={(index) => setActiveTabIndex(index)}
            >
                <Tabs.Item
                    title={`Đang chờ (${pendingPagination.total ?? 0})`}
                    active
                >
                    <div className="space-y-4">
                        {pendingError && (
                            <Alert color="failure">
                                {pendingError}
                            </Alert>
                        )}

                        {pendingLoading ? (
                            <div className="flex justify-center py-12">
                                <Spinner size="lg" />
                            </div>
                        ) : (
                            <PendingRequestsTable
                                requests={pendingRequests}
                                pagination={pendingPagination}
                                onPageChange={setPendingPage}
                                onApprove={(req) => handleOpenModal(req, 'approve')}
                                onReject={(req) => handleOpenModal(req, 'reject')}
                                actionLoading={actionLoading}
                            />
                        )}
                    </div>
                </Tabs.Item>
                <Tabs.Item title="Lịch sử">
                    <div className="space-y-4">
                        {historyError && (
                            <Alert color="failure">
                                {historyError}
                            </Alert>
                        )}

                        {historyLoading ? (
                            <div className="flex justify-center py-12">
                                <Spinner size="lg" />
                            </div>
                        ) : (
                            <ApprovalHistoryTable
                                requests={historyRequests}
                                pagination={historyPagination}
                                onPageChange={setHistoryPage}
                                statusFilter={historyStatusFilter}
                                onStatusFilterChange={handleHistoryStatusChange}
                            />
                        )}
                    </div>
                </Tabs.Item>
            </Tabs>

            {/* Confirmation Modal */}
            <ApprovalModal
                show={modalOpen}
                request={selectedRequest}
                action={modalAction}
                loading={actionLoading}
                error={actionError}
                rejectReason={rejectReason}
                onRejectReasonChange={setRejectReason}
                onConfirm={handleConfirm}
                onClose={handleCloseModal}
            />
        </div>
    );
}
