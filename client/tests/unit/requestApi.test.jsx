import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/api/client', () => ({
    default: {
        get: vi.fn(),
        post: vi.fn(),
        delete: vi.fn()
    }
}));

import client from '../../src/api/client';
import { getApprovalHistory, rejectRequest } from '../../src/api/requestApi';

describe('requestApi', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('getApprovalHistory should call GET /requests/history with params', () => {
        getApprovalHistory({ page: 2, status: 'APPROVED' }, { signal: 'test-signal' });

        expect(client.get).toHaveBeenCalledWith('/requests/history', {
            signal: 'test-signal',
            params: { page: 2, status: 'APPROVED' }
        });
    });

    it('rejectRequest(id) should send empty body with empty config', () => {
        rejectRequest('req-1');

        expect(client.post).toHaveBeenCalledWith('/requests/req-1/reject', {}, {});
    });

    it('rejectRequest(id, config) should keep legacy config signature', () => {
        const config = { signal: 'legacy-signal' };
        rejectRequest('req-2', config);

        expect(client.post).toHaveBeenCalledWith('/requests/req-2/reject', {}, config);
    });

    it('rejectRequest(id, reason) should send rejectReason in body', () => {
        rejectRequest('req-3', 'Need more details');

        expect(client.post).toHaveBeenCalledWith(
            '/requests/req-3/reject',
            { rejectReason: 'Need more details' },
            {}
        );
    });

    it('rejectRequest(id, reason, config) should send rejectReason and config', () => {
        const config = { signal: 'new-signature-signal' };
        rejectRequest('req-4', 'Policy mismatch', config);

        expect(client.post).toHaveBeenCalledWith(
            '/requests/req-4/reject',
            { rejectReason: 'Policy mismatch' },
            config
        );
    });

    it('rejectRequest with blank reason should send empty body', () => {
        rejectRequest('req-5', '   ');

        expect(client.post).toHaveBeenCalledWith('/requests/req-5/reject', {}, {});
    });
});
