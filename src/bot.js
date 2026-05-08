const TelegramBot = require('node-telegram-bot-api');
const logger = require('./logger');
const config = require('./config');

const bot = new TelegramBot(config.telegramToken, { polling: true });

// (1) Connection verification & (2) Log 'Bot is running'
bot.getMe().then((me) => {
  logger.info(`Bot is running as @${me.username}`);
}).catch((error) => {
  logger.error('Failed to connect to Telegram:', error);
  process.exit(1);
});

// (3) Handle error koneksi with graceful shutdown
bot.on('polling_error', (error) => {
  logger.error(`Polling error: ${error.code} - ${error.message}`);
  if (error.code === 'ETELEGRAM' && error.message.includes('404')) {
    logger.error('Invalid Bot Token. Shutting down...');
    process.exit(1);
  }
});

const gracefulShutdown = () => {
  logger.info('Shutting down bot gracefully...');
  bot.stopPolling();
  process.exit(0);
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

const { retryWithBackoff } = require('./utils/retry');

// (4) Export helper functions
const sendMessage = async (chatId, text, options = {}) => {
  try {
    return await retryWithBackoff(
      () => bot.sendMessage(chatId, text, { parse_mode: 'HTML', ...options }),
      3, // maxRetries
      1000 // baseDelay
    );
  } catch (error) {
    logger.error(`Failed to send message to ${chatId} after retries:`, error);
    throw error;
  }
};

const sendDocument = async (chatId, file, options = {}) => {
  try {
    return await retryWithBackoff(
      () => bot.sendDocument(chatId, file, options),
      3,
      1000
    );
  } catch (error) {
    logger.error(`Failed to send document to ${chatId}:`, error);
    throw error;
  }
};

/**
 * Send a message to a specific group.
 * Supports two call signatures:
 *   sendToGroup(text, options)          — uses legacy config.groupId
 *   sendToGroup(groupId, text, options) — uses the provided groupId
 */
const sendToGroup = async (groupIdOrText, textOrOptions, options = {}) => {
  if (typeof textOrOptions === 'string') {
    // New signature: sendToGroup(groupId, text, options)
    return await sendMessage(groupIdOrText, textOrOptions, options);
  }
  // Legacy signature: sendToGroup(text, options)
  return await sendMessage(config.groupId, groupIdOrText, textOrOptions || {});
};

bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  logger.info(`Received message from ${chatId}: ${msg.text}`);

  if (msg.text === '/start') {
    sendMessage(chatId, 'Bot siap membantu! Gunakan /admin untuk mengakses panel kontrol.');
  }

  if (msg.text === '/ping') {
    sendMessage(chatId, '🏓 Pong! I am alive and well.');
  }
});

module.exports = {
  bot,
  sendMessage,
  sendDocument,
  sendToGroup
};
