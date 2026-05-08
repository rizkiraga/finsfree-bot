const axios = require('axios');
const logger = require('../logger');

/**
 * Fetch economic calendar directly from Forex Factory public XML feed.
 * No API key required. Returns today's high-impact events.
 * 
 * Forex Factory provides a weekly JSON/XML that can be parsed.
 * We use their public calendar page with JSON-like response via user-agent spoofing.
 */

async function fetchForexFactoryCalendar() {
  try {
    logger.info('Fetching Forex Factory economic calendar...');

    // Forex Factory exposes a JSON-friendly version of the calendar when requested
    const todayStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    const response = await axios.get('https://nfs.faireconomy.media/ff_calendar_thisweek.json', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; FinsfreeBot/1.0)',
        'Accept': 'application/json'
      },
      timeout: 10000
    });

    if (!Array.isArray(response.data)) {
      logger.error('Invalid response from Forex Factory calendar');
      return [];
    }

    logger.info(`Fetched ${response.data.length} total events from Forex Factory`);
    return response.data;
  } catch (error) {
    logger.error('Error fetching Forex Factory calendar:', error.message);
    return [];
  }
}

/**
 * Filter only High Impact events for today.
 * Forex Factory uses 'impact' field: 'High', 'Medium', 'Low', 'Holiday'
 * Date format: 'YYYY-MM-DDThh:mm:ss' (UTC)
 */
function filterHighImpactNews(calendar) {
  if (!Array.isArray(calendar)) return [];

  // Get current date string in Asia/Jakarta timezone
  const options = { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' };
  const todayStr = new Date().toLocaleDateString('en-CA', options); // Format: YYYY-MM-DD

  return calendar.filter(event => {
    // Check high impact
    const isHigh = event.impact && event.impact.toLowerCase() === 'high';
    if (!isHigh) return false;

    // Convert event date to Jakarta date string for comparison
    try {
      const eventDate = new Date(event.date);
      const eventDayStr = eventDate.toLocaleDateString('en-CA', options);
      return eventDayStr === todayStr;
    } catch (e) {
      return false;
    }
  });
}

/**
 * Normalize FF event to our standard format.
 * FF event structure: { title, country, date, impact, forecast, previous }
 */
function normalizeEvent(ffEvent) {
  return {
    event: ffEvent.title || 'Unknown Event',
    country: ffEvent.country || '',
    date: ffEvent.date,          // ISO datetime string
    impact: ffEvent.impact,      // 'High', 'Medium', 'Low'
    estimate: ffEvent.forecast,  // Forecast value
    previous: ffEvent.previous,  // Previous value
    actual: ffEvent.actual       // Actual value (after release)
  };
}

module.exports = {
  fetchEconomicCalendar: fetchForexFactoryCalendar,
  filterHighImpactNews,
  normalizeEvent
};
