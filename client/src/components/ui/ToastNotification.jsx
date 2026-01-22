import { Toast } from 'flowbite-react';
import { HiCheck, HiX } from 'react-icons/hi';

/**
 * ToastNotification: Centralized toast notification component.
 * Extracted from AdminMembersPage.jsx and AdminMemberDetailPage.jsx.
 * 
 * Features:
 * - Success/error visual states (green check / red X icon)
 * - Fixed position (bottom-right corner)
 * - Dismissible via Toast.Toggle
 * - Returns null when not visible (performance optimization)
 * - Guards against empty message (defensive programming)
 * 
 * Props:
 *  - show: boolean - whether to display the toast
 *  - message: string - text content to display
 *  - type: 'success' | 'error' - visual variant (default: 'success')
 *  - onClose: () => void - callback when user clicks close button
 * 
 * Usage:
 * ```jsx
 * const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
 * <ToastNotification 
 *   show={toast.show} 
 *   message={toast.message} 
 *   type={toast.type}
 *   onClose={() => setToast({ ...toast, show: false })} 
 * />
 * ```
 */
export default function ToastNotification({ show, message, type = 'success', onClose }) {
    // Guard: don't render if hidden or message is empty (defensive)
    if (!show || !message) return null;
    
    return (
        <div className="fixed bottom-4 right-4 z-50">
            <Toast>
                <div className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                    type === 'success' ? 'bg-green-100 text-green-500' : 'bg-red-100 text-red-500'
                }`}>
                    {type === 'success' ? <HiCheck className="h-5 w-5" /> : <HiX className="h-5 w-5" />}
                </div>
                <div className="ml-3 text-sm font-normal">{message}</div>
                <Toast.Toggle onClick={onClose} />
            </Toast>
        </div>
    );
}
