const { generateContent } = require('../openai');
const { fetchOHLCV, formatOHLCVForAI } = require('../services/marketData');
const { formatAnalysisPost } = require('./templates');
const { retryWithBackoff } = require('../utils/retry');
const logger = require('../logger');

/**
 * Build system prompt untuk analisis teknikal.
 * Berbeda dari konten marketing — tone objektif & edukatif, bukan brand-promotional.
 * @param {string} communityName
 * @returns {string}
 */
function buildAnalysisSystemPrompt(communityName) {
  return `Kamu adalah analis teknikal profesional untuk komunitas trading ${communityName}. Tugasmu menulis analisis teknikal singkat, objektif, dan edukatif berdasarkan data OHLCV yang diberikan. DILARANG memberikan sinyal trading langsung ("beli di...", "jual di..."), menjanjikan profit, atau membuat klaim prediktif yang berlebihan. Fokus pada edukasi pola, struktur, dan manajemen risiko.`;
}

/**
 * Core function: generate analisis teknikal dari data OHLCV menggunakan AI.
 * @param {string} symbol
 * @param {string} timeframe
 * @param {Array} candles - OHLCV array dari fetchOHLCV (ascending)
 * @param {Object|null} groupConfig
 * @returns {Promise<Object>} { content, symbol, timeframe, usage, generatedAt }
 */
async function generateAnalysis(symbol, timeframe, candles, groupConfig) {
  const communityName = groupConfig && groupConfig.brand ? groupConfig.brand.name : 'Finsfree';
  const brandConfig = groupConfig ? groupConfig.brand : null;

  const ohlcvString = formatOHLCVForAI(candles, symbol, timeframe);
  const currentPrice = candles[candles.length - 1].close;

  const systemPrompt = buildAnalysisSystemPrompt(communityName);

  const userPrompt = `
Buat analisis teknikal ${symbol} ${timeframe} berdasarkan data OHLCV berikut:

${ohlcvString}

Tulis analisis dalam format PERSIS berikut (Bahasa Indonesia, singkat & padat):

📈 <b>TREND</b>
[1-2 kalimat: arah tren berdasarkan struktur HH/HL atau LH/LL dan posisi harga]

🔷 <b>CHART PATTERN</b>
[Pola yang teridentifikasi + proyeksi singkat, atau "Belum ada pola terkonfirmasi"]

🟥🟩 <b>SUPPLY & DEMAND</b>
Supply: [zona, contoh: 2,345 – 2,352]
Demand: [zona, contoh: 2,300 – 2,308]

📍 <b>KEY LEVELS</b>
Resistance: [level] | Support: [level]

🎯 <b>BIAS: [Bullish/Bearish/Sideways]</b>
[1 kalimat alasan + kondisi yang membatalkan bias]

Ketentuan ketat:
- Maksimal 80 karakter per bagian (tidak termasuk label)
- Gunakan angka spesifik untuk semua level
- DILARANG kata "beli", "jual", "entry", "exit", atau prediksi langsung
- Jika data tidak cukup untuk identifikasi pola, tulis "Belum ada pola terkonfirmasi"
`.trim();

  try {
    logger.info(`[analysisGenerator] Generating analysis: ${symbol} ${timeframe} (${candles.length} candles)`);
    const { content, usage } = await generateContent(userPrompt, systemPrompt);
    const formattedContent = formatAnalysisPost(content, symbol, timeframe, brandConfig);

    return {
      content: formattedContent,
      usage,
      symbol,
      timeframe,
      topic: `${symbol}_${timeframe}`,
      type: 'analysis',
      generatedAt: new Date().toISOString()
    };
  } catch (error) {
    logger.error(`[analysisGenerator] AI generation failed for ${symbol} ${timeframe}:`, error);
    throw error;
  }
}

/**
 * Full pipeline: fetch OHLCV → generate analysis with retry.
 * @param {string} symbol
 * @param {string} timeframe
 * @param {Object|null} groupConfig
 * @returns {Promise<Object>}
 */
async function generateAnalysisWithRetry(symbol, timeframe, groupConfig) {
  return await retryWithBackoff(async () => {
    const candles = await fetchOHLCV(symbol, timeframe);
    return await generateAnalysis(symbol, timeframe, candles, groupConfig);
  }, 3, 2000);
}

module.exports = { generateAnalysisWithRetry };
