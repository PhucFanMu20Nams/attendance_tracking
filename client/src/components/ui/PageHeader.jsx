/**
 * PageHeader: Consistent page title + actions layout.
 * 
 * Per memory rules (flowbite-react.md):
 * - Tailwind utility classes only
 * - Keep components small and reusable
 * 
 * Props:
 *  - title: string (page title, required)
 *  - subtitle?: string (optional subtitle/date info)
 *  - children?: ReactNode (action buttons, filters, selectors)
 */
export default function PageHeader({ title, subtitle, children }) {
    return (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
                {subtitle && (
                    <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
                )}
            </div>
            {children && (
                <div className="flex flex-wrap items-center gap-3">
                    {children}
                </div>
            )}
        </div>
    );
}
