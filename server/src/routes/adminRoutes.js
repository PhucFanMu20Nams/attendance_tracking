import express from 'express';
import * as userController from '../controllers/userController.js';
import { authenticate } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Admin Management APIs (ADMIN only)
// Per ROADMAP.md A4 and API_SPEC.md

// PATCH /api/admin/users/:id - Update user basic fields
router.patch('/users/:id', authenticate, userController.updateUser);

// POST /api/admin/users/:id/reset-password - Reset user password
router.post('/users/:id/reset-password', authenticate, userController.resetPassword);

export default router;
