import express from 'express';
import * as attendanceController from '../controllers/attendanceController.js';
import { authenticate } from '../middlewares/authMiddleware.js';

const router = express.Router();

// All attendance routes require authentication
// Roles: EMPLOYEE, MANAGER, ADMIN (all authenticated users can access)

router.post('/check-in', authenticate, attendanceController.checkIn);
router.post('/check-out', authenticate, attendanceController.checkOut);
router.get('/me', authenticate, attendanceController.getMyAttendance);

// Member Management: Today activity (Manager/Admin only)
router.get('/today', authenticate, attendanceController.getTodayAttendance);

// Member Management: User attendance history (Manager/Admin only)
router.get('/user/:id', authenticate, attendanceController.getAttendanceByUser);

export default router;
