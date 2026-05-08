const { generateContent } = require('../openai');
const { formatEducationPost, formatProductPost, formatNewsletterPost, formatTipPost, formatNewsTradingPost, formatRiskManagementPost, formatPsychologyPost, formatSignalPost } = require('./templates');
const { getNextTopic } = require('./topics');
const logger = require('../logger');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * PROMPT OPTIMIZATION LOG:
 * - Education: Added "High-Value" and "Thought-Leadership" focus. Analogy is mandatory for engagement.
 * - Product: Reinforced "Soft-sell" via "Building Trust" rather than just benefits.
 * - Newsletter: Structured as a premium editorial read.
 */

/**
 * Build the brand intro system prompt from a group's brand config.
 * @param {Object} brandConfig - from groupConfig.brand
 * @returns {string}
 */
function buildBrandIntro(brandConfig) {
  const forbidden = [
    ...(brandConfig.forbiddenWords || []),
    ...(brandConfig.forbiddenPhrases || [])
  ].map(w => `"${w}"`).join(', ');

  const focus = (brandConfig.focusAreas || [])
    .map((f, i) => `${i + 1}. ${f}`)
    .join('\n');

  return `
Kamu adalah ${brandConfig.aiPersona}.
${brandConfig.aiDescription}

ATURAN KETAT - DILARANG KERAS MENGGUNAKAN KATA/FRASA BERIKUT:
${forbidden}, janji ROI tertentu, taktik urgensi ("jangan sampai ketinggalan", "slot terbatas"), atau klaim trading tanpa risiko.

FOKUS PADA HAL BERIKUT:
${focus}
`.trim();
}

/**
 * Get brand config with fallback to Finsfree defaults.
 * Allows generator functions to be called without groupConfig for backward compat.
 */
function resolveBrand(groupConfig) {
  if (groupConfig && groupConfig.brand) return groupConfig.brand;
  return {
    name: 'Finsfree',
    websiteUrl: 'www.finsfree.com',
    adminHandle: '@finsfree',
    aiPersona: 'editor copywriting profesional untuk platform trading forex dan gold bernama Finsfree',
    aiDescription: 'Tugasmu adalah menulis pesan edukasi dan marketing agar sesuai dengan standar komunikasi keuangan yang bertanggung jawab.',
    forbiddenWords: ['kaya', 'kekayaan', 'profit pasti', 'keuntungan besar', 'cuan', 'passive income', 'penghasilan tambahan', 'investasi menguntungkan', 'raih keuntungan', 'modal kecil untung besar', 'hasil berlipat', 'uang bekerja untuk Anda', 'rezeki nomplok', 'uang', 'dana'],
    forbiddenPhrases: ['janji ROI tertentu', 'jangan sampai ketinggalan', 'slot terbatas', 'trading tanpa risiko'],
    focusAreas: [
      'Pengenalan platform (cara kerja, integrasi MT4/MT5, koneksi VPS).',
      'Teknologi & Fitur (kecepatan eksekusi, uptime server, grafik, indikator, copy trading otomatis).',
      'Kemudahan & Dukungan (antarmuka mobile, akses 24 jam, customer support responsif, edukasi, live streaming TikTok).',
      'Instrumen & Keamanan (Forex, Gold/XAUUSD, broker teregulasi, keamanan akun, perlindungan nasabah).'
    ],
    introProblems: [
      'Trader sering terjebak emosi dan FOMO saat market bergerak cepat.',
      'Banyak trader kesulitan membagi waktu antara pekerjaan dan memantau chart 24/7.',
      'Eksekusi order yang lambat sering kali membuat trader kehilangan momentum harga terbaik.',
      'Kurangnya disiplin dalam menjaga rencana trading sering berujung pada kerugian yang tidak perlu.',
      'Analisis teknikal yang terlalu rumit sering membuat trader bingung mengambil keputusan.'
    ],
    productMentions: 'EA Selia/Ausen, sinyal AI, copy trading otomatis'
  };
}

/**
 * Generate educational content using AI.
 * @param {string} topic
 * @param {Object} groupConfig - Full group config object
 */
