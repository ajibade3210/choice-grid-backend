import express from 'express';
import { getStats } from '../controllers/statsController.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

router.use(authMiddleware);

// GET /api/stats
router.get('/', getStats);

export default router;
