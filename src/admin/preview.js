const logger = require('../logger');

// In-memory storage for posts awaiting confirmation
// Key: chatId (or a unique interaction ID), Value: { type, result, groupConfig, timer }
const pendingPosts = new Map();

/**
 * Add a post to the pending list with a 60s timeout.
 * @param {string|number} chatId
 * @param {string} type
 * @param {Object} result
 * @param {Function} onTimeout - Callback to run when post expires
 * @param {Object|null} groupConfig - Group config for multi-group routing
 */
function addPendingPost(chatId, type, result, onTimeout, groupConfig = null) {
  // Clear existing if any
  clearPendingPost(chatId);

  const timer = setTimeout(() => {
    logger.info(`Pending post for ${chatId} (${type}) expired.`);
    clearPendingPost(chatId);
    if (onTimeout) onTimeout();
  }, 60000);

  pendingPosts.set(chatId.toString(), {
    type,
    result,
    groupConfig,
    timer
  });
}

/**
 * Get a pending post.
 * @param {string|number} chatId
 * @returns {Object|null}
 */
function getPendingPost(chatId) {
  return pendingPosts.get(chatId.toString()) || null;
}

/**
 * Clear a pending post and its timer.
 * @param {string|number} chatId
 */
function clearPendingPost(chatId) {
  const pending = pendingPosts.get(chatId.toString());
  if (pending) {
    clearTimeout(pending.timer);
    pendingPosts.delete(chatId.toString());
  }
}

module.exports = {
  addPendingPost,
  getPendingPost,
  clearPendingPost
};
