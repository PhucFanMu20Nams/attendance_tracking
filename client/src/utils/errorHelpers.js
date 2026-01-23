/**
 * Error Helper Utilities
 * 
 * Shared utilities for error handling across the application.
 * @see usePagination.js, useMembersFetch.js
 */

/**
 * Check if an error is from an aborted/cancelled request.
 * Covers all common patterns from AbortController, Axios, and fetch.
 * 
 * @param {Error|Object} err - The error to check
 * @returns {boolean} True if the error is from an abort/cancel
 * 
 * @example
 * try {
 *   await fetchData();
 * } catch (err) {
 *   if (isAbortError(err)) return; // Silently ignore
 *   setError(err.message);
 * }
 */
export function isAbortError(err) {
    if (!err) return false;

    // Standard AbortController (fetch, modern axios)
    if (err.name === 'AbortError') return true;

    // Axios v1+ patterns
    if (err.name === 'CanceledError') return true;
    if (err.code === 'ERR_CANCELED') return true;

    // P3 FIX: Loosen message check to handle variations (canceled, Canceled, Request canceled, etc.)
    if (typeof err.message === 'string' && err.message.toLowerCase().includes('cancel')) return true;

    // Axios cancel token (legacy pattern)
    // axios.isCancel(err) internally checks err.__CANCEL__ === true
    if (err.__CANCEL__ === true) return true;

    return false;
}

// P1 FIX: Named export only, no default export to avoid import confusion
