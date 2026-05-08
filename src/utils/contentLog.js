const fs = require('fs');
const path = require('path');
const logger = require('../logger');

// Legacy single-group log path (backward compat)
const LEGACY_LOG_PATH = path.join(__dirname, '../../data/content-log.json');

/**
 * Resolve log file path for a group.
 * If groupId is null/undefined, returns the legacy path for backward compat.
 */
function getLogPath(groupId) {
  if (!groupId) return LEGACY_LOG_PATH;
  const logsDir = path.join(__dirname, '../../data/logs');
  return path.join(logsDir, `${groupId}-content-log.json`);
}

/**
 * Ensure the data directory and log file exist.
 */
function ensureLogExists(logPath) {
  const dir = path.dirname(logPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(logPath)) {
    fs.writeFileSync(logPath, '[]');
  }
}

/**
 * Append a content generation entry to the log.
 * @param {string} groupId - Group slug (e.g. 'finsfree'). Pass null for legacy compat.
 * @param {string} type - 'education', 'product', 'newsletter', 'tip', 'quick_tip'
 * @param {string} topic - The topic or week number
 * @param {string} content - The generated text
 * @param {string} status - 'success' or 'failed'
 * @param {Object} metadata - Optional metadata (usage, error, etc.)
 */
function logContent(groupId, type, topic, content, status, metadata = {}) {
  try {
    const logPath = getLogPath(groupId);
    ensureLogExists(logPath);
    const data = fs.readFileSync(logPath, 'utf8');
    const logs = JSON.parse(data || '[]');

    const entry = {
      timestamp: new Date().toISOString(),
      type,
      topic,
      content: status === 'success' ? (content ? content.substring(0, 50) + '...' : '') : '',
      status,
      ...metadata
    };

    logs.push(entry);
    fs.writeFileSync(logPath, JSON.stringify(logs, null, 2));
    logger.info(`Content logged: ${type} - ${status}${groupId ? ` [${groupId}]` : ''}`);
  } catch (error) {
    logger.error('Failed to write to content log:', error);
  }
}

/**
 * Get topics used for a specific type within the last N days.
 * @param {string} groupId - Group slug. Pass null for legacy compat.
 * @param {string} type
 * @param {number} days
 * @returns {string[]}
 */
function getRecentTopics(groupId, type, days = 14) {
  // Support legacy 2-arg call: getRecentTopics(type, days)
  if (typeof groupId === 'string' && typeof type === 'number') {
    days = type;
    type = groupId;
    groupId = null;
  }

  try {
    const logPath = getLogPath(groupId);
    ensureLogExists(logPath);
    const data = fs.readFileSync(logPath, 'utf8');
    const logs = JSON.parse(data || '[]');

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    return logs
      .filter(entry =>
        entry.type === type &&
        entry.status === 'success' &&
        new Date(entry.timestamp) > cutoff
      )
      .map(entry => entry.topic);
  } catch (error) {
    logger.error('Failed to get recent topics:', error);
    return [];
  }
}

/**
 * Count how many successful posts were sent today.
 * @param {string} groupId - Group slug. Pass null for legacy compat.
 * @returns {number}
 */
function getTodayCount(groupId) {
  try {
    const logPath = getLogPath(groupId);
    ensureLogExists(logPath);
    const data = fs.readFileSync(logPath, 'utf8');
    const logs = JSON.parse(data || '[]');

    const today = new Date().toISOString().split('T')[0];

    return logs.filter(entry =>
      entry.status === 'success' &&
      entry.timestamp.startsWith(today)
    ).length;
  } catch (error) {
    logger.error('Failed to get today count:', error);
    return 0;
  }
}

/**
 * Get summary statistics of content generation.
 * @param {string} groupId - Group slug. Pass null for legacy compat.
 * @param {number} days - Number of days to look back
 * @returns {Object}
 */
function getStats(groupId, days = 7) {
  // Support legacy 1-arg call: getStats(days)
  if (typeof groupId === 'number') {
    days = groupId;
    groupId = null;
  }

  try {
    const logPath = getLogPath(groupId);
    ensureLogExists(logPath);
    const data = fs.readFileSync(logPath, 'utf8');
    const logs = JSON.parse(data || '[]');

    const stats = {
      total: logs.length,
      byType: {},
      thisWeek: 0,
      successCount: 0,
      failedCount: 0
    };

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    logs.forEach(entry => {
      if (new Date(entry.timestamp) > cutoff) {
        stats.byType[entry.type] = (stats.byType[entry.type] || 0) + 1;
        if (entry.status === 'success') stats.successCount++;
        else stats.failedCount++;
        stats.thisWeek++;
      }
    });

    return stats;
  } catch (error) {
    logger.error('Failed to get stats:', error);
    return null;
  }
}

/**
 * Get information about the last successful post.
 * @param {string} groupId - Group slug. Pass null for legacy compat.
 */
function getLastPostInfo(groupId) {
  try {
    const logPath = getLogPath(groupId);
    if (!fs.existsSync(logPath)) return null;
    const logs = JSON.parse(fs.readFileSync(logPath, 'utf8') || '[]');
    const successfulPosts = logs.filter(l => l.status === 'success');
    if (successfulPosts.length === 0) return null;
    return successfulPosts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
  } catch (err) {
    logger.error('Failed to get last post info:', err);
    return null;
  }
}

