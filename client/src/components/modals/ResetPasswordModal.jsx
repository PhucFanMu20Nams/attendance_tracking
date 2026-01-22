import { useState } from 'react';
import { Modal, Button, Label, TextInput, Alert, Spinner } from 'flowbite-react';
import { HiKey } from 'react-icons/hi';

/**
 * ResetPasswordModal: Shared modal for resetting user password.
 * Extracted from AdminMembersPage.jsx and AdminMemberDetailPage.jsx.
 * 
 * Features:
 * - Min 8 character validation
 * - Auto-clear password on close
 * - Disabled submit when validation fails
 * - Internal loading/error state management
 * 
 * Props:
 *  - show: boolean - modal visibility
 *  - userName: string - display name in header
 *  - onClose: () => void - callback when modal closes
 *  - onSubmit: (password) => Promise<void> - async submit handler
 * 
 * Usage:
 * ```jsx
 * const handleResetSubmit = async (password) => {
 *   await resetPassword(userId, password);
 *   showToast('Password updated!');
 * };
 * 
 * <ResetPasswordModal
 *   show={!!resetUser}
 *   userName={resetUser?.name}
 *   onClose={() => setResetUser(null)}
 *   onSubmit={handleResetSubmit}
 * />
 * ```
 */
export default function ResetPasswordModal({ show, userName, onClose, onSubmit }) {
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async () => {
        // Guard: prevent double-submit (defensive)
        if (loading) return;
        
        // Client-side validation (defensive - button already disabled, but guard bypass scenarios)
        if (password.length < 8) {
            setError('Password must be at least 8 characters');
            return;
        }

        setLoading(true);
        setError('');

        try {
            // Call parent's submit handler with new password
            await onSubmit(password);
            
            // Success → clear form, close modal (parent will show toast)
            setPassword('');
            onClose();
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'Failed to reset password');
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        // Prevent close when loading (ESC/overlay/Cancel button)
        if (loading) return;
        
        // Clear form state on close
        setPassword('');
        setError('');
        onClose();
    };

    return (
        <Modal show={show} onClose={handleClose}>
            <Modal.Header>Reset Password: {userName}</Modal.Header>
            <Modal.Body>
                {error && <Alert color="failure" className="mb-4">{error}</Alert>}
                <div>
                    <Label htmlFor="new-password" value="New Password (min 8 characters)" />
                    <TextInput
                        id="new-password"
                        type="password"
                        value={password}
                        onChange={(e) => {
                            setPassword(e.target.value);
                            setError(''); // Clear error when user types (UX)
                        }}
                        placeholder="Enter new password"
                        autoComplete="new-password"
                    />
                </div>
            </Modal.Body>
            <Modal.Footer>
                <Button onClick={handleSubmit} disabled={loading || password.length < 8}>
                    {loading ? <Spinner size="sm" className="mr-2" /> : <HiKey className="mr-2" />}
                    Reset Password
                </Button>
                <Button color="gray" onClick={handleClose} disabled={loading}>
                    Cancel
                </Button>
            </Modal.Footer>
        </Modal>
    );
}