async function generateEducationContent(topic, groupConfig) {
  const brand = resolveBrand(groupConfig);
  const brandIntro = buildBrandIntro(brand);

  const systemPrompt = `Anda adalah copywriting expert ${brand.name}. Gaya bahasa Anda friendly, santai, tapi professional dan persuasif (unsur brainwash halus). ${brandIntro}`;

  const solutionCtx = brand.solutionContext || brand.name;

  const userPrompt = `
Buatlah pesan singkat mengenai "${topic}" dengan pola:
1. MASALAH: Sebutkan tantangan teknikal/psikologis trader terkait topik ini.
2. SOLUSI: Jelaskan bagaimana ${solutionCtx} membantu mengatasinya.
3. HARAPAN: Kesimpulan tentang pentingnya trading komprehensif dan terukur.

Ketentuan:
- MAKSIMAL 200 karakter. Sangat pendek & padat!
- Gunakan Bahasa Indonesia professional dan informatif.
- TULIS SEBAGAI SATU NARIASI MENGALIR (1-2 paragraf pendek).
- DILARANG KERAS menggunakan subjudul seperti "MASALAH:", "SOLUSI:", atau "HARAPAN:".
- Dilarang menjanjikan profit. Fokus pada manajemen risiko.
- DILARANG menyebut brand, produk, atau fitur dari kompetitor manapun.
  `.trim();

  try {
    logger.info(`Generating education content for: ${topic}`);
    const { content, usage } = await generateContent(userPrompt, systemPrompt);
    const formattedContent = formatEducationPost(content, topic, brand);

    return {
      content: formattedContent,
      usage,
      topic: topic,
      type: 'education',
      generatedAt: new Date().toISOString()
    };
  } catch (error) {
    logger.error(`Error in generateEducationContent:`, error);
    throw error;
  }
}

/**
 * Generate product promotion content using AI.
 * @param {string} productName
 * @param {string} aspect
 * @param {Object} groupConfig - Full group config object
 */
async function generateProductContent(productName, aspect, groupConfig) {
  const brand = resolveBrand(groupConfig);
  const brandIntro = buildBrandIntro(brand);

  const systemPrompt = `Anda adalah copywriting expert ${brand.name}. Gaya bahasa Anda friendly, persuasif, dan professional. ${brandIntro}`;

  const solutionCtx = brand.solutionContext || brand.name;

  const userPrompt = `
Buatlah pesan objektif untuk "${productName}" milik ${brand.name} (Fokus: ${aspect}) dengan pola:
1. MASALAH: Kendala yang dihadapi trader tanpa solusi ini.
2. SOLUSI: Bagaimana "${productName}" dalam konteks ${solutionCtx} menyelesaikannya.
3. HARAPAN: Harapan akan trading yang lebih disiplin dan terukur.

Ketentuan:
- MAKSIMAL 200 karakter. Sangat pendek!
- TULIS SEBAGAI SATU NARIASI MENGALIR.
- DILARANG KERAS menggunakan subjudul seperti "MASALAH:", "SOLUSI:", atau "HARAPAN:".
- Dilarang unsur hard-selling licik. Harus edukatif dan transparan.
- DILARANG menyebut brand, produk, atau fitur dari kompetitor manapun.
  `.trim();

  try {
    logger.info(`Generating product content for: ${productName}`);
    const { content, usage } = await generateContent(userPrompt, systemPrompt);
    const formattedContent = formatProductPost(content, productName, brand);

    return {
      content: formattedContent,
      usage,
      topic: productName,
      type: 'product',
      aspect: aspect,
      generatedAt: new Date().toISOString()
    };
  } catch (error) {
    logger.error(`Error in generateProductContent:`, error);
    throw error;
  }
}

/**
 * Generate weekly newsletter content or tip.
 * @param {string} topic
 * @param {string|number} weekNumber
 * @param {Object} groupConfig - Full group config object
 */
