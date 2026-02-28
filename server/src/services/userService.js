import User from '../models/User.js';
import Attendance from '../models/Attendance.js';
import Request from '../models/Request.js';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';

/**
 * Create a new user (Admin workflow).
 *
 * @param {Object} data - { employeeCode, name, email, username, password, role, teamId, startDate, isActive }
 * @returns {Promise<Object>} { user: sanitized }
 */
export const createUser = async (data) => {
  const { employeeCode, name, email, username, password, role, teamId, startDate, isActive } = data;

  // ============================================
  // VALIDATION: Required fields (with type check - consistent with resetPassword)
  // ============================================
  if (!employeeCode || typeof employeeCode !== 'string' || !employeeCode.trim()) {
    const error = new Error('Employee code is required');
    error.statusCode = 400;
    throw error;
  }
  if (!name || typeof name !== 'string' || !name.trim()) {
    const error = new Error('Name is required');
    error.statusCode = 400;
    throw error;
  }
  if (!email || typeof email !== 'string' || !email.trim()) {
    const error = new Error('Email is required');
    error.statusCode = 400;
    throw error;
  }
  if (!password || typeof password !== 'string') {
    const error = new Error('Password is required');
    error.statusCode = 400;
    throw error;
  }
  if (password.length < 8) {
    const error = new Error('Password must be at least 8 characters');
    error.statusCode = 400;
    throw error;
  }
  if (!role) {
    const error = new Error('Role is required');
    error.statusCode = 400;
    throw error;
  }
  if (!['ADMIN', 'MANAGER', 'EMPLOYEE'].includes(role)) {
    const error = new Error('Invalid role. Must be ADMIN, MANAGER, or EMPLOYEE');
    error.statusCode = 400;
    throw error;
  }

  // ============================================
  // VALIDATION: Optional fields
  // ============================================
  // Validate teamId format if provided
  if (teamId && !mongoose.Types.ObjectId.isValid(teamId)) {
    const error = new Error('Invalid teamId format');
    error.statusCode = 400;
    throw error;
  }

  // Validate startDate if provided (P1 fix: reject null to prevent 1970 epoch bug)
  let parsedStartDate;
  if (startDate !== undefined) {
    if (startDate === null) {
      const error = new Error('startDate cannot be null');
      error.statusCode = 400;
      throw error;
    }
    parsedStartDate = new Date(startDate);
    if (Number.isNaN(parsedStartDate.getTime())) {
      const error = new Error('Invalid startDate');
      error.statusCode = 400;
      throw error;
    }
  }

  // Validate isActive if provided (must be boolean)
  let isActiveNorm = true;
  if (isActive !== undefined) {
    if (typeof isActive !== 'boolean') {
      const error = new Error('isActive must be boolean');
      error.statusCode = 400;
      throw error;
    }
    isActiveNorm = isActive;
  }

  // Normalize username (empty string after trim → undefined to avoid sparse index issue)
  const usernameTrim = typeof username === 'string' ? username.trim() : undefined;
  const usernameNorm = usernameTrim || undefined;

  // ============================================
  // PASSWORD HASHING (same pattern as authService.js)
  // ============================================
  const passwordHash = await bcrypt.hash(password, 10);

  // ============================================
  // CREATE USER
  // ============================================
  const user = await User.create({
    employeeCode: employeeCode.trim(),
    name: name.trim(),
    email: email.trim().toLowerCase(),
    username: usernameNorm,
    passwordHash,
    role,
    teamId: teamId || undefined,
    startDate: parsedStartDate,
    isActive: isActiveNorm
  });

  // ============================================
  // RESPONSE: Sanitized (no passwordHash, __v)
  // Per API_SPEC.md security rules
  // ============================================
  return {
    user: {
      _id: user._id,
      employeeCode: user.employeeCode,
      name: user.name,
      email: user.email,
      username: user.username,
      role: user.role,
      teamId: user.teamId,
      isActive: user.isActive,
      startDate: user.startDate,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    }
  };
};