/**
 * Get comprehensive statistics for the weekly executive report.
 * @param {string} groupId - Group slug. Pass null for legacy compat.
 * @returns {Object}
 */
function getWeeklyStats(groupId) {
  try {
    const logPath = getLogPath(groupId);
    ensureLogExists(logPath);
    const data = fs.readFileSync(logPath, 'utf8');
    const logs = JSON.parse(data || '[]');

    const stats = {
      byType: {},
      errors: [],
      topics: {},
      skipped: 0,
      estimatedCost: 0,
      totalTokens: 0,
      period: {
        start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        end: new Date().toISOString()
      }
    };

    const cutoff = new Date(stats.period.start);

    logs.forEach(entry => {
      const entryDate = new Date(entry.timestamp);
      if (entryDate > cutoff) {
        if (entry.status === 'success') {
          stats.byType[entry.type] = (stats.byType[entry.type] || 0) + 1;
        } else if (entry.status === 'skipped') {
          stats.skipped++;
        } else {
          stats.errors.push({
            time: entry.timestamp,
            type: entry.type,
            msg: entry.error || 'Unknown error'
          });
        }

        if (entry.topic && entry.topic !== 'N/A') {
          stats.topics[entry.topic] = (stats.topics[entry.topic] || 0) + 1;
        }

        if (entry.usage && entry.usage.total_tokens) {
          stats.totalTokens += entry.usage.total_tokens;
        }
      }
    });

    // GPT-4o-mini blended rate: ~$0.30 per 1M tokens ($0.0003 per 1K)
    stats.estimatedCost = (stats.totalTokens / 1000) * 0.0003;
    return stats;
  } catch (error) {
    logger.error('Failed to get weekly stats:', error);
    return null;
  }
}

/**
 * Get today's posting stats (success, failed, skipped) for a group.
 * @param {string} groupId
 * @returns {Object}
 */
function getDailyStats(groupId) {
  try {
    const logPath = getLogPath(groupId);
    ensureLogExists(logPath);
    const logs = JSON.parse(fs.readFileSync(logPath, 'utf8') || '[]');
    const today = new Date().toISOString().split('T')[0];
    const todayLogs = logs.filter(e => e.timestamp.startsWith(today));

    const stats = { success: 0, failed: 0, skipped: 0, errors: [], byType: {} };
    todayLogs.forEach(entry => {
      if (entry.status === 'success') {
        stats.success++;
        stats.byType[entry.type] = (stats.byType[entry.type] || 0) + 1;
      } else if (entry.status === 'failed') {
        stats.failed++;
        stats.errors.push({ type: entry.type, msg: entry.error || 'Unknown' });
      } else if (entry.status === 'skipped') {
        stats.skipped++;
      }
    });
    return stats;
  } catch (error) {
    logger.error('Failed to get daily stats:', error);
    return null;
  }
}

/**
 * Get stats for the last 30 days vs the previous 30 days (for monthly report).
 * @param {string} groupId
 * @returns {Object} { current, previous, period }
 */
function getMonthlyStats(groupId) {
  try {
    const logPath = getLogPath(groupId);
    ensureLogExists(logPath);
    const logs = JSON.parse(fs.readFileSync(logPath, 'utf8') || '[]');

    const now = new Date();
    const cutoffCurrent = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const cutoffPrevious = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    function aggregate(from, to) {
      const periodLogs = logs.filter(e => {
        const t = new Date(e.timestamp);
        return t >= from && t < to;
      });
      let success = 0, failed = 0, skipped = 0, totalTokens = 0;
      const byType = {};
      const topErrors = {};
      periodLogs.forEach(e => {
        if (e.status === 'success') {
          success++;
          byType[e.type] = (byType[e.type] || 0) + 1;
          if (e.usage && e.usage.total_tokens) totalTokens += e.usage.total_tokens;
        } else if (e.status === 'failed') {
          failed++;
          const key = `${e.type}: ${(e.error || 'Unknown error').substring(0, 45)}`;
          topErrors[key] = (topErrors[key] || 0) + 1;
        } else if (e.status === 'skipped') {
          skipped++;
        }
      });
      const estimatedCost = (totalTokens / 1000) * 0.0003;
      const total = success + failed;
      const reliability = total > 0 ? ((success / total) * 100).toFixed(1) : '100.0';
      return { success, failed, skipped, byType, topErrors, totalTokens, estimatedCost, reliability };
    }

    return {
      current: aggregate(cutoffCurrent, now),
      previous: aggregate(cutoffPrevious, cutoffCurrent),
      period: { start: cutoffCurrent.toISOString(), end: now.toISOString() }
    };
  } catch (error) {
    logger.error('Failed to get monthly stats:', error);
    return null;
  }
}

/**
 * Get log file path for download.
 * @param {string} groupId
 * @returns {string}
 */
function getLogFilePath(groupId) {
  return getLogPath(groupId);
}

module.exports = {
  logContent,
  getRecentTopics,
  getTodayCount,
  getStats,
  getLastPostInfo,
  getWeeklyStats,
  getDailyStats,
  getMonthlyStats,
  getLogFilePath
};
