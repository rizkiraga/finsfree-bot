const fs = require('fs');
const path = require('path');
const config = require('../config');
const logger = require('../logger');

const ADMIN_LOG_PATH = path.join(__dirname, '../../data/admin-log.json');

// Memory storage for rate limiting: { userId: { count: N, resetTime: T } }
const rateLimits = new Map();

/**
 * Log admin command to persistent JSON file.
 */
function logAdminAction(userId, command, chatId) {
  try {
    const dir = path.dirname(ADMIN_LOG_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    
    let logs = [];
    if (fs.existsSync(ADMIN_LOG_PATH)) {
      logs = JSON.parse(fs.readFileSync(ADMIN_LOG_PATH, 'utf8') || '[]');
    }
    
    logs.push({
      timestamp: new Date().toISOString(),
      userId,
      chatId,
      command
    });
    
    // Keep only last 1000 logs to prevent file bloat
    if (logs.length > 1000) logs = logs.slice(-1000);
    
    fs.writeFileSync(ADMIN_LOG_PATH, JSON.stringify(logs, null, 2));
  } catch (err) {
    logger.error('Failed to log admin action:', err);
  }
}

/**
 * Check if a user ID is in the admin list.
 */
function isAdmin(userId) {
  if (!userId) return false;
  const normalizedUserId = userId.toString().replace(/\D/g, '');
  const normalizedAdminIds = config.adminIds.map(id => id.toString().replace(/\D/g, ''));
  return normalizedAdminIds.includes(normalizedUserId);
}

/**
 * Middleware-like helper to restrict commands to admins with rate limiting.
 * Handles both Message and CallbackQuery objects.
 */
async function checkAdmin(bot, msg, callback) {
  const userId = msg.from.id.toString();
  const chatId = msg.message ? msg.message.chat.id : msg.chat.id;
  const command = msg.text ? msg.text.split(' ')[0] : (msg.data ? `callback:${msg.data}` : 'unknown');

  if (!isAdmin(userId)) {
    logger.warn(`Unauthorized access attempt by ${userId} in chat ${chatId}`);
    try {
      await bot.sendMessage(chatId, 'Maaf, perintah ini hanya untuk admin.');
    } catch (error) {
      logger.error('Failed to send unauthorized message:', error);
    }
    return;
  }

  // Rate Limiting Logic (10 commands per minute)
  const now = Date.now();
  const limit = rateLimits.get(userId) || { count: 0, resetTime: now + 60000 };

  if (now > limit.resetTime) {
    limit.count = 1;
    limit.resetTime = now + 60000;
  } else {
    limit.count++;
  }
  rateLimits.set(userId, limit);

  if (limit.count > 10) {
    logger.warn(`Rate limit exceeded for admin ${userId}`);
    return bot.sendMessage(chatId, '⚠️ **Rate Limit Exceeded:**\nMaksimal 10 perintah per menit. Silakan tunggu sebentar.');
  }

  // Log the action
  logAdminAction(userId, command, chatId);
  logger.info(`Admin ${userId} executed: ${command}`);

  return callback();
}

module.exports = {
  isAdmin,
  checkAdmin
};
