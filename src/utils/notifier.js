const config = require('../config');
const { sendMessage } = require('../bot');
const logger = require('../logger');
const monitor = require('./monitor');

/**
 * Notify all admins about a system event or error.
 * 
 * @param {string} errorType - Short code for the error (e.g., SCHEDULER_FAIL)
 * @param {string} message - Detailed error message
 * @param {string} context - Suggested solution or context
 */
async function notifyAdmin(errorType, message, context = 'Cek logs untuk detail lebih lanjut.') {
  // Record the error in the sliding window monitor
  monitor.recordError();
  
  const timestamp = new Date().toLocaleString('id-ID', { 
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false 
  });

  const formattedMessage = `🚨 <b>ERROR: ${message}</b>\n` +
    `⏰ ${timestamp} WIB\n` +
    `📋 Type: <code>${errorType}</code>\n` +
    `💡 ${context}`;

  logger.info(`Sending admin notification: ${errorType}`);

  const adminIds = config.adminIds || [];
  
  const notifications = adminIds.map(adminId => {
    // Clean ID just in case it's not strictly numeric string
    const cleanId = adminId.replace(/\D/g, '');
    return sendMessage(cleanId, formattedMessage).catch(err => {
      logger.error(`Failed to notify admin ${adminId}: ${err.message}`);
    });
  });

  await Promise.all(notifications);
}

module.exports = { notifyAdmin };
