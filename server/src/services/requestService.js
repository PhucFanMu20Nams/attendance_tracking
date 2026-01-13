import mongoose from 'mongoose';
import Request from '../models/Request.js';
import User from '../models/User.js';
import Attendance from '../models/Attendance.js';
import { getDateKey } from '../utils/dateUtils.js';

/**
 * Create a new request for attendance adjustment.
 * Validates date format, ensures at least one time field, and checks time ordering.
 * 
 * @param {string} userId - User's ObjectId
 * @param {string} date - Date in "YYYY-MM-DD" format (GMT+7)
 * @param {Date|null} requestedCheckInAt - Requested check-in time (optional)
 * @param {Date|null} requestedCheckOutAt - Requested check-out time (optional)
 * @param {string} reason - Reason for the request
 * @returns {Promise<Object>} Created request
 */
export const createRequest = async (userId, date, requestedCheckInAt, requestedCheckOutAt, reason) => {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const error = new Error('Invalid date format. Expected YYYY-MM-DD');
    error.statusCode = 400;
    throw error;
  }

  if (!requestedCheckInAt && !requestedCheckOutAt) {
    const error = new Error('At least one of requestedCheckInAt or requestedCheckOutAt is required');
    error.statusCode = 400;
    throw error;
  }

  if (!reason || reason.trim().length === 0) {
    const error = new Error('Reason is required');
    error.statusCode = 400;
    throw error;
  }

  // Security: Limit reason length to prevent DoS (1000 chars is enough for a detailed explanation)
  const MAX_REASON_LENGTH = 1000;
  if (reason.length > MAX_REASON_LENGTH) {
    const error = new Error(`Reason must be ${MAX_REASON_LENGTH} characters or less`);
    error.statusCode = 400;
    throw error;
  }

  // If both times provided, check-out must be after check-in
  if (requestedCheckInAt && requestedCheckOutAt) {
    if (new Date(requestedCheckOutAt) <= new Date(requestedCheckInAt)) {
      const error = new Error('requestedCheckOutAt must be after requestedCheckInAt');
      error.statusCode = 400;
      throw error;
    }
  }

  // MVP: No overnight shifts - timestamps must be on the same date as request.date
  if (requestedCheckInAt) {
    const checkInDateKey = getDateKey(new Date(requestedCheckInAt));
    if (checkInDateKey !== date) {
      const error = new Error('requestedCheckInAt must be on the same date as request date (GMT+7)');
      error.statusCode = 400;
      throw error;
    }
  }

  if (requestedCheckOutAt) {
    const checkOutDateKey = getDateKey(new Date(requestedCheckOutAt));
    if (checkOutDateKey !== date) {
      const error = new Error('requestedCheckOutAt must be on the same date as request date (GMT+7)');
      error.statusCode = 400;
      throw error;
    }
  }

  // Business rule: If attendance doesn't exist for this date, checkInAt is required
  // (because Attendance.checkInAt is a required field)
  // Also validate partial requests against existing attendance data
  const existingAttendance = await Attendance.findOne({ userId, date });

  if (!requestedCheckInAt && !existingAttendance) {
    const error = new Error('Cannot create new attendance without check-in time. Please include requestedCheckInAt');
    error.statusCode = 400;
    throw error;
  }

  // Validate checkOut-only: must be > existing checkInAt
  if (requestedCheckOutAt && !requestedCheckInAt && existingAttendance) {
    const existingCheckIn = existingAttendance.checkInAt;
    if (existingCheckIn && new Date(requestedCheckOutAt) <= new Date(existingCheckIn)) {
      const error = new Error('requestedCheckOutAt must be after existing check-in time');
      error.statusCode = 400;
      throw error;
    }
  }

  // Validate checkIn-only: must be < existing checkOutAt (if exists)
  if (requestedCheckInAt && !requestedCheckOutAt && existingAttendance) {
    const existingCheckOut = existingAttendance.checkOutAt;
    if (existingCheckOut && new Date(requestedCheckInAt) >= new Date(existingCheckOut)) {
      const error = new Error('requestedCheckInAt must be before existing check-out time');
      error.statusCode = 400;
      throw error;
    }
  }

  // Prevent duplicate PENDING requests for the same date (Overlapping fix)
  const existingPendingRequest = await Request.findOne({
    userId,
    date,
    type: 'ADJUST_TIME',
    status: 'PENDING'
  }).select('_id');

  if (existingPendingRequest) {
    const error = new Error('You already have a pending request for this date. Please wait for approval or cancel the existing request.');
    error.statusCode = 409;
    throw error;
  }

  const request = await Request.create({
    userId,
    date,
    type: 'ADJUST_TIME',
    requestedCheckInAt,
    requestedCheckOutAt,
    reason: reason.trim(),
    status: 'PENDING'
  });

  return request;
};

