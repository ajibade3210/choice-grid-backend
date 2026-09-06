/**
 * Centralized error logger and handler middleware.
 * Logs errors via pino (req.log) while preserving client status codes.
 */
export const errorLogger = (err, req, res, next) => {
  if (req.log && typeof req.log.error === 'function') {
    req.log.error(err);
  } else {
    console.error('[ErrorLogger]', err);
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors || {}).map((e) => e.message);
    return res.status(400).json({ error: messages.join(', ') || err.message });
  }

  // CastError (invalid ObjectId)
  if (err.name === 'CastError') {
    return res.status(400).json({ error: `Invalid ${err.path}: ${err.value}` });
  }

  // Mongoose duplicate key error (code 11000)
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || 'field';
    return res.status(409).json({ error: `An account with this ${field} already exists` });
  }

  const status = err.status || 500;
  const message = status >= 500 ? 'Internal Server Error' : (err.message || 'Internal Server Error');
  res.status(status).json({ error: message });
};

export default errorLogger;
