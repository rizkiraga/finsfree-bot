const winston = require('winston');
require('winston-daily-rotate-file');
const path = require('path');
const fs = require('fs');

// Ensure logs directory exists
const logDir = 'logs';
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

const { combine, timestamp, printf, colorize, errors } = winston.format;

// Custom log format
const logFormat = printf(({ level, message, timestamp, stack }) => {
  return `${timestamp} [${level}]: ${stack || message}`;
});

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info', // Default to info, configurable via env
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }), // Capture stack trace if present
    logFormat
  ),
  transports: [
    // 1. Console transport for development
    new winston.transports.Console({
      format: combine(
        colorize(),
        logFormat
      )
    }),
    
    // 2. Daily rotate file transport for app logs
    new winston.transports.DailyRotateFile({
      filename: path.join(logDir, 'app-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d', // Keep for 14 days
      level: 'debug' // Log everything from debug level and above to file
    }),

    // 3. Separate file transport for error logs only
    new winston.transports.DailyRotateFile({
      filename: path.join(logDir, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '10m',
      maxFiles: '14d',
      level: 'error'
    })
  ]
});

/**
 * Helper for structured logging.
 * @param {string} category - e.g., 'TELEGRAM', 'OPENAI', 'SCHEDULER', 'ADMIN'
 * @param {string} action - The specific action being performed
 * @param {Object|string} data - Material data related to the event
 */
logger.logEvent = (category, action, data = {}) => {
  const dataString = typeof data === 'object' ? JSON.stringify(data) : data;
  logger.info(`[${category.toUpperCase()}] ${action}: ${dataString}`);
};

module.exports = logger;
