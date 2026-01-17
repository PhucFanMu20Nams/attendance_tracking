import express from 'express';
import { getAllTeams } from '../controllers/teamController.js';
import { authenticate } from '../middlewares/authMiddleware.js';

const router = express.Router();

/**
 * @route GET /api/teams
 * @desc Get all teams for filters/dropdowns
 * @access Protected (any authenticated user)
 */
router.get('/', authenticate, getAllTeams);

export default router;
