import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDB } from './src/config/db.js';
import authRoutes from './src/routes/auth.js';
import settingsRoutes from './src/routes/settings.js';
import logRoutes from './src/routes/logs.js';
import statsRoutes from './src/routes/stats.js';
import { errorHandler } from './src/middleware/errorHandler.js';

// Load environment variables
dotenv.config();

// Connect to MongoDB
connectDB();

const app = express();
const PORT = process.env.PORT || 5001;

// CORS configuration supporting frontend dev server
const envOrigins = (process.env.CORS_ORIGIN || process.env.CLIENT_URL || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowedOrigins = Array.from(
  new Set([
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    ...envOrigins,
  ])
);

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
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// Body Parser Middleware
app.use(express.json());

// Health Check Endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', time: new Date().toISOString(), service: 'choice-grid-api' });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/logs', logRoutes);
app.use('/api/stats', statsRoutes);

// 404 Handler
app.use('*', (req, res) => {
  res.status(404).json({ error: `Route ${req.originalUrl} not found` });
});

// Centralized Error Handler
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`[Server] Choice Grid API running on port ${PORT}`);
  console.log(`[Server] Health check: http://localhost:${PORT}/api/health`);
});
