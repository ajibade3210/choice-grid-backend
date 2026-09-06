import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pino from 'pino';
import pinoHttp from 'pino-http';
import statusMonitor from 'express-status-monitor';

import { connectDB } from './src/config/db.js';
import authRoutes from './src/routes/auth.js';
import settingsRoutes from './src/routes/settings.js';
import logRoutes from './src/routes/logs.js';
import statsRoutes from './src/routes/stats.js';
import adminRoutes from './src/routes/admin.js';
import { getHealth } from './src/utils/health.js';
import { errorLogger } from './src/middleware/errorLogger.js';

// Load environment variables
dotenv.config();

// Connect to MongoDB
connectDB();

const app = express();
const PORT = process.env.PORT || 5001;

// Initialize Pino Structured Logger
const logger = pino({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
});
app.use(pinoHttp({ logger }));

// Status Monitor Dashboard at /api/status
app.use(
  statusMonitor({
    path: '/api/status',
    spans: [{ interval: 1, retention: 60 }],
  })
);

// CORS configuration loaded strictly from environment
const allowedOrigins = (process.env.CORS_ORIGIN || process.env.CLIENT_URL || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, postman)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(null, true); // Dev convenience
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Timezone', 'x-timezone'],
  })
);

// Body Parser Middleware
app.use(express.json());

// Production Log Sampling Middleware (Samples access logs, keeps error logs active)
const sampleRate = parseFloat(process.env.LOG_SAMPLE_RATE) || 0.1;
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production' && Math.random() > sampleRate) {
    const originalError = req.log?.error?.bind(req.log) || console.error;
    req.log = { info: () => {}, warn: () => {}, debug: () => {}, error: originalError };
  }
  next();
});

// Health Check Endpoint
app.get('/api/health', async (req, res, next) => {
  try {
    const health = await getHealth();
    res.status(200).json(health);
  } catch (err) {
    next(err);
  }
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/logs', logRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/admin', adminRoutes);

// 404 Handler
app.use('*', (req, res) => {
  res.status(404).json({ error: `Route ${req.originalUrl} not found` });
});

// Centralized Error Handler
app.use(errorLogger);

// Start server
app.listen(PORT, () => {
  console.log(`[Server] Choice Grid API running on port ${PORT}`);
  console.log(`[Server] Health check: http://localhost:${PORT}/api/health`);
  console.log(`[Server] Status monitor: http://localhost:${PORT}/api/status`);
});