/**
 * Get all requests for a specific user.
 * Returns sorted by date descending (most recent first).
 * 
 * @param {string} userId - User's ObjectId
 * @returns {Promise<Array>} Array of requests
 */
export const getMyRequests = async (userId) => {
  const requests = await Request.find({ userId })
    .populate('approvedBy', 'name employeeCode')
    .sort({ date: -1, createdAt: -1 });

  return requests;
};

/**
 * Get pending requests with RBAC scope enforcement.
 * MANAGER: Only requests from users in the same team
 * ADMIN: All pending requests company-wide
 * 
 * @param {Object} user - Current user (req.user)
 * @returns {Promise<Array>} Array of pending requests
 */
export const getPendingRequests = async (user) => {
  let query = { status: 'PENDING' };

  // RBAC: Manager only sees team members' requests
  if (user.role === 'MANAGER') {
    if (!user.teamId) {
      const error = new Error('Manager must be assigned to a team');
      error.statusCode = 403;
      throw error;
    }

    // Find all users in the same team
    const teamMembers = await User.find({ teamId: user.teamId }).select('_id');
    const teamMemberIds = teamMembers.map(member => member._id);

    query.userId = { $in: teamMemberIds };
  }

  // ADMIN sees all pending requests (no additional filter)

  const requests = await Request.find(query)
    .populate('userId', 'name employeeCode email teamId')
    .sort({ createdAt: 1 });

  return requests;
};

/**
 * Approve a request and update/create attendance record.
 * Uses atomic findOneAndUpdate to prevent race conditions.
 * RBAC: MANAGER can only approve requests from users in the same team.
 *       ADMIN can approve any request across the company.
 * 
 * @param {string} requestId - Request's ObjectId
 * @param {Object} approver - Approver user object (req.user)
 * @returns {Promise<Object>} Updated request
 */
export const approveRequest = async (requestId, approver) => {
  if (!mongoose.Types.ObjectId.isValid(requestId)) {
    const error = new Error('Invalid request ID');
    error.statusCode = 400;
    throw error;
  }

  // First, fetch the request to validate RBAC and business rules
  const existingRequest = await Request.findById(requestId)
    .populate('userId', 'teamId');

  if (!existingRequest) {
    const error = new Error('Request not found');
    error.statusCode = 404;
    throw error;
  }

  // RBAC check must happen BEFORE the atomic update
  if (approver.role === 'MANAGER') {
    if (!approver.teamId) {
      const error = new Error('Manager must be assigned to a team');
      error.statusCode = 403;
      throw error;
    }

    if (!existingRequest.userId.teamId) {
      const error = new Error('Request user is not assigned to any team');
      error.statusCode = 403;
      throw error;
    }

    if (!approver.teamId.equals(existingRequest.userId.teamId)) {
      const error = new Error('You can only approve requests from your team');
      error.statusCode = 403;
      throw error;
    }
  }

  // MVP: Validate timestamps are on request.date (defense-in-depth)
  if (existingRequest.requestedCheckInAt) {
    const checkInDateKey = getDateKey(new Date(existingRequest.requestedCheckInAt));
    if (checkInDateKey !== existingRequest.date) {
      const error = new Error('requestedCheckInAt must be on the same date as request date (GMT+7)');
      error.statusCode = 400;
      throw error;
    }
  }

  if (existingRequest.requestedCheckOutAt) {
    const checkOutDateKey = getDateKey(new Date(existingRequest.requestedCheckOutAt));
    if (checkOutDateKey !== existingRequest.date) {
      const error = new Error('requestedCheckOutAt must be on the same date as request date (GMT+7)');
      error.statusCode = 400;
      throw error;
    }
  }

  // Atomic update: Only succeeds if status is still PENDING (prevents race condition)
  const updatedRequest = await Request.findOneAndUpdate(
    {
      _id: requestId,
      status: 'PENDING'  // Condition: must be PENDING to update
    },
    {
      $set: {
        status: 'APPROVED',
        approvedBy: approver._id,
        approvedAt: new Date()
      }
    },
    { new: true }
  ).populate('userId', 'teamId');

  // If no document was updated, it means status was not PENDING (race condition lost)
  if (!updatedRequest) {
    // Re-fetch to get current status for better error message
    const currentRequest = await Request.findById(requestId);
    const currentStatus = currentRequest ? currentRequest.status.toLowerCase() : 'unknown';
    const error = new Error(`Request already ${currentStatus}`);
    error.statusCode = 409;
    throw error;
  }

  // Update or create attendance for the requested date
  await updateAttendanceFromRequest(updatedRequest);

  return updatedRequest;
};

