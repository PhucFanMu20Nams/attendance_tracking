import { useState, useEffect, useCallback, useRef } from 'react';
import { isAbortError } from '../utils/errorHelpers';

/**
 * Reusable pagination hook with debounced search and race condition protection.
 * 
 * Features:
 * - Debounced search with configurable delay
 * - Race condition protection (stale response ignored)
 * - AbortController for request cancellation
 * - Stable function references (no re-fetch on inline functions)
 * - Page clamping (minimum 1, auto-clamp when totalPages decreases)
 * - Search trimming (no whitespace-only queries)
 * 
 * @param {Object} options
 * @param {Function} options.fetchFn - Async function (params, signal?) => { items, pagination }
 *   - params: { page, limit, search?, ...extraParams }
 *   - signal: AbortSignal for cancellation (optional)
 *   - returns: { items: Array, pagination: { total, totalPages } }
 * @param {number} [options.defaultLimit=20] - Items per page (matches API_SPEC.md)
 * @param {number} [options.debounceMs=500] - Search debounce delay
 * @param {boolean} [options.enabled=true] - Enable/disable fetching
 * @param {Object} [options.extraParams={}] - Additional params to pass to fetchFn
 *   ⚠️ IMPORTANT: Must be a plain JSON-serializable object (no circular refs, 
 *   no Date/Function/undefined). Keep it small to avoid performance issues.
 *   Reserved keys (page, limit, search) will be ignored.
 * @param {boolean} [options.resetOnDisable=false] - Reset state when enabled becomes false
 * 
 * @returns {Object}
 * @property {Array} items - Current page items
 * @property {Object} pagination - { page, limit, total, totalPages }
 * @property {boolean} loading - Loading state
 * @property {string} error - Error message
 * @property {string} search - Current search query (raw input)
 * @property {string} debouncedSearch - Debounced search value (for display)
 * @property {Function} setSearch - Update search (triggers debounced fetch)
 * @property {Function} setPage - Navigate to page (clamped to >= 1)
 * @property {Function} refetch - Manual refetch
 * @property {Function} reset - Reset to initial state
 * 
 * @example
 * // In AdminMembersPage.jsx - fetchFn is stable via useCallback
 * const fetchUsers = useCallback(async (params, signal) => {
 *   const res = await getAdminUsers(params, { signal });
 *   return { items: res.data.items, pagination: res.data.pagination };
 * }, []);
 * 
 * const { items, pagination, loading, setSearch, setPage } = usePagination({
 *   fetchFn: fetchUsers,
 *   enabled: viewMode === 'all'
 * });
 * 
 * // OR inline (hook handles stability internally):
 * const { items } = usePagination({
 *   fetchFn: async (params) => {
 *     const res = await getAdminUsers(params);
 *     return { items: res.data.items, pagination: res.data.pagination };
 *   },
 *   enabled: viewMode === 'all'
 * });
 */