async function generateNewsletterContent(topic, weekNumber, groupConfig) {
  const brand = resolveBrand(groupConfig);
  const brandIntro = buildBrandIntro(brand);

  const systemPrompt = `Anda adalah Editor ${brand.name}. Friendly, persuasif, professional. ${brandIntro}`;

  const solutionCtx = brand.solutionContext || brand.name;

  const userPrompt = `
Buat ringkasan newsletter edukasi mengenai "${topic}" untuk Week #${weekNumber}.
Pola: Problem market -> Insight objektif dari perspektif ${solutionCtx} -> Kesimpulan rasional.
Ketentuan:
- MAKSIMAL 200 karakter. Sangat padat, profesional, tanpa janji profit.
- TULIS SEBAGAI SATU NARIASI MENGALIR. DILARANG menggunakan subjudul (seperti "MASALAH", "SOLUSI", dll).
- DILARANG menyebut brand, produk, atau fitur dari kompetitor manapun.
  `.trim();

  try {
    logger.info(`Generating newsletter summary for issue #${weekNumber}`);
    const { content, usage } = await generateContent(userPrompt, systemPrompt);
    const formattedContent = formatNewsletterPost(content, weekNumber, brand);

    return {
      content: formattedContent,
      usage,
      topic: topic,
      type: 'newsletter',
      weekNumber: weekNumber,
      generatedAt: new Date().toISOString()
    };
  } catch (error) {
    logger.error(`Error in generateNewsletterContent:`, error);
    throw error;
  }
}

/**
 * Generate quick tips.
 * @param {string} topic
 * @param {Object} groupConfig - Full group config object
 */
async function generateQuickTip(topic, groupConfig) {
  const brand = resolveBrand(groupConfig);
  const brandIntro = buildBrandIntro(brand);

  const systemPrompt = `Anda adalah asisten ${brand.name}. Friendly & Professional. ${brandIntro}`;

  const solutionCtx = brand.solutionContext || brand.name;

  const userPrompt = `
Berikan 1 tip trading tentang "${topic}" yang relevan untuk komunitas ${brand.name}.
Pola: Masalah trader -> Solusi via ${solutionCtx} -> Tujuan trading yang lebih disiplin.
Ketentuan:
- MAKSIMAL 200 karakter. Edukatif, tanpa iming-iming cuan.
- TULIS SEBAGAI SATU NARIASI MENGALIR. DILARANG menggunakan subjudul/label apapun.
- DILARANG menyebut brand, produk, atau fitur dari kompetitor manapun.
  `.trim();

  try {
    logger.info(`Generating quick tip for: ${topic}`);
    const { content, usage } = await generateContent(userPrompt, systemPrompt);
    const formattedContent = formatTipPost(content, brand);

    return {
      content: formattedContent,
      usage,
      topic: topic,
      type: 'quick_tip',
      generatedAt: new Date().toISOString()
    };
  } catch (error) {
    logger.error(`Error in generateQuickTip:`, error);
    throw error;
  }
}

/**
 * Generate punchy tip.
 * @param {Object} groupConfig - Full group config object
 */
async function generateTipContent(groupConfig) {
  const brand = resolveBrand(groupConfig);
  const brandIntro = buildBrandIntro(brand);

  const systemPrompt = `Anda adalah asisten ${brand.name}. Friendly & Professional. ${brandIntro}`;

  const solutionCtx = brand.solutionContext || brand.name;
  const focusSample = (brand.focusAreas || []).slice(0, 2).map(f => f.split(':')[0]).join(' & ') || 'manajemen risiko';

  const userPrompt = `
Buat 1 tip manajemen risiko atau disiplin trading yang relevan untuk komunitas ${brand.name}.
Konteks ${brand.name}: ${solutionCtx}.
Fokus pada: ${focusSample}.
Ketentuan:
- MAKSIMAL 150 karakter. Dilarang menjanjikan kekayaan atau profit.
- TULIS SEBAGAI SATU KALIMAT/PARAGRAF MENGALIR. DILARANG menggunakan subjudul.
- DILARANG menyebut brand, produk, atau fitur dari kompetitor manapun.
  `.trim();

  try {
    logger.info('Generating daily tip');
    const { content, usage } = await generateContent(userPrompt, systemPrompt);
    const formattedContent = formatTipPost(content, brand);

    return {
      content: formattedContent,
      usage,
      type: 'tip',
      generatedAt: new Date().toISOString()
    };
  } catch (error) {
    logger.error('Error in generateTipContent:', error);
    throw error;
  }
}

/**
 * Generate Risk Management education content.
 * @param {string} topic
 * @param {Object} groupConfig
 */
