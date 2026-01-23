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

        // Handle teamId: empty string means "clear team assignment" (P1 fix)
        let unsetTeamId = false;
        if (updateData.teamId === '') {
            // Mark for $unset operation
            unsetTeamId = true;
            delete updateData.teamId;
        } else if (updateData.teamId === null) {
            return res.status(400).json({
                message: 'teamId cannot be null. Use empty string to clear team assignment.'
            });
        } else if (updateData.teamId !== undefined) {
            // Validate teamId format if provided
            if (!mongoose.Types.ObjectId.isValid(updateData.teamId)) {
                return res.status(400).json({
                    message: 'Invalid teamId format'
                });
            }
        }

        // Validate startDate if provided (prevent cast error → 500)
        if (updateData.startDate !== undefined) {
            if (updateData.startDate === null) {
                return res.status(400).json({
                    message: 'startDate cannot be null. Omit field to keep current value.'
                });
            }
            const parsedDate = new Date(updateData.startDate);
            if (Number.isNaN(parsedDate.getTime())) {
                return res.status(400).json({
                    message: 'Invalid startDate'
                });
            }
            updateData.startDate = parsedDate;
        }

        // Check if there's anything to update
        if (Object.keys(updateData).length === 0 && !unsetTeamId) {
            return res.status(400).json({
                message: 'No valid fields to update'
            });
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
            id,
            updateOp,
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

/**
 * POST /api/admin/users
 * Create new user (Admin only).
 * 
 * Required: employeeCode, name, email, password, role
 * Optional: username, teamId, startDate, isActive (default true)
 * 
 * Per API_SPEC.md#L338-L353
 */
export const createUser = async (req, res) => {
    try {
        // RBAC: ADMIN only (defense-in-depth, route also has middleware)
        if (req.user.role !== 'ADMIN') {
            return res.status(403).json({ message: 'Access denied' });
        }

        const { employeeCode, name, email, username, password, role, teamId, startDate, isActive } = req.body;

        // ============================================
        // VALIDATION: Required fields (with type check - consistent with resetPassword)
        // ============================================
        if (!employeeCode || typeof employeeCode !== 'string' || !employeeCode.trim()) {
            return res.status(400).json({ message: 'Employee code is required' });
        }
        if (!name || typeof name !== 'string' || !name.trim()) {
            return res.status(400).json({ message: 'Name is required' });
        }
        if (!email || typeof email !== 'string' || !email.trim()) {
            return res.status(400).json({ message: 'Email is required' });
        }
        if (!password || typeof password !== 'string') {
            return res.status(400).json({ message: 'Password is required' });
        }
        if (password.length < 8) {
            return res.status(400).json({ message: 'Password must be at least 8 characters' });
        }
        if (!role) {
            return res.status(400).json({ message: 'Role is required' });
        }
        if (!['ADMIN', 'MANAGER', 'EMPLOYEE'].includes(role)) {
            return res.status(400).json({ message: 'Invalid role. Must be ADMIN, MANAGER, or EMPLOYEE' });
        }

        // ============================================
        // VALIDATION: Optional fields
        // ============================================
        // Validate teamId format if provided
        if (teamId && !mongoose.Types.ObjectId.isValid(teamId)) {
            return res.status(400).json({ message: 'Invalid teamId format' });
        }

        // Validate startDate if provided (P1 fix: reject null to prevent 1970 epoch bug)
        let parsedStartDate;
        if (startDate !== undefined) {
            if (startDate === null) {
                return res.status(400).json({ message: 'startDate cannot be null' });
            }
            parsedStartDate = new Date(startDate);
            if (Number.isNaN(parsedStartDate.getTime())) {
                return res.status(400).json({ message: 'Invalid startDate' });
            }
        }

        // Validate isActive if provided (must be boolean)
        let isActiveNorm = true;
        if (isActive !== undefined) {
            if (typeof isActive !== 'boolean') {
                return res.status(400).json({ message: 'isActive must be boolean' });
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
        return res.status(201).json({
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
        });
    } catch (error) {
        // ============================================
        // ERROR HANDLING
        // ============================================

        // Handle duplicate key errors (MongoDB 11000)
        if (error.code === 11000) {
            const field = Object.keys(error.keyPattern)[0];
            return res.status(409).json({
                message: `${field.charAt(0).toUpperCase() + field.slice(1)} already exists`
            });
        }

        // OWASP A05/A09: Verbose logging in dev, generic in prod
        if (process.env.NODE_ENV !== 'production') {
            console.error('createUser error:', error);
        } else {
            console.error('createUser error');
        }
        return res.status(500).json({ message: 'Internal server error' });
    }
};
/**
 * GET /api/admin/users (UPDATED v2.3)
 * Get paginated users (Admin only).
 * 
 * Query params:
 * - page: number (default 1)
 * - limit: number (default 20, max 100)
 * - search: string (search by name/email/employeeCode)
 * - includeDeleted: boolean (default false)
 * 
 * Response: { items, pagination: { page, limit, total, totalPages } }
 * Per API_SPEC.md L367-400
 */
export const getAllUsers = async (req, res) => {
    try {
        // RBAC: ADMIN only (defense-in-depth)
        if (req.user.role !== 'ADMIN') {
            return res.status(403).json({ message: 'Access denied' });
        }

        // Parse query params with defaults
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
        const search = req.query.search?.trim() || '';
        const includeDeleted = req.query.includeDeleted === 'true';

        // Build query filter
        const filter = {};

        // Soft delete filter (requires deletedAt field in User model)
        if (!includeDeleted) {
            filter.deletedAt = null;
        }

        // Search filter (name, email, or employeeCode)
        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { employeeCode: { $regex: search, $options: 'i' } }
            ];
        }

        // Count total (for pagination)
        const total = await User.countDocuments(filter);
        const totalPages = Math.ceil(total / limit);

        // Fetch paginated results
        const users = await User.find(filter)
            .select('_id employeeCode name email username role teamId isActive startDate deletedAt createdAt updatedAt')
            .sort({ employeeCode: 1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean();

        return res.status(200).json({
            items: users,
            pagination: {
                page,
                limit,
                total,
                totalPages
            }
        });
    } catch (error) {
        // OWASP A05/A09: Verbose logging in dev, generic in prod
        if (process.env.NODE_ENV !== 'production') {
            console.error('getAllUsers error:', error);
        } else {
            console.error('getAllUsers error');
        }
        return res.status(500).json({ message: 'Internal server error' });
    }
};