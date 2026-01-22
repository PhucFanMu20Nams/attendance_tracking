import { useState, useRef, useEffect, useCallback } from 'react';

// Initial toast state (single source of truth)
const INITIAL_TOAST = { show: false, message: '', type: 'success' };

/**
 * useToast: Custom hook for managing toast notifications.
 * Extracted from AdminMembersPage.jsx and AdminMemberDetailPage.jsx.
 * 
 * Features:
 * - Auto-hide after configurable duration (default 3000ms)
 * - Proper cleanup on unmount (prevents memory leak)
 * - Clear previous timeout when showing new toast (prevents race)
 * - Manual hide capability
 * 
 * Benefits over inline implementation:
 * - Memory leak prevention (clearTimeout on unmount)
 * - Consistent behavior across pages
 * - DRY: ~15 lines of duplicate logic eliminated per page
 * 
 * @param {number} duration - Auto-hide delay in milliseconds (default: 3000)
 * @returns {{ toast, showToast, hideToast }}
 * 
 * Usage:
 * ```jsx
 * import { useToast } from '../hooks/useToast';
 * import ToastNotification from '../components/ui/ToastNotification';
 * 
 * function MyPage() {
 *   const { toast, showToast, hideToast } = useToast();
 * 
 *   const handleSuccess = () => {
 *     showToast('Operation successful!', 'success');
 *   };
 * 
 *   return (
 *     <div>
 *       <button onClick={handleSuccess}>Do Something</button>
 *       <ToastNotification {...toast} onClose={hideToast} />
 *     </div>
 *   );
 * }
 * ```
 */
export function useToast(duration = 3000) {
    const [toast, setToast] = useState(INITIAL_TOAST);
    const timeoutRef = useRef(null);

    // Cleanup timeout on unmount (prevents memory leak + setState on unmounted)
    useEffect(() => {
        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, []);

    /**
     * Show toast with message and type
     * @param {string} message - Text to display
     * @param {'success' | 'error'} type - Visual variant
     */
    const showToast = useCallback((message, type = 'success') => {
        // Clear previous timeout (prevents race condition if showing new toast quickly)
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
        
        setToast({ show: true, message, type });
        
        // Auto-hide after duration
        timeoutRef.current = setTimeout(() => {
            setToast(INITIAL_TOAST);
        }, duration);
    }, [duration]);

    /**
     * Manually hide toast (e.g., when user clicks close button)
     */
    const hideToast = useCallback(() => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
        setToast(INITIAL_TOAST);
    }, []);

    return { toast, showToast, hideToast };
}
