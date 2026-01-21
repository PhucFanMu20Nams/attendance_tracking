import { HiOutlineInbox } from 'react-icons/hi';

/**
 * EmptyState: Friendly "no data" message with icon.
 * Use for empty tables/lists for consistent UX.
 * 
 * Per memory rules (flowbite-react.md):
 * - Always show empty state
 * 
 * Props:
 *  - icon?: React component (defaults to HiOutlineInbox)
 *  - message: string (empty state message)
 */
export default function EmptyState({ icon: Icon = HiOutlineInbox, message }) {
    return (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <Icon className="h-12 w-12 mb-3" />
            <p className="text-sm">{message}</p>
        </div>
    );
}
