import { Card, Alert, Spinner } from 'flowbite-react';
import { usePagination } from '../hooks/usePagination';
import { getMyRequests } from '../api/requestApi';
import CreateRequestForm from '../components/requests/CreateRequestForm';
import MyRequestsTable from '../components/requests/MyRequestsTable';

/**
 * RequestsPage: Employee creates requests + views their own requests.
 *
 * Features:
 * - Create request form (extracted component)
 * - My requests table with pagination
 * - All dates/times in GMT+7
 * 
 * Refactored from 344 lines to ~80 lines
 */
export default function RequestsPage() {
    // Paginated requests data
    const {
        items: requests,
        pagination,
        loading,
        error,
        setPage,
        refetch
    } = usePagination({
        fetchFn: async (params, signal) => {
            const res = await getMyRequests(params, { signal });
            return {
                items: res.data?.items ?? [],
                pagination: res.data?.pagination ?? { page: 1, limit: 20, total: 0, totalPages: 0 }
            };
        }
    });

    // Handle successful request creation
    const handleCreateSuccess = () => {
        // Navigate to page 1 to show new request (backend sorts newest-first)
        setPage(1);
    };

    return (
        <div className="space-y-6">
            {/* Page Title */}
            <h1 className="text-2xl font-bold text-gray-800">Yêu cầu điều chỉnh</h1>

            {/* Create Request Form */}
            <CreateRequestForm onSuccess={handleCreateSuccess} />

            {/* Error Alert */}
            {error && (
                <Alert color="failure">
                    {error}
                </Alert>
            )}

            {/* Requests Table */}
            <Card>
                <h2 className="text-lg font-semibold text-gray-700 mb-4">
                    Danh sách yêu cầu của tôi
                    {pagination.total > 0 && (
                        <span className="text-sm font-normal text-gray-500 ml-2">
                            ({pagination.total} yêu cầu)
                        </span>
                    )}
                </h2>

                {loading ? (
                    <div className="flex justify-center py-12">
                        <Spinner size="lg" />
                    </div>
                ) : (
                    <MyRequestsTable
                        requests={requests}
                        pagination={pagination}
                        onPageChange={setPage}
                    />
                )}
            </Card>
        </div>
    );
}
