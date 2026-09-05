import express from 'express';
import { getSettings, updateSettings } from '../controllers/settingsController.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// Require auth for all settings routes
router.use(authMiddleware);

// GET /api/settings
router.get('/', getSettings);

// POST /api/settings
router.post('/', updateSettings);

export default router;
