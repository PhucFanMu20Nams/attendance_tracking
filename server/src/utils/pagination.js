/**
 * Reusable pagination utilities for API endpoints.
 * 
 * Correct usage to prevent page/items mismatch:
 *   const { page, limit } = parsePaginationParams(req.query);
 *   const total = await Model.countDocuments(filter);
 *   const { page: clampedPage, skip } = clampPage(page, total, limit);
 *   const items = await Model.find(filter).skip(skip).limit(limit);
 *   res.json(buildPaginatedResponse(items, total, clampedPage, limit));
 */

/**
 * Parse and validate pagination params from query string.
 * Returns { page, limit } WITHOUT calculating skip (skip depends on total).
 * 
 * @param {Object} query - Express req.query
 * @param {number} defaultLimit - Default items per page (20)
 * @param {number} maxLimit - Maximum allowed limit (100)
 * @returns {Object} { page, limit }
 */
export function parsePaginationParams(query, defaultLimit = 20, maxLimit = 100) {
    // Parse page with radix 10 to avoid hex interpretation
    const pageRaw = Number.parseInt(query?.page, 10);
    const limitRaw = Number.parseInt(query?.limit, 10);

    // Validate and clamp page (minimum 1)
    const page = Number.isFinite(pageRaw) ? Math.max(1, pageRaw) : 1;

    // Validate and clamp limit (minimum 1, maximum maxLimit)
    let limit = Number.isFinite(limitRaw) ? limitRaw : defaultLimit;
    limit = Math.min(Math.max(1, limit), maxLimit);

    return { page, limit };
}

/**
 * Clamp page to valid range based on total items.
 * Must be called AFTER knowing total to calculate correct skip.
 * 
 * @param {number} page - Requested page number (from parsePaginationParams)
 * @param {number} total - Total count of matching items
 * @param {number} limit - Items per page
 * @returns {Object} { page: clampedPage, totalPages, skip }
 */
export function clampPage(page, total, limit) {
    // Guard against division by zero
    const safeLimit = Math.max(1, limit || 1);

    // Calculate total pages (0 when no items)
    const totalPages = total === 0 ? 0 : Math.ceil(total / safeLimit);

    // Clamp page to valid range [1, totalPages]
    // If no items, default to page 1 (empty state)
    const clampedPage = totalPages === 0 ? 1 : Math.min(Math.max(1, page), totalPages);

    // Calculate skip based on CLAMPED page (prevents out-of-bounds query)
    const skip = (clampedPage - 1) * safeLimit;

    return { page: clampedPage, totalPages, skip };
}

/**
 * Build standardized pagination response.
 * Expects page to ALREADY be clamped via clampPage.
 * 
 * @param {Array} items - Data items for current page
 * @param {number} total - Total count of all matching items
 * @param {number} page - Current page number (already clamped)
 * @param {number} limit - Items per page
 * @returns {Object} { items, pagination }
 */
export function buildPaginatedResponse(items, total, page, limit) {
    // Guard against division by zero
    const safeLimit = Math.max(1, limit || 1);

    // Calculate total pages (should match clampPage result)
    const totalPages = total === 0 ? 0 : Math.ceil(total / safeLimit);

    return {
        items,
        pagination: {
            page,
            limit: safeLimit,
            total,
            totalPages
        }
    };
}
