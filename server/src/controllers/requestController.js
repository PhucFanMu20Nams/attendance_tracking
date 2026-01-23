import * as requestService from '../services/requestService.js';
import { parsePaginationParams, clampPage, buildPaginatedResponse } from '../utils/pagination.js';

/**
 * POST /api/requests
 * Create a new attendance adjustment request
 */
export const createRequest = async (req, res) => {
  try {
    const userId = req.user._id;
    const { date, requestedCheckInAt, requestedCheckOutAt, reason } = req.body;

    if (!date || typeof date !== 'string') {
      return res.status(400).json({ message: 'Date is required' });
    }

    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      return res.status(400).json({ message: 'Reason is required' });
    }

    const request = await requestService.createRequest(
      userId,
      date,
      requestedCheckInAt || null,
      requestedCheckOutAt || null,
      reason
    );

    return res.status(201).json({
      request
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      message: error.message || 'Failed to create request'
    });
  }
};

/**
 * GET /api/requests/me
 * Get all requests for the current user with pagination
 */
export const getMyRequests = async (req, res) => {
  try {
    const userId = req.user._id;

    // Step 1: Parse pagination params (no skip yet - skip depends on total)
    const { page, limit } = parsePaginationParams(req.query);

    // Optional status filter from query
    const status = req.query.status || null;

    // Step 2: Get total count ONLY (optimized - 1 DB call instead of querying items)
    const total = await requestService.countMyRequests(userId, { status });

    // Step 3: Clamp page to valid range and calculate skip
    const { page: clampedPage, skip } = clampPage(page, total, limit);

    // Step 4: Query items with CLAMPED skip (1 DB call - no redundant count)
    const items = await requestService.getMyRequests(userId, {
      skip,
      limit,
      status
    });

    // Step 5: Build response with clamped page
    return res.status(200).json(
      buildPaginatedResponse(items, total, clampedPage, limit)
    );
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      message: error.message || 'Failed to fetch requests'
    });
  }
};

/**
 * GET /api/requests/pending
 * Get pending requests (Manager: team only, Admin: company-wide) with pagination
 */
export const getPendingRequests = async (req, res) => {
  try {
    const user = req.user;

    // Step 1: Parse pagination params
    const { page, limit } = parsePaginationParams(req.query);

    // Step 2: Get total count (1 DB call)
    const total = await requestService.countPendingRequests(user);

    // Step 3: Clamp page to valid range and calculate skip
    const { page: clampedPage, skip } = clampPage(page, total, limit);

    // Step 4: Query items with CLAMPED skip (1 DB call)
    const items = await requestService.getPendingRequests(user, {
      skip,
      limit
    });

    // Step 5: Build paginated response
    return res.status(200).json(
      buildPaginatedResponse(items, total, clampedPage, limit)
    );
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      message: error.message || 'Failed to fetch pending requests'
    });
  }
};

/**
 * POST /api/requests/:id/approve
 * Approve a request and update attendance
 */
export const approveRequest = async (req, res) => {
  try {
    const requestId = req.params.id;
    const approver = req.user;

    if (!requestId) {
      return res.status(400).json({ message: 'Request ID is required' });
    }

    const request = await requestService.approveRequest(requestId, approver);

    return res.status(200).json({
      request
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      message: error.message || 'Failed to approve request'
    });
  }
};

/**
 * POST /api/requests/:id/reject
 * Reject a request
 */
export const rejectRequest = async (req, res) => {
  try {
    const requestId = req.params.id;
    const approver = req.user;

    if (!requestId) {
      return res.status(400).json({ message: 'Request ID is required' });
    }

    const request = await requestService.rejectRequest(requestId, approver);

    return res.status(200).json({
      request
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      message: error.message || 'Failed to reject request'
    });
  }
};
