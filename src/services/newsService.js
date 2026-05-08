const fs = require('fs');
const path = require('path');
const logger = require('../logger');
const { fetchEconomicCalendar, filterHighImpactNews } = require('../utils/newsFeed');
const { sendMessage } = require('../bot');
const { logContent } = require('../utils/contentLog');
const { generateNewsTradingContent } = require('../content/generator');
const { getAllGroups } = require('../config/groupsLoader');

const NEWS_LOG_PATH = path.join(__dirname, '../../data/news-log.json');

// Store active timers to allow cleanup if needed
let activeTimers = [];

/**
 * Initialize News Service: Sync today's news and schedule alerts.
 */
async function initNewsService() {
  logger.info('Initializing News Service...');
  await syncDailyNews();
}

/**
 * Sync daily news: Fetch from API and schedule high-impact events.
 * Sends alerts to all groups with newsEnabled: true.
 */
async function syncDailyNews() {
  clearActiveTimers();

  const calendar = await fetchEconomicCalendar();
  const todayNews = filterHighImpactNews(calendar);

  logger.info(`Synced news for today: ${todayNews.length} high-impact events found.`);

  // Get all groups that want news alerts and have a valid groupId configured
  const newsGroups = getAllGroups().filter(g => g.newsEnabled !== false && g.groupId);

  todayNews.forEach(newsItem => {
    const normalized = {
      event: newsItem.title || newsItem.event || 'Unknown Event',
      country: newsItem.country || '',
      date: newsItem.date,
      impact: newsItem.impact,
      estimate: newsItem.forecast || newsItem.estimate,
      previous: newsItem.previous
    };
    scheduleNewsAlert(normalized, newsGroups);
  });

  saveTodayNews(todayNews);
}

/**
 * Schedule a specific news alert 10 minutes before the event.
 * Sends to all provided groups.
 * @param {Object} newsItem
 * @param {Object[]} groups - Array of group configs to send to
 */
function scheduleNewsAlert(newsItem, groups = null) {
  const eventTime = new Date(newsItem.date).getTime();
  const now = Date.now();
  const alertLeadTime = 10 * 60 * 1000; // 10 minutes

  const alertTime = eventTime - alertLeadTime;
  const delay = alertTime - now;

  if (delay <= 0) {
    logger.info(`News event "${newsItem.event}" is too close or already passed for T-10m alert.`);
    return;
  }

  // Resolve groups if not passed (e.g. called from admin test)
  const targetGroups = groups || getAllGroups().filter(g => g.newsEnabled !== false && g.groupId);

  logger.info(`Scheduling alert for "${newsItem.event}" in ${Math.round(delay / 1000 / 60)} minutes to ${targetGroups.length} group(s).`);

  const timer = setTimeout(async () => {
    try {
      logger.info(`Triggering high-impact news alert: ${newsItem.event}`);

      for (const groupConfig of targetGroups) {
        if (!groupConfig.groupId) {
          logger.warn(`[${groupConfig.id}] Skipping news alert: groupId not configured.`);
          continue;
        }
        try {
          const result = await generateNewsTradingContent(newsItem, groupConfig);
          await sendMessage(groupConfig.groupId, result.content);
          logContent(groupConfig.id, 'news_trading', newsItem.event, result.content, 'success', {
            usage: result.usage,
            generatedAt: result.generatedAt
          });
        } catch (groupErr) {
          logger.error(`[${groupConfig.id}] Failed to send news alert for ${newsItem.event}:`, groupErr);
        }
      }

      markNewsAsSent(newsItem);
    } catch (error) {
      logger.error(`Failed to process news alert for ${newsItem.event}:`, error);
    }
  }, delay);

  activeTimers.push(timer);
}

/**
 * Clear all scheduled timers.
 */
function clearActiveTimers() {
  activeTimers.forEach(timer => clearTimeout(timer));
  activeTimers = [];
}

/**
 * Save today's news items to data folder.
 */
function saveTodayNews(news) {
  const dataPath = path.join(__dirname, '../../data/today-news.json');
  try {
    fs.writeFileSync(dataPath, JSON.stringify(news, null, 2));
  } catch (err) {
    logger.error('Failed to save today-news.json:', err);
  }
}

/**
 * Log sent news to prevent duplicates across restarts if needed.
 */
function markNewsAsSent(newsItem) {
  try {
    let log = [];
    if (fs.existsSync(NEWS_LOG_PATH)) {
      log = JSON.parse(fs.readFileSync(NEWS_LOG_PATH, 'utf8'));
    }
    log.push({
      id: `${newsItem.event}_${newsItem.date}`,
      event: newsItem.event,
      sentAt: new Date().toISOString()
    });
    fs.writeFileSync(NEWS_LOG_PATH, JSON.stringify(log.slice(-100), null, 2));
  } catch (err) {
    logger.error('Failed to log news sent status:', err);
  }
}

/**
 * Get the list of today's high-impact news from cache.
 */
function getTodayNews() {
  const dataPath = path.join(__dirname, '../../data/today-news.json');
  if (fs.existsSync(dataPath)) {
    return JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  }
  return [];
}

module.exports = {
  initNewsService,
  syncDailyNews,
  scheduleNewsAlert,
  clearActiveTimers,
  getTodayNews
};
