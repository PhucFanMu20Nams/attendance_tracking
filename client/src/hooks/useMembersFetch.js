import { useState, useEffect, useCallback, useRef } from 'react';
import { getTodayAttendance } from '../api/memberApi';
import { isAbortError } from '../utils/errorHelpers';

/**
 * Fetch members for Today Activity mode with scope/team filtering.
 * Extracted from AdminMembersPage.jsx lines 122-164.
 * 
 * Features:
 * - Debounced team ID (300ms, same as original)
 * - Race condition protection (stale response ignored)
 * - AbortController for request cancellation
 * - Force refetch option to bypass debounce
 * - Optional reset on disable (parity with usePagination)
 * 
 * @param {Object} options
 * @param {boolean} options.enabled - Enable fetching (typically viewMode === 'today')
 * @param {'company' | 'team'} options.scope - Filter scope
 * @param {string} options.teamId - Team ID (required when scope='team')
 * @param {boolean} [options.resetOnDisable=false] - Reset state when enabled becomes false
 * 
 * @returns {Object}
 * @property {Array} members - List of { user, attendance, computed }
 * @property {string} todayDate - Today's date string (YYYY-MM-DD)
 * @property {boolean} loading - Loading state
 * @property {string} error - Error message
 * @property {string} debouncedTeamId - Current debounced team ID
 * @property {Function} refetch - Manual refetch (uses debounced values)
 * @property {Function} forceRefetch - Force refetch with current teamId (bypasses debounce)
 * 
 * @example
 * const { members, todayDate, loading, error, refetch, forceRefetch } = useMembersFetch({
 *   enabled: viewMode === 'today',
 *   scope,
 *   teamId,
 *   resetOnDisable: false // optional, default false
 * });
 */
export function useMembersFetch({ enabled, scope, teamId, resetOnDisable = false }) {
    // ═══════════════════════════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════════════════════════

    const [members, setMembers] = useState([]);
    const [todayDate, setTodayDate] = useState('');
    // P1 FIX: Default loading to false (align with usePagination)
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Debounced team ID (300ms, same as original)
    const [debouncedTeamId, setDebouncedTeamId] = useState(teamId);

    // ═══════════════════════════════════════════════════════════════════════
    // REFS
    // ═══════════════════════════════════════════════════════════════════════

    // Race condition protection
    const requestIdRef = useRef(0);
    const isMounted = useRef(true);

    // P2 FIX: AbortController for request cancellation
    const abortControllerRef = useRef(null);

    // P3 FIX: Store current teamId for force refetch
    const teamIdRef = useRef(teamId);

    // Update teamId ref when prop changes
    useEffect(() => {
        teamIdRef.current = teamId;
    }, [teamId]);

    // Track mount state + cleanup abort on unmount
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
    // P2 FIX: Reset state when disabled (with resetOnDisable option)
    // P3 FIX: Sync debounce immediately when enabled turns true
    // ═══════════════════════════════════════════════════════════════════════

    useEffect(() => {
        if (!enabled) {
            // Abort any pending request when disabled
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
            setLoading(false);
            setError('');

            // P2 FIX: Optional reset data on disable (parity with usePagination)
            if (resetOnDisable) {
                setMembers([]);
                setTodayDate('');
                setDebouncedTeamId('');
            }
        } else {
            // P3 FIX: Sync debounce immediately when enabled turns true
            // This prevents stale debounced values from being used on first fetch
            // FIX A: Use functional update to prevent double fetch
            setDebouncedTeamId(prev => (prev === teamId ? prev : teamId));
        }
    }, [enabled, resetOnDisable, teamId]);

    // ═══════════════════════════════════════════════════════════════════════
    // DEBOUNCE TEAM ID
    // ═══════════════════════════════════════════════════════════════════════

    useEffect(() => {
        const timer = setTimeout(() => {
            // FIX A: Use functional update to prevent unnecessary state changes
            setDebouncedTeamId(prev => (prev === teamId ? prev : teamId));
        }, 300);
        return () => clearTimeout(timer);
    }, [teamId]);

    // ═══════════════════════════════════════════════════════════════════════
    // CORE FETCH FUNCTION
    // P3 FIX: Accept optional overrideTeamId for force refetch
    // ═══════════════════════════════════════════════════════════════════════

    const fetchMembersInternal = useCallback(async (overrideTeamId) => {
        if (!enabled) return;

        const currentRequestId = ++requestIdRef.current;

        // Use overrideTeamId if provided (for force refetch), else use debounced
        const effectiveTeamId = overrideTeamId !== undefined ? overrideTeamId : debouncedTeamId;

        // If scope is 'team' but no team selected, clear and return
        if (scope === 'team' && !effectiveTeamId) {
            setMembers([]);
            setTodayDate('');
            setError('');
            setLoading(false);
            return;
        }

        // P2 FIX: Abort previous request before starting new one
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        abortControllerRef.current = new AbortController();
        const signal = abortControllerRef.current.signal;

        setLoading(true);
        setError('');

        try {
            const params = { scope };
            if (scope === 'team' && effectiveTeamId) {
                params.teamId = effectiveTeamId;
            }

            // P2 FIX: Pass signal for abort support
            const res = await getTodayAttendance(params, { signal });

            // Ignore stale response
            if (!isMounted.current || currentRequestId !== requestIdRef.current) {
                return;
            }

            setTodayDate(res.data.date || '');
            setMembers(res.data.items || []);
        } catch (err) {
            // P1 FIX: Use shared isAbortError helper
            if (isAbortError(err)) {
                return;
            }
            if (!isMounted.current || currentRequestId !== requestIdRef.current) {
                return;
            }
            setError(err.response?.data?.message || 'Failed to load members');
        } finally {
            if (isMounted.current && currentRequestId === requestIdRef.current) {
                setLoading(false);
            }
        }
    }, [enabled, scope, debouncedTeamId]);

    // ═══════════════════════════════════════════════════════════════════════
    // AUTO-FETCH EFFECT
    // ═══════════════════════════════════════════════════════════════════════

    useEffect(() => {
        if (enabled) {
            fetchMembersInternal();
        }
    }, [enabled, fetchMembersInternal]);

    // ═══════════════════════════════════════════════════════════════════════
    // P3 FIX: Force refetch (bypass debounce)
    // ═══════════════════════════════════════════════════════════════════════

    const forceRefetch = useCallback(() => {
        // Use current teamId directly, bypassing debounce
        fetchMembersInternal(teamIdRef.current);
    }, [fetchMembersInternal]);

    // Standard refetch (uses debounced values)
    const refetch = useCallback(() => {
        fetchMembersInternal();
    }, [fetchMembersInternal]);

    return {
        members,
        todayDate,
        loading,
        error,
        debouncedTeamId,
        refetch,
        forceRefetch
    };
}

export default useMembersFetch;
