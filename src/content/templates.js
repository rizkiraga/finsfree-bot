/**
 * Telegram Post Templates
 * All functions accept a brandConfig object: { websiteUrl, adminHandle, name }
 * Falls back to Finsfree defaults if brandConfig is not provided (backward compat).
 */

const DEFAULT_BRAND = {
  name: 'Finsfree',
  websiteUrl: 'www.finsfree.com',
  adminHandle: '@finsfree'
};

function getFooter(brandConfig) {
  const brand = brandConfig || DEFAULT_BRAND;
  const lines = ['—————'];
  if (brand.websiteUrl) lines.push(`🌐 ${brand.websiteUrl}`);
  if (brand.adminHandle) lines.push(`📩 Admin: ${brand.adminHandle}`);
  return lines.join('\n');
}

/**
 * Format Educational Post
 */
function formatEducationPost(content, topic, brandConfig) {
  const brand = brandConfig || DEFAULT_BRAND;
  const displayTopic = topic === `Introducing ${brand.name}` ? brand.name.toUpperCase() : topic.toUpperCase();
  return `
🎓 <b>${displayTopic}</b>

${content}

${getFooter(brand)}
  `.trim();
}

/**
 * Format Product Promotion Post
 */
function formatProductPost(content, productName, brandConfig) {
  return `
💎 <b>${productName.toUpperCase()}</b>

${content}

${getFooter(brandConfig)}
  `.trim();
}

/**
 * Format Weekly Newsletter Post
 */
function formatNewsletterPost(content, weekNumber, brandConfig) {
  const header = weekNumber && weekNumber !== 'TBA' ? `NEWSLETTER #${weekNumber}` : 'NEWSLETTER';
  return `
📨 <b>${header}</b>

${content}

${getFooter(brandConfig)}
  `.trim();
}

/**
 * Format Short Financial Tip Post
 */
function formatTipPost(content, brandConfig) {
  return `
💡 <b>TIPS HARI INI</b>

${content}

${getFooter(brandConfig)}
  `.trim();
}

/**
 * Format News Trading Alert Post
 */
function formatNewsTradingPost(content, newsItem, brandConfig) {
  const country = newsItem.country ? ` [${newsItem.country.toUpperCase()}]` : '';
  return `
🚨 <b>NEWS: ${newsItem.event.toUpperCase()}${country}</b>

${content}

📊 <b>IMP:</b> High Impact
${getFooter(brandConfig)}
  `.trim();
}

/**
 * Format Risk Management Education Post
 */
function formatRiskManagementPost(content, topic, brandConfig) {
  const brand = brandConfig || DEFAULT_BRAND;
  return `
⚖️ <b>RISK MANAGEMENT</b>
<i>${topic.split(' — ')[0]}</i>

${content}

${getFooter(brand)}
  `.trim();
}

/**
 * Format Psychology Education Post
 */
function formatPsychologyPost(content, topic, brandConfig) {
  const brand = brandConfig || DEFAULT_BRAND;
  return `
🧠 <b>PSIKOLOGI TRADING</b>
<i>${topic.split(' — ')[0]}</i>

${content}

${getFooter(brand)}
  `.trim();
}

/**
 * Format Trading Analysis Post
 * @param {string} analysisContent - Raw AI output (structured text)
 * @param {string} symbol - e.g. 'XAUUSD'
 * @param {string} timeframe - 'M15' | 'H1' | 'H4' | 'D1'
 * @param {Object} brandConfig
 */
function formatAnalysisPost(analysisContent, symbol, timeframe, brandConfig) {
  const brand = brandConfig || DEFAULT_BRAND;
  const tfLabel = { M15: 'M15', H1: 'H1', H4: 'H4', D1: 'Daily' }[timeframe] || timeframe;
  const now = new Date().toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
  });

  return `
📊 <b>ANALISIS — ${symbol} (${tfLabel})</b>
<i>${now} WIB</i>

${analysisContent}

⚠️ <i>Bukan sinyal trading. Selalu gunakan manajemen risiko.</i>
${getFooter(brand)}
  `.trim();
}

/**
 * Format Signal Trading Post
 */
function formatSignalPost(content, pair, brandConfig) {
  const brand = brandConfig || DEFAULT_BRAND;
  const now = new Date().toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
  });
  return `
📡 <b>SIGNAL TRADING — ${pair}</b>
<i>${now} WIB</i>

${content}

⚠️ <i>Bukan rekomendasi finansial. Selalu gunakan manajemen risiko.</i>
${getFooter(brand)}
  `.trim();
}

module.exports = {
  formatEducationPost,
  formatProductPost,
  formatNewsletterPost,
  formatTipPost,
  formatNewsTradingPost,
  formatAnalysisPost,
  formatRiskManagementPost,
  formatPsychologyPost,
  formatSignalPost
};
