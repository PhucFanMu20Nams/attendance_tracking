import { Router } from 'express';
import * as authController from '../controllers/authController.js';
import { authenticate, authorize } from '../middlewares/authMiddleware.js';

const router = Router();

router.post('/login', authController.login);
router.get('/me', authenticate, authController.getMe);

// Test route - Admin only
router.get('/admin-test', authenticate, authorize('ADMIN'), (req, res) => {
  res.json({ message: 'Welcome Admin! You have access.' });
});

export default router;
