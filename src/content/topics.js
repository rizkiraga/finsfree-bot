const EDUCATION_TOPICS = [
  'Fear of Missing Out (FOMO) — Kenapa trader ikut-ikutan entry tanpa analisis dan cara menghentikannya',
  'Revenge Trading — Bahaya balas dendam ke market setelah loss dan pola pikir yang harus diganti',
  'Overconfidence Bias — Kenapa setelah profit beruntun trader jadi ceroboh dan cara tetap rendah hati',
  'Loss Aversion — Mengapa rasa sakit dari loss lebih kuat dari kesenangan profit, dan dampaknya ke keputusan trading',
  'Analysis Paralysis — Terlalu banyak indikator sampai tidak bisa entry — tanda dan solusinya',
  'Cutting Profits Too Early — Kebiasaan close profit kecil karena takut berbalik, padahal setup masih valid',
  'Letting Losses Run — Kenapa trader sering menahan posisi minus berharap berbalik, dan cara disiplin cut loss',
  'Trading Plan vs Trading Emotion — Perbedaan trader yang punya rencana vs yang trading berdasarkan perasaan',
  'The Gambler\'s Fallacy — Menganggap setelah 3x loss berturut-turut "pasti profit berikutnya" — ini berbahaya',
  'Confirmation Bias — Mencari informasi yang hanya membenarkan posisi yang sudah terlanjur dibuka',
  'Mengelola Emosi Saat Drawdown — Cara tetap tenang dan objektif ketika akun sedang dalam kondisi merugi',
  'Perbedaan Percaya Diri vs Arogan dalam Trading — Tanda-tanda trader mulai arogan dan mengabaikan risk management',
  'Journaling Trading — Kenapa mencatat setiap trade adalah latihan psikologi terpenting yang sering diabaikan',
  'Mindset Kalah dengan Bermartabat — Cara menerima loss sebagai biaya berbisnis, bukan kegagalan pribadi',
  'Screen Time Berlebihan — Terlalu lama menatap chart membuat keputusan lebih emosional, bukan lebih baik',
  'Attachment to Positions — Kenapa trader "jatuh cinta" dengan posisinya sendiri dan susah objektif',
  'Ekspektasi Realistis dalam Trading — Bahaya mengejar target profit tidak masuk akal dan cara set ekspektasi sehat',
  'Rutinitas Mental Sebelum Trading — Ritual pre-trading session untuk memastikan kondisi psikologis optimal',
  'Kapan Harus Berhenti Trading Hari Ini — Tanda-tanda kondisi mental tidak fit untuk trading dan pentingnya tahu kapan stop',
  'Membangun Disiplin Jangka Panjang — Trading bukan sprint, cara membangun konsistensi mental selama berbulan-bulan'
];

// Fallback topics — hanya digunakan jika grup tidak mendefinisikan topik sendiri di groups.json.
// Ini adalah topik default Finsfree. Low & High selalu menggunakan topik dari groups.json.
const PRODUCT_TOPICS = [
  'Selia Gold EA — Structured Execution Logic for Intelligent Automation (Sistem Otomatis Berbasis Struktur Pasar)',
  'Ausen Gold EA — Terpadu untuk Eksekusi & Navigasi (Sistem Disiplin & Konsisten)',
  'Signal AI Pro — Next-Generation AI Market Intelligence untuk Analisis Instan & Wawasan Otomatis',
  'Custom AI Indicator Trading — Sistem analisis terintegrasi dengan sinyal visual cerdas (Panah & Notifikasi)',
  'Finsfree Ecosystem — Bagaimana EA, Sinyal, dan Komunitas bekerja sama untuk pertumbuhan yang sehat',
  'Trading Tanpa Emosi dengan Selia — Keunggulan eksekusi sistematis berbasis aturan',
  'Stabilitas vs Emosi — Mengapa sistem AUSEN lebih stabil daripada keputusan manusia',
  'Market Intelligence dengan Signal AI Pro — Penentuan waktu cerdas untuk bertindak percaya diri',
  'Finsfree Mobile — Trading kapan saja dengan antarmuka yang intuitif dan responsif',
  'Copy Trading Otomatis Finsfree — Ikuti strategi trader berpengalaman secara sistematis',
  'Finsfree VPS Trading — Eksekusi 24 jam tanpa gangguan koneksi internet lokal'
];