async function generateRiskManagementContent(topic, groupConfig) {
  const brand = resolveBrand(groupConfig);
  const brandIntro = buildBrandIntro(brand);

  const systemPrompt = `Anda adalah mentor manajemen risiko ${brand.name}. Gaya bahasa tegas, praktis, dan profesional. ${brandIntro}`;

  const userPrompt = `
Buatlah pesan edukasi singkat tentang manajemen risiko trading: "${topic}"

Ketentuan:
- MAKSIMAL 200 karakter. Sangat padat dan actionable.
- Fokus pada satu prinsip praktis yang bisa langsung diterapkan trader.
- TULIS SEBAGAI SATU NARASI MENGALIR (1-2 paragraf pendek).
- DILARANG menggunakan subjudul seperti "TIPS:", "CATATAN:", dll.
- Dilarang menjanjikan profit. Fokus pada perlindungan modal.
- Bahasa Indonesia profesional dan tegas.
  `.trim();

  try {
    logger.info(`Generating risk management content for: ${topic}`);
    const { content, usage } = await generateContent(userPrompt, systemPrompt);
    const formattedContent = formatRiskManagementPost(content, topic, brand);

    return {
      content: formattedContent,
      usage,
      topic,
      type: 'risk_management',
      generatedAt: new Date().toISOString()
    };
  } catch (error) {
    logger.error('Error in generateRiskManagementContent:', error);
    throw error;
  }
}

/**
 * Generate Psychology education content.
 * @param {string} topic
 * @param {Object} groupConfig
 */
async function generatePsychologyContent(topic, groupConfig) {
  const brand = resolveBrand(groupConfig);
  const brandIntro = buildBrandIntro(brand);

  const systemPrompt = `Anda adalah psikolog trading dan mentor ${brand.name}. Gaya bahasa empatik, reflektif, dan profesional. ${brandIntro}`;

  const userPrompt = `
Buatlah pesan edukasi singkat tentang psikologi trading: "${topic}"

Ketentuan:
- MAKSIMAL 200 karakter. Sangat padat dan relatable.
- Fokus pada satu insight psikologi yang membantu trader lebih disiplin.
- TULIS SEBAGAI SATU NARASI MENGALIR (1-2 paragraf pendek).
- DILARANG menggunakan subjudul seperti "TIPS:", "CATATAN:", dll.
- Dilarang menjanjikan profit. Fokus pada pola pikir dan pengendalian emosi.
- Bahasa Indonesia profesional, empatik, dan menginspirasi.
  `.trim();

  try {
    logger.info(`Generating psychology content for: ${topic}`);
    const { content, usage } = await generateContent(userPrompt, systemPrompt);
    const formattedContent = formatPsychologyPost(content, topic, brand);

    return {
      content: formattedContent,
      usage,
      topic,
      type: 'psychology',
      generatedAt: new Date().toISOString()
    };
  } catch (error) {
    logger.error('Error in generatePsychologyContent:', error);
    throw error;
  }
}

/**
 * Generate specific copywriting for Introducing [Brand].
 * @param {Object} groupConfig - Full group config object
 */
async function generateIntroContent(groupConfig) {
  const brand = resolveBrand(groupConfig);
  const brandIntro = buildBrandIntro(brand);

  const systemPrompt = `Anda adalah Brand Ambassador ${brand.name}. Gaya bahasa friendly, persuasif, professional. ${brandIntro}`;

  const introProblems = brand.introProblems || [
    'Trader sering terjebak emosi dan FOMO saat market bergerak cepat.'
  ];
  const selectedProblem = introProblems[Math.floor(Math.random() * introProblems.length)];

  const productMentions = brand.productMentions || brand.name;

  const userPrompt = `
Buatlah pesan pengenalan ${brand.name} yang berfokus pada solusi untuk masalah ini: "${selectedProblem}"

Cara kerja:
- Jelaskan masalah tersebut secara singkat dan empatik.
- Berikan solusi nyata melalui fitur/produk ${brand.name} (seperti ${productMentions}).
- Akhiri dengan ajakan untuk beralih ke cara trading yang lebih sistematis.

Ketentuan:
- MAKSIMAL 180 karakter.
- TULIS SEBAGAI SATU NARIASI MENGALIR.
- DILARANG KERAS menggunakan subjudul seperti "MASALAH:", "SOLUSI:", atau "HARAPAN:".
- DILARANG menyebutkan kata "keamanan" atau perihal safety/security dana.
- Bahasa Indonesia profesional, informatif, dan bervariatif.
- Dilarang keras menggunakan kata-kata hype/janji profit.

Format output (WAJIB):
[ISI PESAN]
  `.trim();

  try {
    logger.info(`Generating Introducing ${brand.name} content based on problem: ${selectedProblem.substring(0, 30)}...`);
    const { content, usage } = await generateContent(userPrompt, systemPrompt);
    const formattedContent = formatEducationPost(content, `Introducing ${brand.name}`, brand);

    return {
      content: formattedContent,
      usage,
      topic: 'Intro',
      type: 'intro',
      generatedAt: new Date().toISOString()
    };
  } catch (error) {
    logger.error('Error in generateIntroContent:', error);
    throw error;
  }
}

