import express from 'express';
import * as timesheetController from '../controllers/timesheetController.js';
import { authenticate, authorize } from '../middlewares/authMiddleware.js';

const router = express.Router();

// All timesheet routes require authentication

// GET /api/timesheet/team?month=YYYY-MM
// Roles: MANAGER | ADMIN
router.get('/team', authenticate, authorize('MANAGER', 'ADMIN'), timesheetController.getTeamTimesheet);

// GET /api/timesheet/company?month=YYYY-MM
// Roles: ADMIN only
router.get('/company', authenticate, authorize('ADMIN'), timesheetController.getCompanyTimesheet);

export default router;
