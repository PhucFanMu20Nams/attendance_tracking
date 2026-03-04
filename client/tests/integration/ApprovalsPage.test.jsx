import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ApprovalsPage from '../../src/pages/ApprovalsPage';

vi.mock('../../src/api/requestApi', () => ({
    getPendingRequests: vi.fn(),
    getApprovalHistory: vi.fn(),
    approveRequest: vi.fn(),
    rejectRequest: vi.fn()
}));

import {
    getPendingRequests,
    getApprovalHistory,
    approveRequest,
    rejectRequest
} from '../../src/api/requestApi';

describe('ApprovalsPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        getPendingRequests.mockResolvedValue({
            data: {
                items: [],
                pagination: { page: 1, limit: 20, total: 0, totalPages: 0 }
            }
        });
        getApprovalHistory.mockResolvedValue({
            data: {
                items: [],
                pagination: { page: 1, limit: 20, total: 0, totalPages: 0 }
            }
        });
        approveRequest.mockResolvedValue({ data: { request: {} } });
        rejectRequest.mockResolvedValue({ data: { request: {} } });
    });

    it('switching to Lịch sử tab should trigger history fetch', async () => {
        const user = userEvent.setup();
        render(<ApprovalsPage />);

        await waitFor(() => {
            expect(getPendingRequests).toHaveBeenCalled();
        });
        expect(getApprovalHistory).not.toHaveBeenCalled();

        await user.click(screen.getByRole('tab', { name: 'Lịch sử' }));

        await waitFor(() => {
            expect(getApprovalHistory).toHaveBeenCalled();
        });
    });

    it('reject flow should send reject reason from modal', async () => {
        const user = userEvent.setup();
        getPendingRequests.mockResolvedValue({
            data: {
                items: [
                    {
                        _id: 'request-1',
                        type: 'ADJUST_TIME',
                        date: '2026-03-04',
                        requestedCheckInAt: '2026-03-04T08:30:00+07:00',
                        requestedCheckOutAt: null,
                        reason: 'Need fix',
                        userId: { name: 'Nguyen Van A', employeeCode: 'NV001' }
                    }
                ],
                pagination: { page: 1, limit: 20, total: 1, totalPages: 1 }
            }
        });

        render(<ApprovalsPage />);

        await waitFor(() => {
            expect(screen.getByText('Nguyen Van A')).toBeInTheDocument();
        });

        await user.click(screen.getByRole('button', { name: /reject request/i }));

        const reasonTextarea = await screen.findByLabelText('Lý do từ chối (tùy chọn)');
        await user.type(reasonTextarea, 'Thiếu bằng chứng');

        await user.click(screen.getByRole('button', { name: 'Xác nhận' }));

        await waitFor(() => {
            expect(rejectRequest).toHaveBeenCalledWith('request-1', 'Thiếu bằng chứng');
        });
    });
});
