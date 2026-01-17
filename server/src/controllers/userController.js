import User from '../models/User.js';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';

/**
 * GET /api/users/:id
 * Get user profile by ID for Member Management.
 * 
 * RBAC:
 * - MANAGER: can only access users in same team (Anti-IDOR)
 * - ADMIN: can access any user
 * - EMPLOYEE: blocked (403)
 */
export const getUserById = async (req, res) => {
    try {
        const { id } = req.params;
        const { role, teamId: requestingUserTeamId } = req.user;

        // Validate ObjectId format
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                message: 'Invalid user ID format'
            });
        }

        // Block Employee role
        if (role === 'EMPLOYEE') {
            return res.status(403).json({
                message: 'Insufficient permissions. Manager or Admin required.'
            });
        }

        // FIX C: Manager without teamId cannot access member management
        if (role === 'MANAGER' && !requestingUserTeamId) {
            return res.status(403).json({
                message: 'Manager must be assigned to a team'
            });
        }

        // Query-level Anti-IDOR (cleaner pattern):
        // - MANAGER: query includes teamId to only fetch same-team users
        // - ADMIN: can access any user
        let targetUser;
        const selectFields = '_id employeeCode name email username role teamId isActive startDate createdAt updatedAt';

        if (role === 'MANAGER') {
            // Manager can only query users in same team (Anti-IDOR at query level)
            targetUser = await User.findOne({
                _id: id,
                teamId: requestingUserTeamId
            })
                .select(selectFields)
                .lean();

            // Not found OR different team => same 403 response (per RULES.md line 126)
            if (!targetUser) {
                return res.status(403).json({
                    message: 'Access denied. You can only view users in your team.'
                });
            }
        } else {
            // Admin can access any user
            targetUser = await User.findById(id)
                .select(selectFields)
                .lean();

            // Not found
            if (!targetUser) {
                return res.status(404).json({
                    message: 'User not found'
                });
            }
        }

        return res.status(200).json({ user: targetUser });
    } catch (error) {
        // OWASP A05/A09: Verbose logging in dev, generic in prod
        if (process.env.NODE_ENV !== 'production') {
            console.error('Error fetching user by ID:', error);
        } else {
            console.error('Error fetching user by ID');
        }

        const statusCode = error.statusCode || 500;

        // 4xx returns message, 5xx returns generic (OWASP A09)
        const responseMessage = statusCode < 500
            ? (error.message || 'Request failed')
            : 'Internal server error';

        return res.status(statusCode).json({
            message: responseMessage
        });
    }
};

/**
 * PATCH /api/admin/users/:id
 * Update user basic fields (Admin only).
 * 
 * Whitelist: name, email, username, teamId, isActive, startDate
 * Per API_SPEC.md and ROADMAP.md A4.
 */
export const updateUser = async (req, res) => {
    try {
        const { id } = req.params;
        const { role } = req.user;

        // Admin only guard
        if (role !== 'ADMIN') {
            return res.status(403).json({
                message: 'Forbidden. Admin access required.'
            });
        }

        // Validate ObjectId format
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                message: 'Invalid user ID format'
            });
        }

        // Whitelist allowed fields (per API_SPEC line 370)
        const allowedFields = ['name', 'email', 'username', 'teamId', 'isActive', 'startDate'];
        const updateData = {};

        for (const field of allowedFields) {
            if (req.body[field] !== undefined) {
                updateData[field] = req.body[field];
            }
        }

        // Reject null values for optional fields (project guideline: no null, use undefined/$unset)
        if (updateData.teamId === null) {
            return res.status(400).json({
                message: 'teamId cannot be null. Omit field to keep current value.'
            });
        }

        if (updateData.startDate === null) {
            return res.status(400).json({
                message: 'startDate cannot be null. Omit field to keep current value.'
            });
        }

        // Validate startDate if provided (prevent cast error → 500)
        if (updateData.startDate !== undefined) {
            const parsedDate = new Date(updateData.startDate);
            if (Number.isNaN(parsedDate.getTime())) {
                return res.status(400).json({
                    message: 'Invalid startDate'
                });
            }
            updateData.startDate = parsedDate;
        }

        // Validate teamId format if provided
        if (updateData.teamId !== undefined) {
            if (!mongoose.Types.ObjectId.isValid(updateData.teamId)) {
                return res.status(400).json({
                    message: 'Invalid teamId format'
                });
            }
        }

        // Check if there's anything to update
        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({
                message: 'No valid fields to update'
            });
        }

        // Update user
        const updatedUser = await User.findByIdAndUpdate(
            id,
            updateData,
            { new: true, runValidators: true }
        )
            .select('_id employeeCode name email username role teamId isActive startDate createdAt updatedAt')
            .lean();

        if (!updatedUser) {
            return res.status(404).json({
                message: 'User not found'
            });
        }

        return res.status(200).json({ user: updatedUser });
    } catch (error) {
        // Handle duplicate key error (email/username already exists)
        if (error.code === 11000) {
            return res.status(409).json({
                message: 'Email or username already exists'
            });
        }

        // OWASP A05/A09: Verbose logging in dev, generic in prod
        if (process.env.NODE_ENV !== 'production') {
            console.error('Error updating user:', error);
        } else {
            console.error('Error updating user');
        }

        const statusCode = error.statusCode || 500;
        const responseMessage = statusCode < 500
            ? (error.message || 'Request failed')
            : 'Internal server error';

        return res.status(statusCode).json({
            message: responseMessage
        });
    }
};

/**
 * POST /api/admin/users/:id/reset-password
 * Reset user password (Admin only).
 * 
 * Body: { newPassword }
 * - newPassword must be >= 8 characters
 * - bcrypt hash, do NOT log password
 * Per ROADMAP.md A4.
 */
export const resetPassword = async (req, res) => {
    try {
        const { id } = req.params;
        const { role } = req.user;
        const { newPassword } = req.body;

        // Admin only guard
        if (role !== 'ADMIN') {
            return res.status(403).json({
                message: 'Forbidden. Admin access required.'
            });
        }

        // Validate ObjectId format
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                message: 'Invalid user ID format'
            });
        }

        // Validate password
        if (!newPassword || typeof newPassword !== 'string') {
            return res.status(400).json({
                message: 'newPassword is required'
            });
        }

        if (newPassword.length < 8) {
            return res.status(400).json({
                message: 'Password must be at least 8 characters'
            });
        }

        // Check if user exists
        const existingUser = await User.findById(id).select('_id').lean();
        if (!existingUser) {
            return res.status(404).json({
                message: 'User not found'
            });
        }

        // Hash password using bcrypt (imported at top)
        const passwordHash = await bcrypt.hash(newPassword, 10);

        // Update password (SECURITY: do NOT log password)
        await User.findByIdAndUpdate(id, { passwordHash });

        return res.status(200).json({
            message: 'Password updated'
        });
    } catch (error) {
        // OWASP A05/A09: Verbose logging in dev, generic in prod
        // SECURITY: Never log password-related data
        if (process.env.NODE_ENV !== 'production') {
            console.error('Error resetting password:', error.message);
        } else {
            console.error('Error resetting password');
        }

        const statusCode = error.statusCode || 500;
        const responseMessage = statusCode < 500
            ? (error.message || 'Request failed')
            : 'Internal server error';

        return res.status(statusCode).json({
            message: responseMessage
        });
    }
};