/**
 * Generate actual trading signal for a specific pair using real OHLCV data.
 * @param {string} pair - e.g. 'XAUUSD', 'EURUSD'
 * @param {Object} groupConfig
 */
async function generateSignalContent(pair, groupConfig) {
  const brand = resolveBrand(groupConfig);
  const { fetchOHLCV, formatOHLCVForAI } = require('../services/marketData');

  const candles = await fetchOHLCV(pair, 'H1');
  const ohlcvString = formatOHLCVForAI(candles, pair, 'H1');
  const currentPrice = candles[candles.length - 1].close;

  const systemPrompt = `Kamu adalah analis teknikal profesional yang menghasilkan sinyal trading berdasarkan data OHLCV aktual. Semua level harga (entry, SL, TP) HARUS bersumber dari struktur data yang diberikan, bukan perkiraan. Jangan berikan jaminan profit.`;

  const userPrompt = `
Berdasarkan data OHLCV ${pair} H1 berikut, buat sinyal trading:

${ohlcvString}

Output HANYA dalam format ini (tanpa teks lain):

📈 Arah: [BUY atau SELL]
🎯 Entry: [range harga berdasarkan level aktual]
🔴 SL: [harga stop loss di swing high/low terdekat]
✅ TP1: [harga take profit 1 di resistance/support terdekat]
✅ TP2: [harga take profit 2 di resistance/support berikutnya]
📝 [1 kalimat alasan teknikal dari data, max 100 karakter]

Harga terakhir: ${currentPrice}. Semua level wajib berdasarkan struktur data aktual.
  `.trim();

  try {
    logger.info(`Generating signal content for: ${pair} (current price: ${currentPrice})`);
    const { content, usage } = await generateContent(userPrompt, systemPrompt);
    const formattedContent = formatSignalPost(content, pair, brand);

    return {
      content: formattedContent,
      usage,
      topic: pair,
      type: 'signal',
      generatedAt: new Date().toISOString()
    };
  } catch (error) {
    logger.error(`Error in generateSignalContent:`, error);
    throw error;
  }
}

/**
 * Generate specific copywriting for News Trading alerts.
 * @param {Object} newsItem
 * @param {Object} groupConfig - Full group config object
 */
async function generateNewsTradingContent(newsItem, groupConfig) {
  const brand = resolveBrand(groupConfig);
  const brandIntro = buildBrandIntro(brand);

  const systemPrompt = `Anda adalah Analis Fundamental ${brand.name}. Gaya bahasa friendly, persuasif, professional. ${brandIntro}`;

  const forecast = newsItem.estimate || newsItem.forecast || 'N/A';
  const previous = newsItem.previous || 'N/A';

  const userPrompt = `
Buat analisis kilat news: "${newsItem.event}".
Forecast: ${forecast}, Previous: ${previous}.

FORMAT (WAJIB):
Tulis satu paragraf penjelasan singkat (masalah & insight fundamental).
Lalu diakhiri dengan baris baru:
POTENSI: [Turun/Naik]

Ketentuan:
- MAKSIMAL 350 karakter.
- Tanpa judul seperti "ISSUE" atau "KONSPIRASI". Langsung ke penjelasan.
- Bahasa Indonesia jurnalistik, padat, dan persuasif.
  `.trim();

  try {
    logger.info(`Generating news trading content for: ${newsItem.event}`);
    const { content, usage } = await generateContent(userPrompt, systemPrompt);
    const formattedContent = formatNewsTradingPost(content, newsItem, brand);

    return {
      content: formattedContent,
      usage,
      topic: newsItem.event,
      type: 'news_trading',
      generatedAt: new Date().toISOString()
    };
  } catch (error) {
    logger.error('Error in generateNewsTradingContent:', error);
    throw error;
  }
}