const NEWSLETTER_TOPICS = [
  'Stop the FOMO: Mengapa SELIA Gold EA Adalah Jawaban untuk Eksekusi Tanpa Emosi',
  'Beating Revenge Trading: Bagaimana Sistem AUSEN Menjaga Disiplin Saat Market Bergejolak',
  'Analysis Paralysis? Signal AI Pro Membantu Anda Mengambil Keputusan dengan Percaya Diri',
  'Psikologi Drawdown: Cara Tetap Tenang dengan Dukungan Ekosistem Finsfree',
  'Disiplin Jangka Panjang: Membangun Konsistensi Melalui Journaling di Platform Finsfree',
  'Masa Depan Trading: Kolaborasi Antara Kecerdasan Buatan (AI) dan Finsfree Ecosystem',
  'Overconfidence Bias: Kenapa Trader Pro Tetap Disiplin Menggunakan Sistem Finsfree'
];

const { getRecentTopics } = require('../utils/contentLog');

const TOPICS = {
  EDUCATION_TOPICS,
  PRODUCT_TOPICS,
  NEWSLETTER_TOPICS
};

const COOLDOWN_DAYS = 14;

/**
 * Get the next available topic for a specific type, avoiding recently used ones.
 * Supports both legacy single-group and multi-group usage.
 *
 * @param {string} type - Key from TOPICS object (e.g., 'EDUCATION_TOPICS') OR simple key (e.g., 'education')
 * @param {string[]|null} groupTopics - Optional array of topics from group config. Falls back to hardcoded TOPICS.
 * @param {string|null} groupId - Group slug for per-group cooldown tracking. Null = legacy global log.
 * @returns {string|null} - The selected topic or null if all are in cooldown
 */
function getNextTopic(type, groupTopics = null, groupId = null, cooldownDays = COOLDOWN_DAYS) {
  // Normalize type: accept both 'EDUCATION_TOPICS' and 'education'
  const normalizedKey = type.includes('_TOPICS') ? type : `${type.toUpperCase()}_TOPICS`;

  // Resolve topic list: prefer group-specific topics, fall back to hardcoded
  let allTopics = groupTopics;
  if (!allTopics) {
    allTopics = TOPICS[normalizedKey];
  }

  if (!allTopics) {
    throw new Error(`Invalid topic type: ${type}`);
  }

  // Map to log type string (e.g., 'EDUCATION_TOPICS' -> 'education')
  const logType = normalizedKey.replace('_TOPICS', '').toLowerCase();

  // Get recently used topics — group-aware if groupId provided
  const usedTopicsArray = getRecentTopics(groupId, logType, cooldownDays);

  // Filter out topics used within the cooldown period
  const availableTopics = allTopics.filter(topic => !usedTopicsArray.includes(topic));

  if (availableTopics.length === 0) {
    return null; // All topics are currently in cooldown
  }

  // Pick a random topic from the available ones
  const randomIndex = Math.floor(Math.random() * availableTopics.length);
  return availableTopics[randomIndex];
}

/**
 * Check how many topics are available (not in cooldown) for a given type.
 * @param {string} type - e.g. 'signal', 'education', 'risk_management'
 * @param {string[]|null} groupTopics - Group-specific topic list (falls back to hardcoded)
 * @param {string|null} groupId
 * @param {number} cooldownDays
 * @returns {{ total: number, available: number, onCooldown: number }|null}
 */
function getTopicAvailability(type, groupTopics = null, groupId = null, cooldownDays = COOLDOWN_DAYS) {
  const normalizedKey = type.includes('_TOPICS') ? type : `${type.toUpperCase()}_TOPICS`;
  const allTopics = groupTopics || TOPICS[normalizedKey];
  if (!allTopics || allTopics.length === 0) return null;

  const logType = normalizedKey.replace('_TOPICS', '').toLowerCase();
  const usedTopicsArray = getRecentTopics(groupId, logType, cooldownDays);

  const uniqueTopics = [...new Set(allTopics)];
  const available = uniqueTopics.filter(t => !usedTopicsArray.includes(t));

  return {
    total: uniqueTopics.length,
    available: available.length,
    onCooldown: uniqueTopics.length - available.length
  };
}

module.exports = {
  ...TOPICS,
  getNextTopic,
  getTopicAvailability
};
