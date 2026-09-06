import mongoose from 'mongoose';

/**
 * Returns service health metrics including container uptime,
 * MongoDB connection state, and current memory usage.
 */
export async function getHealth() {
  const dbState = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  return {
    status: 'ok',
    uptime: process.uptime(),
    db: dbState,
    memory: process.memoryUsage(),
  };
}

export default getHealth;