/**
 * Newsletter function that can accept data from scheduler/admin.
 * @param {string|number} weekNumber
 * @param {string} highlights
 * @param {Object} groupConfig - Full group config object
 */
async function generateWeeklyNewsletter(weekNumber, highlights, groupConfig) {
  const topic = highlights || 'Market Update & Community Highlights';
  return generateNewsletterContent(topic, weekNumber || 'TBA', groupConfig);
}

const { retryWithBackoff } = require('../utils/retry');

/**
 * High-level function to generate content with automatic retries and topic rotation on failure.
 * @param {string} type - 'education', 'product', 'newsletter', 'tip', 'quick_tip', or 'intro'.
 * @param {Object} options - Additional options (e.g., aspect for product, weekNumber for newsletter).
 * @param {Object} groupConfig - Full group config object (optional, falls back to Finsfree defaults).
 * @returns {Promise<Object>}
 */
async function generateContentWithRetry(type, options = {}, groupConfig = null) {
  const groupTopics = groupConfig && groupConfig.topics ? groupConfig.topics : null;
  const groupId = groupConfig ? groupConfig.id : null;

  return await retryWithBackoff(async () => {
    switch (type) {
      case 'education': {
        const topic = getNextTopic('EDUCATION_TOPICS', groupTopics ? groupTopics.education : null, groupId);
        if (!topic) throw new Error('No available education topics (cooldown).');
        return await generateEducationContent(topic, groupConfig);
      }
      case 'product': {
        const productName = getNextTopic('PRODUCT_TOPICS', groupTopics ? groupTopics.product : null, groupId);
        if (!productName) throw new Error('No available product names (cooldown).');
        const aspect = options.aspect || 'manfaat';
        return await generateProductContent(productName, aspect, groupConfig);
      }
      case 'newsletter': {
        const topic = getNextTopic('NEWSLETTER_TOPICS', groupTopics ? groupTopics.newsletter : null, groupId);
        if (!topic) throw new Error('No available newsletter topics (cooldown).');
        const weekNumber = options.weekNumber || null;
        return await generateNewsletterContent(topic, weekNumber, groupConfig);
      }
      case 'tip': {
        return await generateTipContent(groupConfig);
      }
      case 'quick_tip': {
        const topic = options.topic || getNextTopic('EDUCATION_TOPICS', groupTopics ? groupTopics.education : null, groupId) || '[TOPIK UMUM]';
        return await generateQuickTip(topic, groupConfig);
      }
      case 'risk_management': {
        const topic = getNextTopic('RISK_MANAGEMENT_TOPICS', groupTopics ? groupTopics.risk_management : null, groupId);
        if (!topic) throw new Error('No available risk management topics (cooldown).');
        return await generateRiskManagementContent(topic, groupConfig);
      }
      case 'psychology': {
        const topic = getNextTopic('PSYCHOLOGY_TOPICS', groupTopics ? groupTopics.psychology : null, groupId);
        if (!topic) throw new Error('No available psychology topics (cooldown).');
        return await generatePsychologyContent(topic, groupConfig);
      }
      case 'intro': {
        return await generateIntroContent(groupConfig);
      }
      case 'signal': {
        // Sinyal trading relevan setiap hari — cooldown 1 hari cukup untuk mencegah duplikasi dalam 1 hari
        const pair = getNextTopic('SIGNAL_TOPICS', groupTopics ? groupTopics.signal : null, groupId, 1);
        if (!pair) throw new Error('No available signal pairs (cooldown).');
        return await generateSignalContent(pair, groupConfig);
      }
      default:
        throw new Error(`Invalid content type: ${type}`);
    }
  }, 3, 2000); // 3 retries, 2s base delay
}

module.exports = {
  generateEducationContent,
  generateProductContent,
  generateNewsletterContent,
  generateWeeklyNewsletter,
  generateTipContent,
  generateQuickTip,
  generateNewsTradingContent,
  generateIntroContent,
  generateRiskManagementContent,
  generatePsychologyContent,
  generateSignalContent,
  generateContentWithRetry,
  resolveBrand,
  buildBrandIntro
};