/**
 * Reject a request.
 * Uses atomic findOneAndUpdate to prevent race conditions.
 * RBAC: MANAGER can only reject requests from users in the same team.
 *       ADMIN can reject any request across the company.
 * 
 * @param {string} requestId - Request's ObjectId
 * @param {Object} approver - Approver user object (req.user)
 * @returns {Promise<Object>} Updated request
 */
export const rejectRequest = async (requestId, approver) => {
  if (!mongoose.Types.ObjectId.isValid(requestId)) {
    const error = new Error('Invalid request ID');
    error.statusCode = 400;
    throw error;
  }

  // First, fetch the request to validate RBAC
  const existingRequest = await Request.findById(requestId)
    .populate('userId', 'teamId');

  if (!existingRequest) {
    const error = new Error('Request not found');
    error.statusCode = 404;
    throw error;
  }

  // RBAC check must happen BEFORE the atomic update
  if (approver.role === 'MANAGER') {
    if (!approver.teamId) {
      const error = new Error('Manager must be assigned to a team');
      error.statusCode = 403;
      throw error;
    }

    if (!existingRequest.userId.teamId) {
      const error = new Error('Request user is not assigned to any team');
      error.statusCode = 403;
      throw error;
    }

    if (!approver.teamId.equals(existingRequest.userId.teamId)) {
      const error = new Error('You can only reject requests from your team');
      error.statusCode = 403;
      throw error;
    }
  }

  // Atomic update: Only succeeds if status is still PENDING (prevents race condition)
  const updatedRequest = await Request.findOneAndUpdate(
    {
      _id: requestId,
      status: 'PENDING'  // Condition: must be PENDING to update
    },
    {
      $set: {
        status: 'REJECTED',
        approvedBy: approver._id,
        approvedAt: new Date()
      }
    },
    { new: true }
  );

  // If no document was updated, it means status was not PENDING (race condition lost)
  if (!updatedRequest) {
    // Re-fetch to get current status for better error message
    const currentRequest = await Request.findById(requestId);
    const currentStatus = currentRequest ? currentRequest.status.toLowerCase() : 'unknown';
    const error = new Error(`Request already ${currentStatus}`);
    error.statusCode = 409;
    throw error;
  }

  return updatedRequest;
};

/**
 * Update or create attendance record based on approved request.
 * Uses findOneAndUpdate with upsert to handle both create and update atomically.
 * Only updates the time fields that were requested.
 */
async function updateAttendanceFromRequest(request) {
  const { userId, date, requestedCheckInAt, requestedCheckOutAt } = request;

  const updateFields = {};

  if (requestedCheckInAt) {
    updateFields.checkInAt = requestedCheckInAt;
  }

  if (requestedCheckOutAt) {
    updateFields.checkOutAt = requestedCheckOutAt;
  }

  // Defensive check: cannot create new attendance without checkInAt
  // (validation in createRequest should prevent this, but guard here for safety)
  const existing = await Attendance.findOne({ userId, date }).select('_id');

  if (!existing && !requestedCheckInAt) {
    const error = new Error('Cannot create attendance without check-in time');
    error.statusCode = 400;
    throw error;
  }

  // Atomic upsert: create if not exists, update if exists
  await Attendance.findOneAndUpdate(
    { userId, date },
    {
      $set: updateFields,
      $setOnInsert: {
        userId,
        date
      }
    },
    { upsert: true, new: true }
  );
}
