import { Table, Button, Pagination } from 'flowbite-react';
import { HiEye, HiPencil, HiKey, HiTrash, HiReply } from 'react-icons/hi';

/**
 * Paginated table displaying all users.
 * Extracted from AdminMembersPage.jsx lines 501-561.
 * 
 * Features:
 * - Displays user info (code, name, email, role, active status)
 * - Action buttons: View Detail, Edit, Reset Password
 * - Pagination controls (conditional, only if > 1 page)
 * - Responsive overflow handling
 * - Empty state when no data
 * - Accessibility (aria-labels)
 * - Safe data access (guards against null/undefined)
 * - Field fallbacks for missing data
 * 
 * @param {Object} props
 * @param {Array} props.users - List of user objects
 * @param {Object} props.pagination - { page, totalPages }
 * @param {Function} props.onPageChange - (page: number) => void
 * @param {Function} props.onViewDetail - (userId: string) => void
 * @param {Function} props.onEdit - (user: Object) => void
 * @param {Function} props.onResetPassword - (user: Object) => void
 */
export default function AllUsersTable({
    users,
    pagination,
    onPageChange,
    onViewDetail,
    onEdit,
    onResetPassword,
    onDelete,
    onRestore
}) {
    // Filter valid users upfront to avoid sparse array with nulls
    const validUsers = (users || []).filter(u => u?._id);
    const isEmpty = validUsers.length === 0;
    const safePagination = pagination || { page: 1, totalPages: 0 };


    // P2 FIX: Clamp currentPage to valid range
    const currentPage = Math.min(
        Math.max(1, safePagination.page || 1),
        safePagination.totalPages || 1
    );

    return (
        <>
            <div className="overflow-x-auto">
                <Table striped>
                    <Table.Head>
                        <Table.HeadCell>Code</Table.HeadCell>
                        <Table.HeadCell>Name</Table.HeadCell>
                        <Table.HeadCell>Email</Table.HeadCell>
                        <Table.HeadCell>Role</Table.HeadCell>
                        <Table.HeadCell>Active</Table.HeadCell>
                        <Table.HeadCell>Actions</Table.HeadCell>
                    </Table.Head>
                    <Table.Body className="divide-y">
                        {/* Empty state */}
                        {isEmpty ? (
                            <Table.Row>
                                <Table.Cell colSpan={6} className="text-center py-8 text-gray-500">
                                    No users found.
                                </Table.Cell>
                            </Table.Row>
                        ) : (
                            validUsers.map((user) => (
                                <Table.Row 
                                    key={user._id} 
                                    className={user.deletedAt ? 'bg-red-50 opacity-60' : 'bg-white'}
                                >
                                    {/* Employee Code with nowrap */}
                                    <Table.Cell className="whitespace-nowrap font-medium text-gray-900">
                                        {user.employeeCode || '—'}
                                    </Table.Cell>
                                    {/* Name */}
                                    <Table.Cell>{user.name || '—'}</Table.Cell>
                                    {/* Email with truncate */}
                                    <Table.Cell className="text-gray-500 text-sm max-w-[200px] truncate">
                                        {user.email || '—'}
                                    </Table.Cell>
                                    {/* Role */}
                                    <Table.Cell className="whitespace-nowrap">
                                        {user.role || '—'}
                                    </Table.Cell>
                                    {/* Active Status */}
                                    <Table.Cell className="whitespace-nowrap">
                                        {(() => {
                                            // P1 FIX: Distinguish between true/false/undefined
                                            const active = user.isActive;
                                            const label =
                                                active === true ? '✓ Active' :
                                                    active === false ? '✗ Inactive' :
                                                        '—';  // undefined/null
                                            const colorClass =
                                                active === true ? 'text-green-600' :
                                                    active === false ? 'text-red-500' :
                                                        'text-gray-400';
                                            return <span className={colorClass}>{label}</span>;
                                        })()}
                                    </Table.Cell>
                                    {/* Actions */}
                                    <Table.Cell>
                                        <div className="flex gap-2">
                                            {/* Optional chaining for callbacks + aria-labels */}
                                            <Button
                                                size="xs"
                                                color="light"
                                                onClick={() => onViewDetail?.(user._id)}
                                                title="View Detail"
                                                aria-label="View user detail"
                                            >
                                                <HiEye className="h-4 w-4" />
                                            </Button>
                                            {/* P0 FIX: Hide Edit/Reset for deleted users (read-only) */}
                                            {!user.deletedAt && (
                                                <>
                                                    <Button
                                                        size="xs"
                                                        color="light"
                                                        onClick={() => onEdit?.(user)}
                                                        title="Edit User"
                                                        aria-label="Edit user"
                                                    >
                                                        <HiPencil className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        size="xs"
                                                        color="light"
                                                        onClick={() => onResetPassword?.(user)}
                                                        title="Reset Password"
                                                        aria-label="Reset user password"
                                                    >
                                                        <HiKey className="h-4 w-4" />
                                                    </Button>
                                                </>
                                            )}
                                            {/* Delete or Restore button based on deletedAt */}
                                            {user.deletedAt ? (
                                                <Button
                                                    size="xs"
                                                    color="success"
                                                    onClick={() => onRestore?.(user._id, user.name)}
                                                    title="Restore User"
                                                    aria-label="Restore user"
                                                >
                                                    <HiReply className="h-4 w-4" />
                                                </Button>
                                            ) : (
                                                <Button
                                                    size="xs"
                                                    color="failure"
                                                    onClick={() => onDelete?.(user._id, user.name)}
                                                    title="Delete User"
                                                    aria-label="Delete user"
                                                >
                                                    <HiTrash className="h-4 w-4" />
                                                </Button>
                                            )}
                                        </div>
                                    </Table.Cell>
                                </Table.Row>
                            ))
                        )}

                    </Table.Body>
                </Table>
            </div>

            {/* Pagination Controls - only show if more than 1 page */}
            {safePagination.totalPages > 1 && (
                <div className="mt-4 flex justify-center">
                    <Pagination
                        currentPage={currentPage}
                        totalPages={safePagination.totalPages}
                        onPageChange={(p) => onPageChange?.(p)}
                        showIcons
                    />
                </div>
            )}
        </>
    );
}