/**
 * Update user basic fields (Admin workflow).
 *
 * Whitelist: name, email, username, teamId, isActive, startDate
 * Per API_SPEC.md and ROADMAP.md A4.
 *
 * @param {string} userId - Validated ObjectId string
 * @param {Object} body - req.body with allowed update fields
 * @returns {Promise<Object>} { user: updated }
 */
export const updateUser = async (userId, body) => {
  // Block editing soft-deleted users (P0 fix: deleted users are read-only)
  const targetUser = await User.findById(userId).select('deletedAt').lean();
  if (!targetUser) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }
  if (targetUser.deletedAt != null) {
    const error = new Error('Cannot edit deleted user. Restore first.');
    error.statusCode = 400;
    throw error;
  }

  // Whitelist allowed fields (per API_SPEC line 370)
  const allowedFields = ['name', 'email', 'username', 'teamId', 'isActive', 'startDate'];
  const updateData = {};

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updateData[field] = body[field];
    }
  }

  // Handle teamId: empty string means "clear team assignment" (P1 fix)
  let unsetTeamId = false;
  if (updateData.teamId === '') {
    unsetTeamId = true;
    delete updateData.teamId;
  } else if (updateData.teamId === null) {
    const error = new Error('teamId cannot be null. Use empty string to clear team assignment.');
    error.statusCode = 400;
    throw error;
  } else if (updateData.teamId !== undefined) {
    if (!mongoose.Types.ObjectId.isValid(updateData.teamId)) {
      const error = new Error('Invalid teamId format');
      error.statusCode = 400;
      throw error;
    }
  }

  // Validate startDate if provided (prevent cast error → 500)
  if (updateData.startDate !== undefined) {
    if (updateData.startDate === null) {
      const error = new Error('startDate cannot be null. Omit field to keep current value.');
      error.statusCode = 400;
      throw error;
    }
    const parsedDate = new Date(updateData.startDate);
    if (Number.isNaN(parsedDate.getTime())) {
      const error = new Error('Invalid startDate');
      error.statusCode = 400;
      throw error;
    }
    updateData.startDate = parsedDate;
  }

  // Check if there's anything to update
  if (Object.keys(updateData).length === 0 && !unsetTeamId) {
    const error = new Error('No valid fields to update');
    error.statusCode = 400;
    throw error;
  }

  // Build update operation with $set and $unset
  const updateOp = {};
  if (Object.keys(updateData).length > 0) {
    updateOp.$set = updateData;
  }
  if (unsetTeamId) {
    updateOp.$unset = { teamId: 1 };
  }

  // Update user
  const updatedUser = await User.findByIdAndUpdate(
    userId,
    updateOp,
    { new: true, runValidators: true }
  )
    .select('_id employeeCode name email username role teamId isActive startDate createdAt updatedAt')
    .lean();

  if (!updatedUser) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }

  return { user: updatedUser };
};

/**
 * Reset user password (Admin workflow).
 *
 * @param {string} userId - Validated ObjectId string
 * @param {string} newPassword - Plain-text new password (min 8 chars)
 * @returns {Promise<Object>} { message: 'Password updated' }
 */
export const resetPassword = async (userId, newPassword) => {
  // Validate password
  if (!newPassword || typeof newPassword !== 'string') {
    const error = new Error('newPassword is required');
    error.statusCode = 400;
    throw error;
  }

  if (newPassword.length < 8) {
    const error = new Error('Password must be at least 8 characters');
    error.statusCode = 400;
    throw error;
  }

  // Check if user exists and is not soft-deleted
  const existingUser = await User.findById(userId).select('_id deletedAt').lean();
  if (!existingUser) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }

  // Block resetting password for soft-deleted users (P0 fix)
  if (existingUser.deletedAt != null) {
    const error = new Error('Cannot reset password for deleted user. Restore first.');
    error.statusCode = 400;
    throw error;
  }

  // Hash password using bcrypt (SECURITY: do NOT log password)
  const passwordHash = await bcrypt.hash(newPassword, 10);

  await User.findByIdAndUpdate(userId, { passwordHash });

  return { message: 'Password updated' };
};

