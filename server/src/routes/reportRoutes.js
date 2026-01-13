import express from 'express';
import * as reportController from '../controllers/reportController.js';
import { authenticate, authorize } from '../middlewares/authMiddleware.js';

const router = express.Router();

// All report routes require authentication

// GET /api/reports/monthly?month=YYYY-MM&scope=team|company&teamId?
// Roles: MANAGER | ADMIN
router.get('/monthly', authenticate, authorize('MANAGER', 'ADMIN'), reportController.getMonthlyReport);

export default router;
