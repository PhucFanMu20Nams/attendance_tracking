import { useState } from 'react';
import { Alert, Spinner } from 'flowbite-react';
import { usePagination } from '../hooks/usePagination';
import { getPendingRequests, approveRequest, rejectRequest } from '../api/requestApi';
import PendingRequestsTable from '../components/approvals/PendingRequestsTable';
import ApprovalModal from '../components/approvals/ApprovalModal';

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
    // Modal states
    const [modalOpen, setModalOpen] = useState(false);
    const [modalAction, setModalAction] = useState(null); // 'approve' | 'reject'
    const [selectedRequest, setSelectedRequest] = useState(null);
    const [actionLoading, setActionLoading] = useState(false);
    const [actionError, setActionError] = useState('');

    // Paginated pending requests
    const {
        items: requests,
        pagination,
        loading,
        error,
        setPage,
        refetch
    } = usePagination({
        fetchFn: async (params, signal) => {
            const res = await getPendingRequests(params, { signal });
            return {
                items: res.data.items ?? [],
                pagination: res.data.pagination ?? { page: 1, limit: 20, total: 0, totalPages: 1 }
            };
        }
    });

    // Modal handlers
    const handleOpenModal = (request, action) => {
        setSelectedRequest(request);
        setModalAction(action);
        setActionError('');
        setModalOpen(true);
    };

    const handleCloseModal = () => {
        if (actionLoading) return;
        setModalOpen(false);
        setSelectedRequest(null);
        setModalAction(null);
        setActionError('');
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
                await rejectRequest(selectedRequest._id);
            } else {
                return; // Invalid action
            }

            // #5 Force close modal (don't call handleCloseModal during actionLoading)
            setModalOpen(false);
            setSelectedRequest(null);
            setModalAction(null);
            setActionError('');

            // #3 Navigate to page 1 (consistency with RequestsPage)
            setPage(1);
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
                {pagination.total > 0 && (
                    <span className="text-sm font-normal text-gray-500 ml-2">
                        ({pagination.total} yêu cầu đang chờ)
                    </span>
                )}
            </h1>

            {/* Error Alert */}
            {error && (
                <Alert color="failure">
                    {error}
                </Alert>
            )}

            {/* Pending Requests Table */}
            {loading ? (
                <div className="flex justify-center py-12">
                    <Spinner size="lg" />
                </div>
            ) : (
                <PendingRequestsTable
                    requests={requests}
                    pagination={pagination}
                    onPageChange={setPage}
                    onApprove={(req) => handleOpenModal(req, 'approve')}
                    onReject={(req) => handleOpenModal(req, 'reject')}
                    actionLoading={actionLoading}
                />
            )}

            {/* Confirmation Modal */}
            <ApprovalModal
                show={modalOpen}
                request={selectedRequest}
                action={modalAction}
                loading={actionLoading}
                error={actionError}
                onConfirm={handleConfirm}
                onClose={handleCloseModal}
            />
        </div>
    );
}
