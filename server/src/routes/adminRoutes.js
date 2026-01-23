import express from 'express';
import * as userController from '../controllers/userController.js';
import * as holidayController from '../controllers/holidayController.js';
import { authenticate } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Admin Management APIs (ADMIN only)
// Per ROADMAP.md A4 and API_SPEC.md

// User Management (ADMIN only)
// Per API_SPEC.md#L338-L372
router.post('/users', authenticate, userController.createUser);
router.get('/users', authenticate, userController.getAllUsers);

// PATCH /api/admin/users/:id - Update user basic fields
router.patch('/users/:id', authenticate, userController.updateUser);

// POST /api/admin/users/:id/reset-password - Reset user password
router.post('/users/:id/reset-password', authenticate, userController.resetPassword);

// Holiday Management (ADMIN only)
// Per API_SPEC.md#L402-L412
router.post('/holidays', authenticate, holidayController.createHoliday);
router.get('/holidays', authenticate, holidayController.getHolidays);
router.post('/holidays/range', authenticate, holidayController.createHolidayRange);

export default router;

