const axios = require('axios');
const logger = require('../logger');
const config = require('../config');

const TWELVE_BASE = 'https://api.twelvedata.com';

// Twelve Data interval mapping
const TD_INTERVAL = {
  M15: '15min',
  H1: '1h',
  H4: '4h',
  D1: '1day'
};

// Symbol mapping: internal notation → Twelve Data notation
const SYMBOL_MAP = {
  XAUUSD: 'XAU/USD',
  EURUSD: 'EUR/USD',
  GBPUSD: 'GBP/USD',
  USDJPY: 'USD/JPY',
  USDCHF: 'USD/CHF',
  AUDUSD: 'AUD/USD',
  USDCAD: 'USD/CAD',
  NZDUSD: 'NZD/USD',
  BTCUSD: 'BTC/USD',
  ETHUSD: 'ETH/USD'
};

function toTwelveSymbol(symbol) {
  return SYMBOL_MAP[symbol.toUpperCase()] || symbol;
}

/**
 * Fetch OHLCV data dari Twelve Data API.
 * @param {string} symbol - e.g. 'XAUUSD', 'EURUSD', 'BTCUSD'
 * @param {string} timeframe - 'M15' | 'H1' | 'H4' | 'D1'
 * @param {number} limit - jumlah candle yang diminta (default 35)
 * @returns {Promise<Array>} Array of { time, open, high, low, close } sorted ascending (oldest first)
 */
async function fetchOHLCV(symbol, timeframe, limit = 35) {
  const apiKey = config.twelveDataKey || process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) {
    throw new Error('TWELVE_DATA_API_KEY belum diset. Tambahkan TWELVE_DATA_API_KEY=<key> di file .env lalu restart bot.');
  }

  const interval = TD_INTERVAL[timeframe];
  if (!interval) {
    throw new Error(`Timeframe tidak didukung: ${timeframe}. Gunakan M15, H1, H4, atau D1.`);
  }

  const tdSymbol = toTwelveSymbol(symbol);

  const url = `${TWELVE_BASE}/time_series`;
  const params = {
    symbol: tdSymbol,
    interval,
    outputsize: limit,
    order: 'ASC',
    apikey: apiKey
  };

  logger.info(`[marketData] Fetching ${timeframe} OHLCV: ${symbol} (${tdSymbol}) via Twelve Data`);

  try {
    const res = await axios.get(url, { params, timeout: 12000 });
    const data = res.data;

    if (data.status === 'error') {
      throw new Error(`Twelve Data API error: ${data.message}`);
    }

    const values = data.values;
    if (!values || !Array.isArray(values) || values.length === 0) {
      throw new Error(`No data returned for ${symbol} ${timeframe} from Twelve Data`);
    }

    const candles = values.map(c => ({
      time: c.datetime,
      open: parseFloat(c.open),
      high: parseFloat(c.high),
      low: parseFloat(c.low),
      close: parseFloat(c.close)
    }));

    if (candles.length < 10) {
      throw new Error(`Data tidak cukup untuk analisa: hanya ${candles.length} candle tersedia (minimum 10). Pasar mungkin sedang tutup.`);
    }

    logger.info(`[marketData] Fetched ${candles.length} candles for ${symbol} ${timeframe}`);
    return candles;

  } catch (err) {
    if (err.response) {
      logger.error(`[marketData] Twelve Data HTTP error ${err.response.status} for ${symbol} ${timeframe}:`, err.response.data);
      throw new Error(`Twelve Data HTTP error ${err.response.status}: ${JSON.stringify(err.response.data)}`);
    }
    logger.error(`[marketData] Failed to fetch ${symbol} ${timeframe}:`, err.message);
    throw err;
  }
}

/**
 * Format OHLCV array ke string CSV compact untuk prompt AI.
 * @param {Array} candles - Array dari fetchOHLCV (ascending, oldest first)
 * @param {string} symbol
 * @param {string} timeframe
 * @returns {string}
 */
function formatOHLCVForAI(candles, symbol, timeframe) {
  const latest = candles[candles.length - 1];
  const latestTime = latest ? latest.time : 'N/A';
  const currentPrice = latest ? latest.close : 'N/A';

  const header = `Symbol: ${symbol} | TF: ${timeframe} | ${candles.length} candles | Harga terakhir: ${currentPrice} (${latestTime})\nDateTime,Open,High,Low,Close`;

  const rows = candles.slice(-30).map(c => {
    const dt = typeof c.time === 'string' ? c.time.substring(0, 16) : c.time;
    return `${dt},${c.open},${c.high},${c.low},${c.close}`;
  });

  return header + '\n' + rows.join('\n');
}

module.exports = { fetchOHLCV, formatOHLCVForAI };