export function usePagination({
    fetchFn,
    defaultLimit = 20,
    debounceMs = 500,
    enabled = true,
    extraParams = {},
    resetOnDisable = false
}) {
    // ═══════════════════════════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════════════════════════

    // Data state
    const [items, setItems] = useState([]);
    const [pagination, setPagination] = useState({
        page: 1,
        limit: defaultLimit,
        total: 0,
        totalPages: 0
    });

    // Search state (raw input + debounced value)
    const [search, setSearchInput] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');

    // Loading/Error states
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // ═══════════════════════════════════════════════════════════════════════
    // REFS FOR STABLE DEPENDENCIES
    // FIX #3: fetchFn stored in ref to prevent re-fetch on inline functions
    // FIX #1: extraParams serialized for stable comparison
    // ═══════════════════════════════════════════════════════════════════════

    const fetchFnRef = useRef(fetchFn);
    const extraParamsRef = useRef(extraParams);

    // FIX D: Wrap JSON.stringify in try-catch for safety
    let extraParamsKey = '{}';
    try {
        extraParamsKey = JSON.stringify(extraParams);
    } catch {
        // Circular ref or non-serializable - use empty object key
        console.warn('usePagination: extraParams is not JSON-serializable, using fallback');
    }

    // Update refs when values change
    useEffect(() => {
        fetchFnRef.current = fetchFn;
    }, [fetchFn]);

    useEffect(() => {
        extraParamsRef.current = extraParams;
    }, [extraParams]);

    // Race condition protection
    const requestIdRef = useRef(0);
    const isMounted = useRef(true);

    // FIX #5: AbortController for request cancellation
    const abortControllerRef = useRef(null);

    // Track mount state for cleanup
    useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false;
            // Abort any pending request on unmount
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
    }, []);

    // ═══════════════════════════════════════════════════════════════════════
    // FIX #4 + FIX B: Reset state when enabled becomes false (optional)
    // Now includes setLoading(false) and abort
    // ═══════════════════════════════════════════════════════════════════════

    useEffect(() => {
        if (!enabled && resetOnDisable) {
            // FIX B: Abort any pending request
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
            setItems([]);
            setPagination({ page: 1, limit: defaultLimit, total: 0, totalPages: 0 });
            setSearchInput('');
            setDebouncedSearch('');
            setError('');
            setLoading(false);  // FIX B: Clear loading state
        }
    }, [enabled, resetOnDisable, defaultLimit]);

    // ═══════════════════════════════════════════════════════════════════════
    // DEBOUNCE SEARCH
    // FIX #2: Only reset page if page !== 1 to avoid double fetch
    // FIX #7: Trim search before setting debounced value
    // ═══════════════════════════════════════════════════════════════════════

    useEffect(() => {
        const timer = setTimeout(() => {
            const trimmedSearch = search.trim();

            // Only update if trimmed value actually changed
            if (trimmedSearch !== debouncedSearch) {
                setDebouncedSearch(trimmedSearch);
                // FIX #2: Only reset page if not already on page 1
                setPagination(prev =>
                    prev.page === 1 ? prev : { ...prev, page: 1 }
                );
            }
        }, debounceMs);
        return () => clearTimeout(timer);
    }, [search, debounceMs, debouncedSearch]);

    // ═══════════════════════════════════════════════════════════════════════
    // CORE FETCH FUNCTION
    // ═══════════════════════════════════════════════════════════════════════

    const fetchData = useCallback(async () => {
        if (!enabled) return;

        const currentRequestId = ++requestIdRef.current;

        // FIX #5: Abort previous request before starting new one
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        abortControllerRef.current = new AbortController();
        const signal = abortControllerRef.current.signal;

        setLoading(true);
        setError('');

        try {
            // FIX A: Spread extraParams FIRST, then page/limit to prevent override
            // Reserved keys (page, limit, search) from extraParams will be overwritten
            const currentExtraParams = { ...extraParamsRef.current };
            // Remove reserved keys from extraParams to be safe
            delete currentExtraParams.page;
            delete currentExtraParams.limit;
            delete currentExtraParams.search;

            const params = {
                ...currentExtraParams,
                page: pagination.page,
                limit: pagination.limit,
            };

            // FIX #7: Only include search if not empty after trim
            if (debouncedSearch) {
                params.search = debouncedSearch;
            }

            // Call fetchFn with signal for cancellation support
            const result = await fetchFnRef.current(params, signal);

            // Ignore stale responses (race condition protection)
            if (!isMounted.current || currentRequestId !== requestIdRef.current) {
                return;
            }

            const newTotalPages = result.pagination?.totalPages || 0;

            setItems(result.items || []);

            // FIX E: Auto-clamp page if it exceeds new totalPages
            setPagination(prev => {
                const newTotal = result.pagination?.total || 0;
                let newPage = prev.page;

                // If current page > new totalPages, reset to last valid page (or 1)
                if (newTotalPages > 0 && prev.page > newTotalPages) {
                    newPage = newTotalPages;
                } else if (newTotalPages === 0 && prev.page !== 1) {
                    newPage = 1;
                }

                return {
                    ...prev,
                    total: newTotal,
                    totalPages: newTotalPages,
                    page: newPage
                };
            });
        } catch (err) {
            // FIX C: Use helper for abort detection
            if (isAbortError(err)) {
                return;
            }
            // Ignore stale errors
            if (!isMounted.current || currentRequestId !== requestIdRef.current) {
                return;
            }

            setError(err.response?.data?.message || 'Failed to load data');
        } finally {
            // Check if mounted before setState
            if (isMounted.current && currentRequestId === requestIdRef.current) {
                setLoading(false);
            }
        }
        // Dependencies: Only things that should trigger re-fetch
        // FIX #1 & #3: fetchFn and extraParams are now refs, so not in deps
    }, [enabled, pagination.page, pagination.limit, debouncedSearch, extraParamsKey]);

    // ═══════════════════════════════════════════════════════════════════════
    // AUTO-FETCH EFFECT
    // ═══════════════════════════════════════════════════════════════════════

    useEffect(() => {
        if (enabled) {
            fetchData();
        }
    }, [enabled, fetchData]);

    // ═══════════════════════════════════════════════════════════════════════
    // HANDLERS
    // FIX #6: Clamp page to minimum 1
    // ═══════════════════════════════════════════════════════════════════════

    const setPage = useCallback((newPage) => {
        const clampedPage = Math.max(1, Number(newPage) || 1);
        setPagination(prev => ({ ...prev, page: clampedPage }));
    }, []);

    const setSearch = useCallback((query) => {
        // Accept any input, trimming happens in debounce
        setSearchInput(query ?? '');
    }, []);

    // FIX B: reset() now includes setLoading(false)
    const reset = useCallback(() => {
        // Abort any pending request
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        setItems([]);
        setPagination({ page: 1, limit: defaultLimit, total: 0, totalPages: 0 });
        setSearchInput('');
        setDebouncedSearch('');
        setError('');
        setLoading(false);  // FIX B: Clear loading state
    }, [defaultLimit]);

    // ═══════════════════════════════════════════════════════════════════════
    // RETURN
    // ═══════════════════════════════════════════════════════════════════════

    return {
        items,
        pagination,
        loading,
        error,
        search,
        debouncedSearch,
        setSearch,
        setPage,
        refetch: fetchData,
        reset
    };
}

export default usePagination;
