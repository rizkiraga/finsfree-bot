const fs = require('fs');
const path = require('path');
const logger = require('../logger');

const GROUPS_PATH = path.join(__dirname, '../../data/groups.json');
const SCHEDULE_CONFIG_PATH = path.join(__dirname, '../../data/schedule-config.json');

let cachedGroups = null;

/**
 * Build a synthetic group config from legacy single-group .env setup.
 * Used as fallback when groups.json does not exist.
 */
function buildLegacyGroup() {
  const { EDUCATION_TOPICS, PRODUCT_TOPICS, NEWSLETTER_TOPICS } = require('../content/topics');

  // Merge old schedule-config.json if present
  let scheduleOverrides = {};
  try {
    if (fs.existsSync(SCHEDULE_CONFIG_PATH)) {
      scheduleOverrides = JSON.parse(fs.readFileSync(SCHEDULE_CONFIG_PATH, 'utf8'));
    }
  } catch (err) {
    logger.warn('Could not read legacy schedule-config.json:', err.message);
  }

  const defaultSchedule = {
    education: { cron: '0 8 * * 1-5', label: 'Edukasi (Sen-Jum 08:00)' },
    product: { cron: '0 11 * * 2,4', label: 'Produk/Tips (Sel & Kam 11:00)' },
    newsletter: { cron: '0 9 * * 6', label: 'Newsletter (Sab 09:00)' },
    quick_tip: { cron: '0 15 * * 3', label: 'Quick Tips (Rab 15:00)' },
    intro: { cron: '30 12 * * *', label: 'Introducing Finsfree (Daily 12:30)' }
  };

  const schedule = { ...defaultSchedule };
  for (const [type, override] of Object.entries(scheduleOverrides)) {
    if (schedule[type]) {
      schedule[type] = { ...schedule[type], ...override };
    }
  }

  return {
    id: 'finsfree',
    groupId: process.env.TELEGRAM_GROUP_ID || '',
    enabled: true,
    brand: {
      name: 'Finsfree',
      websiteUrl: 'www.finsfree.com',
      adminHandle: '@finsfree',
      aiPersona: 'editor copywriting profesional untuk platform trading forex dan gold bernama Finsfree',
      aiDescription: 'Tugasmu adalah menulis pesan edukasi dan marketing agar sesuai dengan standar komunikasi keuangan yang bertanggung jawab.',
      forbiddenWords: [
        'kaya', 'kekayaan', 'profit pasti', 'keuntungan besar', 'cuan',
        'passive income', 'penghasilan tambahan', 'investasi menguntungkan',
        'raih keuntungan', 'modal kecil untung besar', 'hasil berlipat',
        'uang bekerja untuk Anda', 'rezeki nomplok', 'uang', 'dana'
      ],
      forbiddenPhrases: [
        'janji ROI tertentu',
        'jangan sampai ketinggalan',
        'slot terbatas',
        'trading tanpa risiko'
      ],
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
    },
    topics: {
      education: EDUCATION_TOPICS,
      product: PRODUCT_TOPICS,
      newsletter: NEWSLETTER_TOPICS
    },
    schedule,
    timezone: 'Asia/Jakarta',
    postDailyLimit: 3,
    newsEnabled: true
  };
}

/**
 * Load all groups from groups.json.
 * Falls back to legacy single-group config if the file doesn't exist.
 * @returns {Object[]}
 */
function loadGroups() {
  if (cachedGroups) return cachedGroups;

  if (!fs.existsSync(GROUPS_PATH)) {
    logger.warn('groups.json not found — falling back to legacy single-group config.');
    const legacyGroup = buildLegacyGroup();
    cachedGroups = [legacyGroup];
    return cachedGroups;
  }

  try {
    const data = JSON.parse(fs.readFileSync(GROUPS_PATH, 'utf8'));
    if (!data.groups || !Array.isArray(data.groups)) {
      throw new Error('groups.json must have a "groups" array.');
    }
    // Validate required fields
    data.groups.forEach((g, i) => {
      if (!g.id) throw new Error(`Group at index ${i} is missing "id".`);
      if (!g.groupId) {
        logger.warn(`Group "${g.id}" has no groupId set — posts will be skipped until groupId is configured.`);
      }
    });
    cachedGroups = data.groups;
    logger.info(`Loaded ${cachedGroups.length} group(s) from groups.json.`);
    return cachedGroups;
  } catch (err) {
    logger.error('Failed to load groups.json:', err.message);
    throw err;
  }
}

/**
 * Get all enabled groups.
 * @returns {Object[]}
 */
function getAllGroups() {
  return loadGroups().filter(g => g.enabled !== false);
}

/**
 * Get a group config by Telegram group ID.
 * @param {string|number} telegramGroupId
 * @returns {Object|null}
 */
function getGroupByTelegramId(telegramGroupId) {
  const id = String(telegramGroupId);
  return loadGroups().find(g => String(g.groupId) === id) || null;
}

/**
 * Get a group config by internal slug ID.
 * @param {string} groupSlug - e.g. "finsfree"
 * @returns {Object|null}
 */
function getGroupById(groupSlug) {
  return loadGroups().find(g => g.id === groupSlug) || null;
}

/**
 * Save updated schedule for a specific group back to groups.json.
 * No-op in legacy (single-group) fallback mode.
 * @param {string} groupSlug
 * @param {Object} updatedSchedule
 */
function saveGroupSchedule(groupSlug, updatedSchedule) {
  if (!fs.existsSync(GROUPS_PATH)) {
    // Legacy mode: save to old schedule-config.json for backward compat
    try {
      fs.writeFileSync(SCHEDULE_CONFIG_PATH, JSON.stringify(updatedSchedule, null, 2));
      logger.info('Saved schedule to legacy schedule-config.json.');
    } catch (err) {
      logger.error('Failed to save legacy schedule config:', err);
    }
    return;
  }

  try {
    const data = JSON.parse(fs.readFileSync(GROUPS_PATH, 'utf8'));
    const group = data.groups.find(g => g.id === groupSlug);
    if (!group) throw new Error(`Group "${groupSlug}" not found in groups.json`);
    group.schedule = updatedSchedule;
    fs.writeFileSync(GROUPS_PATH, JSON.stringify(data, null, 2));
    // Invalidate cache
    cachedGroups = null;
    logger.info(`Schedule saved for group: ${groupSlug}`);
  } catch (err) {
    logger.error('Failed to save group schedule:', err);
    throw err;
  }
}

/**
 * Clear the in-memory cache (useful after writes or in tests).
 */
function clearCache() {
  cachedGroups = null;
}

module.exports = {
  loadGroups,
  getAllGroups,
  getGroupByTelegramId,
  getGroupById,
  saveGroupSchedule,
  clearCache
};
