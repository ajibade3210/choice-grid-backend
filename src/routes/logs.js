import express from 'express';
import {
  getMonthLogs,
  getTodayLog,
  getDateLog,
  upsertTodayLog,
  updateDateLog,
} from '../controllers/logsController.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// Require auth for all log routes
router.use(authMiddleware);

// GET /api/logs/month/:year/:month
router.get('/month/:year/:month', getMonthLogs);

// GET /api/logs/today
router.get('/today', getTodayLog);

// GET /api/logs/:date
router.get('/:date', getDateLog);

// POST /api/logs/today
router.post('/today', upsertTodayLog);

// POST /api/logs/:date
router.post('/:date', updateDateLog);

export default router;
