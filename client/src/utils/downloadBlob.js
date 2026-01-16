/**
 * Download a blob response as a file.
 * Used for secure file downloads where token is sent via Authorization header
 * instead of URL query parameter (OWASP A09 compliance).
 *
 * @param {Blob} blob - The blob data to download
 * @param {string} filename - Suggested filename for download (default: 'download.xlsx')
 */
export function downloadBlob(blob, filename = 'download.xlsx') {
    // Guard: avoid crash if blob is null/undefined
    if (!blob) return;

    // Guard: ensure filename is valid
    const safeName = filename?.trim() || 'download.xlsx';
    const url = window.URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = safeName;
    link.rel = 'noopener noreferrer'; // Future-proof: prevents tabnabbing & referrer leak

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Cleanup: delay revoke to allow download to start (Safari/iOS edge-case)
    setTimeout(() => window.URL.revokeObjectURL(url), 0);
}