/**
 * Soft delete user (Admin workflow).
 *
 * Sets deletedAt = now. Cannot delete yourself.
 *
 * @param {string} userId - Validated ObjectId string of user to delete
 * @param {string} requestingUserId - ObjectId string of admin performing the delete
 * @returns {Promise<Object>} { message, restoreDeadline }
 */
export const softDeleteUser = async (userId, requestingUserId) => {
  // Self-delete prevention
  if (userId === requestingUserId.toString()) {
    const error = new Error('Cannot delete yourself');
    error.statusCode = 400;
    throw error;
  }

  // Find user (only active users, not already deleted)
  const user = await User.findOne({ _id: userId, deletedAt: null });
  if (!user) {
    const error = new Error('User not found or already deleted');
    error.statusCode = 404;
    throw error;
  }

  // Set deletedAt
  const now = new Date();
  user.deletedAt = now;
  await user.save();

  // Calculate restore deadline
  const SOFT_DELETE_DAYS = parseInt(process.env.SOFT_DELETE_DAYS) || 15;
  const restoreDeadline = new Date(now.getTime() + SOFT_DELETE_DAYS * 24 * 60 * 60 * 1000);

  return {
    message: 'User deleted',
    restoreDeadline: restoreDeadline.toISOString()
  };
};

/**
 * Restore soft-deleted user (Admin workflow).
 *
 * Sets deletedAt = null.
 *
 * @param {string} userId - Validated ObjectId string
 * @returns {Promise<Object>} { user: sanitized }
 */
export const restoreUser = async (userId) => {
  // Find user (must exist, not yet purged)
  const user = await User.findById(userId);
  if (!user) {
    const error = new Error('User not found or already purged');
    error.statusCode = 404;
    throw error;
  }

  // Check if user is actually deleted
  if (!user.deletedAt) {
    const error = new Error('User is not deleted');
    error.statusCode = 400;
    throw error;
  }

  // Restore user
  user.deletedAt = null;
  await user.save();

  return {
    user: {
      _id: user._id,
      employeeCode: user.employeeCode,
      name: user.name,
      email: user.email,
      username: user.username,
      role: user.role,
      teamId: user.teamId,
      isActive: user.isActive,
      startDate: user.startDate,
      deletedAt: user.deletedAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    }
  };
};

/**
 * Permanently delete users past the soft-delete retention period (Admin workflow).
 *
 * CASCADE: Hard deletes related attendances and requests for purged users.
 *
 * @returns {Promise<Object>} { message, purged, cascadeDeleted, details }
 */
export const purgeDeletedUsers = async () => {
  const SOFT_DELETE_DAYS = parseInt(process.env.SOFT_DELETE_DAYS) || 15;
  const cutoffDate = new Date(Date.now() - SOFT_DELETE_DAYS * 24 * 60 * 60 * 1000);

  // Find users to purge (deletedAt is set AND older than cutoff)
  const usersToPurge = await User.find({
    deletedAt: {
      $exists: true,  // Field must exist (prevent purging old users without field)
      $ne: null,      // Must not be null
      $lt: cutoffDate // Must be older than cutoff
    }
  }).select('_id employeeCode name email').lean();

  if (usersToPurge.length === 0) {
    return {
      message: 'No users to purge',
      purged: 0,
      details: []
    };
  }

  const userIds = usersToPurge.map(u => u._id);

  // CASCADE: Delete related attendances
  const attendanceResult = await Attendance.deleteMany({ userId: { $in: userIds } });

  // CASCADE: Delete related requests
  const requestResult = await Request.deleteMany({ userId: { $in: userIds } });

  // Delete users
  const userResult = await User.deleteMany({ _id: { $in: userIds } });

  // Build details
  const details = usersToPurge.map(user => ({
    userId: user._id,
    employeeCode: user.employeeCode,
    name: user.name,
    email: user.email
  }));

  return {
    message: `Purged ${userResult.deletedCount} users`,
    purged: userResult.deletedCount,
    cascadeDeleted: {
      attendances: attendanceResult.deletedCount,
      requests: requestResult.deletedCount
    },
    details
  };
};
