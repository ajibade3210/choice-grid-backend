import express from 'express';
import jwt from 'jsonwebtoken';
import NodeCache from 'node-cache';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';

import { User } from '../models/User.js';
import { HabitSettings } from '../models/HabitSettings.js';
import { HabitLog } from '../models/HabitLog.js';
import { getUserStats } from '../services/statsService.js';

dayjs.extend(utc);
dayjs.extend(timezone);

const router = express.Router();
const metricsCache = new NodeCache({ stdTTL: 60 });

/**
 * Admin verification middleware.
 * Expects Authorization: Bearer <token> signed with JWT_SECRET and role === 'admin'.
 */
export const verifyAdmin = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization header with Bearer token required' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: Admin role required' });
    }
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired admin token' });
  }
};

/**
 * POST /api/admin/login
 * Body: { secret: "ADMIN_SECRET" }
 * Returns: { token: jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '24h' }) }
 */
router.post('/login', (req, res) => {
  const { secret } = req.body || {};
  const expectedSecret = process.env.ADMIN_SECRET;

  if (!expectedSecret) {
    return res.status(500).json({ error: 'ADMIN_SECRET not configured on server' });
  }

  if (!secret || secret !== expectedSecret) {
    return res.status(401).json({ error: 'Invalid admin secret' });
  }

  const token = jwt.sign({ role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '24h' });
  return res.status(200).json({ token });
});

/**
 * GET /api/admin/metrics
 * Protected by verifyAdmin. Cached for 60s via node-cache.
 */
router.get('/metrics', verifyAdmin, async (req, res, next) => {
  try {
    const cachedMetrics = metricsCache.get('admin_metrics');
    if (cachedMetrics) {
      return res.status(200).json({ ...cachedMetrics, cached: true });
    }

    // 1. Total registered users
    const totalUsers = await User.countDocuments();

    // 2. DAU: Users with habit logs created or updated in the last 24h
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const activeUserIds = await HabitLog.distinct('userId', {
      updatedAt: { $gte: twentyFourHoursAgo },
    });
    const dau = activeUserIds.length;

    // 3. Habits created: Sum of all habits.length across HabitSettings
    const habitCountAgg = await HabitSettings.aggregate([
      { $project: { habitCount: { $size: { $ifNull: ['$habits', []] } } } },
      { $group: { _id: null, total: { $sum: '$habitCount' } } },
    ]);
    const habitsCreated = habitCountAgg.length > 0 ? habitCountAgg[0].total : 0;

    // 4. Logs today: Count of logs where date = today Africa/Lagos
    const todayLagosStr = dayjs().tz('Africa/Lagos').format('YYYY-MM-DD');
    const logsToday = await HabitLog.countDocuments({ date: todayLagosStr });

    // 5. Avg streak: Average of currentStreak across all users
    const users = await User.find().select('_id').lean();
    let avgStreak = 0;
    if (users.length > 0) {
      let streakSum = 0;
      for (const user of users) {
        try {
          const stats = await getUserStats(user._id);
          streakSum += stats.currentStreak || 0;
        } catch {
          // ignore individual calculation error
        }
      }
      avgStreak = Number((streakSum / users.length).toFixed(2));
    }

    const metrics = {
      totalUsers,
      dau,
      habitsCreated,
      logsToday,
      avgStreak,
    };

    metricsCache.set('admin_metrics', metrics);
    return res.status(200).json({ ...metrics, cached: false });
  } catch (error) {
    next(error);
  }
});

export default router;
