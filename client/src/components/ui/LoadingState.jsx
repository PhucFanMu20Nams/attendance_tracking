import { Spinner } from 'flowbite-react';

/**
 * LoadingState: Centered spinner with optional message.
 * Use instead of inline Spinner for consistent padding/UX.
 * 
 * Per memory rules (flowbite-react.md):
 * - Always show loading state (Spinner)
 * 
 * Props:
 *  - message?: string (optional loading message, default: "Đang tải...")
 */
export default function LoadingState({ message = 'Đang tải...' }) {
    return (
        <div className="flex flex-col items-center justify-center py-16 text-gray-500">
            <Spinner size="lg" className="mb-3" />
            <p className="text-sm">{message}</p>
        </div>
    );
}
