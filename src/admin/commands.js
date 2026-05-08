const { sendMessage, sendDocument, bot } = require('../bot');
const fs = require('fs');
const path = require('path');
const { getTodayCount, getStats, getLogFilePath } = require('../utils/contentLog');
const { getPauseStatus, pauseScheduler, resumeScheduler, triggerNow, generatePreview, finalizePost, getScheduleReport, setScheduleTime, generateAnalysisPreview } = require('../scheduler');
const { addPendingPost, clearPendingPost } = require('./preview');
const { testConnection } = require('../openai');
const config = require('../config');
const logger = require('../logger');
const newsService = require('../services/newsService');
const { getAllGroups, getGroupById } = require('../config/groupsLoader');

const startTime = Date.now();

// In-memory admin session store: chatId -> { selectedGroupId }
const adminSessions = new Map();

/**
 * Format milliseconds into human-readable uptime string.
 */
function formatUptime(seconds) {
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${d}d ${h}h ${m}m ${s}s`;
}

/**
 * Helper to generate navigation buttons (Back to Menu / Close)
 */
function getNavButtons() {
  return [
    [{ text: '⬅️ Kembali ke Menu', callback_data: 'admin_menu' }],
    [{ text: '❌ Tutup', callback_data: 'admin_close' }]
  ];
}

/**
 * Get the currently selected group for an admin session.
 * If only 1 group exists, auto-select it. Otherwise return stored session or null.
 * @param {string|number} chatId
 * @returns {Object|null} groupConfig
 */
function getSelectedGroup(chatId) {
  const groups = getAllGroups();
  if (groups.length === 1) return groups[0];
  const session = adminSessions.get(chatId.toString());
  if (session && session.selectedGroupId) {
    return getGroupById(session.selectedGroupId) || null;
  }
  return null;
}

/**
 * Build a group-picker inline keyboard.
 * @param {string} actionSuffix - e.g. 'status', 'stats'
 * @returns {Object} Telegram inline_keyboard
 */
function buildGroupPickerKeyboard(actionSuffix) {
  const groups = getAllGroups();
  const rows = groups.map(g => ([{
    text: `${g.brand.name}`,
    callback_data: `admin_selectgroup_${g.id}_${actionSuffix}`
  }]));
  rows.push([{ text: '❌ Tutup', callback_data: 'admin_close' }]);
  return { inline_keyboard: rows };
}

/**
 * If multiple groups exist and no group selected yet, send picker. Otherwise run the action.
 * @param {string|number} chatId
 * @param {string} actionSuffix - callback action suffix used for routing
 * @param {Function} fn - async (groupConfig) => void
 */
async function withGroupContext(chatId, actionSuffix, fn) {
  const groups = getAllGroups();
  if (groups.length > 1) {
    const selected = getSelectedGroup(chatId);
    if (!selected) {
      await sendMessage(chatId, `🏢 <b>Pilih Grup:</b>`, {
        reply_markup: buildGroupPickerKeyboard(actionSuffix)
      });
      return;
    }
    return await fn(selected);
  }
  return await fn(groups[0]);
}

/**
 * Send a preview message with confirm/cancel buttons.
 */
async function sendPreview(chatId, type, result, groupConfig = null) {
  const groupLabel = groupConfig ? ` → ${groupConfig.brand.name}` : '';
  const previewText = `📝 <b>PREVIEW KONTEN (${type.toUpperCase()})${groupLabel}</b>\n\n${result.content}\n\n⚠️ <b>Konfirmasi pengiriman?</b>\n(Otomatis batal dalam 60 detik)`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: '✅ Kirim Sekarang', callback_data: `admin_post_confirm` },
        { text: '❌ Batalkan', callback_data: `admin_post_cancel` }
      ]
    ]
  };

  const message = await sendMessage(chatId, previewText, { reply_markup: keyboard });

  // Store pending post with groupConfig
  addPendingPost(chatId, type, result, async () => {
    try {
      await bot.editMessageText(`⏰ <b>Waktu Konfirmasi Habis</b>\nPengiriman konten ${type} dibatalkan otomatis.`, {
        chat_id: chatId,
        message_id: message.message_id,
        parse_mode: 'HTML'
      });
    } catch (e) {
      if (!e.message.includes('message is not modified')) {
        logger.error('Failed to edit expired preview:', e);
      }
    }
  }, groupConfig);
}

const ANALYSIS_SYMBOLS = ['XAUUSD', 'EURUSD', 'GBPUSD', 'BTCUSD'];
const ANALYSIS_TIMEFRAMES = ['M15', 'H1', 'H4', 'D1'];

/**
 * Build timeframe selection keyboard for a specific symbol.
 */
async function buildAnalysisTfMenu(chatId, symbol) {
  const tfRows = ANALYSIS_TIMEFRAMES.map(tf => ([{
    text: `⏱ ${tf}`,
    callback_data: `admin_analysis_run_${symbol}_${tf}`
  }]));
  await sendMessage(chatId, `📊 <b>${symbol}</b>\n\nPilih timeframe analisis:`, {
    reply_markup: {
      inline_keyboard: [
        ...tfRows,
        [{ text: '⬅️ Kembali', callback_data: 'admin_analysis_menu' }],
        [{ text: '❌ Tutup', callback_data: 'admin_close' }]
      ]
    }
  });
}

const adminHandlers = {
  '/admin': async (chatId) => {
    const groups = getAllGroups();
    const groupLabel = groups.length > 1 ? ' (Multi-Grup)' : ` — ${groups[0].brand.name}`;
    const menuText = `🛠 <b>Admin Panel${groupLabel}</b>\n\nSilakan pilih menu di bawah ini untuk memantau atau mengontrol bot.`;
    const keyboard = {
      inline_keyboard: [
        [
          { text: '📊 Status', callback_data: 'admin_status' },
          { text: '📅 Jadwal', callback_data: 'admin_schedule' }
        ],
        [
          { text: '📈 Stats', callback_data: 'admin_stats' },
          { text: '🏥 Health', callback_data: 'admin_health' }
        ],
        [
          { text: '⚡ Trigger', callback_data: 'admin_trigger_menu' },
          { text: '🗞️ News', callback_data: 'admin_news_menu' }
        ],
        [
          { text: '⏸ Pause 1h', callback_data: 'admin_pause_1' },
          { text: '▶️ Resume', callback_data: 'admin_resume' }
        ],
        ...(groups.length > 1 ? [[{ text: '🏢 Pilih Grup', callback_data: 'admin_group_picker' }]] : []),
        [
          { text: '❌ Tutup', callback_data: 'admin_close' }
        ]
      ]
    };
    await sendMessage(chatId, menuText, { reply_markup: keyboard });
  },

  '/status': async (chatId) => {
    await withGroupContext(chatId, 'status', async (groupConfig) => {
      const uptime = formatUptime(process.uptime());
      const pauseState = getPauseStatus(groupConfig.id);
      const todayCount = getTodayCount(groupConfig.id);

      let subCount = 'N/A';
      try {
        subCount = await bot.getChatMemberCount(groupConfig.groupId);
      } catch (e) {
        logger.error('Failed to get sub count:', e);
      }

      let status = `🤖 <b>Bot Status Report</b>`;
      if (getAllGroups().length > 1) status += ` — ${groupConfig.brand.name}`;
      status += `\n\n`;
      status += `• <b>Uptime:</b> <code>${uptime}</code>\n`;
      status += `• <b>Scheduler:</b> ${pauseState.isPaused ? '⏸ Paused' : '▶️ Active'}\n`;
      if (pauseState.isPaused) {
        status += `  - Until: <code>${pauseState.pauseUntil}</code>\n`;
      }
      status += `• <b>Posts Today:</b> <code>${todayCount}/${groupConfig.postDailyLimit || 3}</code>\n`;
      status += `• <b>Group Subs:</b> <code>${subCount}</code>`;

      await sendMessage(chatId, status, {
        reply_markup: { inline_keyboard: getNavButtons() }
      });
    });
  },

  '/stats': async (chatId) => {
    await withGroupContext(chatId, 'stats', async (groupConfig) => {
      const stats = getStats(groupConfig.id, 7);
      if (!stats) return sendMessage(chatId, '❌ Gagal mengambil statistik.', {
        reply_markup: { inline_keyboard: getNavButtons() }
      });

      let msg = `📊 <b>Performance (7 Days)</b>`;
      if (getAllGroups().length > 1) msg += ` — ${groupConfig.brand.name}`;
      msg += `\n\n`;
      msg += `• <b>Success:</b> <code>${stats.successCount}</code>\n`;
      msg += `• <b>Failed:</b> <code>${stats.failedCount}</code>\n\n`;
      msg += `<b>Distribution:</b>\n`;
      for (const [type, count] of Object.entries(stats.byType)) {
        msg += `- ${type}: <code>${count}</code>\n`;
      }

      await sendMessage(chatId, msg, {
        reply_markup: { inline_keyboard: getNavButtons() }
      });
    });
  },

  '/health': async (chatId) => {
    await sendMessage(chatId, '🔍 Checking system health...');

    const tgHealth = await bot.getMe().then(() => '✅ OK').catch(() => '❌ FAIL');
    const aiHealth = await testConnection().then(res => res ? '✅ OK' : '❌ FAIL');

    let health = `🏥 <b>System Health Check</b>\n\n`;
    health += `• <b>Telegram API:</b> ${tgHealth}\n`;
    health += `• <b>OpenAI API:</b> ${aiHealth}\n`;
    health += `• <b>NodeJS:</b> ✅ OK (${process.version})`;

    await sendMessage(chatId, health, {
      reply_markup: { inline_keyboard: getNavButtons() }
    });
  },

  '/schedule': async (chatId) => {
    await withGroupContext(chatId, 'schedule', async (groupConfig) => {
      const report = await getScheduleReport(groupConfig.id);
      await sendMessage(chatId, report, {
        reply_markup: { inline_keyboard: getNavButtons() }
      });
    });
  },

  '/settime': async (chatId, args) => {
    const type = args[0];
    const time = args[1];

    if (!type || !time || !time.includes(':')) {
      return sendMessage(chatId, '❌ Gunakan: /settime [tipe] [HH:mm]\nTipe: <code>education, product, newsletter, quick_tip, intro</code>', {
        reply_markup: { inline_keyboard: getNavButtons() }
      });
    }

    const [hour, minute] = time.split(':').map(Number);
    if (isNaN(hour) || isNaN(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      return sendMessage(chatId, '❌ Waktu tidak valid (00:00 - 23:59).');
    }

    await withGroupContext(chatId, 'settime', async (groupConfig) => {
      try {
        const label = setScheduleTime(type, hour, minute, groupConfig.id);
        await sendMessage(chatId, `✅ <b>Jadwal Diperbarui!</b>\nSekarang: ${label}`, {
          reply_markup: { inline_keyboard: getNavButtons() }
        });
      } catch (err) {
        await sendMessage(chatId, `❌ Gagal: ${err.message}`, {
          reply_markup: { inline_keyboard: getNavButtons() }
        });
      }
    });
  },

  '/post': async (chatId, args) => {
    const type = args[0];
    if (!type) {
      return sendMessage(chatId, '❌ Gunakan: /post [type]\nType: <code>education, product, newsletter, intro, custom [text]</code>', {
        reply_markup: { inline_keyboard: getNavButtons() }
      });
    }

    await withGroupContext(chatId, `post_${type}`, async (groupConfig) => {
      try {
        if (type === 'custom') {
          const customText = args.slice(1).join(' ');
          if (!customText) return sendMessage(chatId, '❌ Sertakan teks untuk posting custom.');
          const result = { content: customText, topic: 'Custom Post' };
          await sendPreview(chatId, 'custom', result, groupConfig);
          return;
        }

        if (['education', 'product', 'newsletter', 'tip', 'quick_tip', 'intro'].includes(type)) {
          await sendMessage(chatId, `⏳ Sedang menggenerasi preview ${type}...`);
          const result = await generatePreview(type, groupConfig);
          await sendPreview(chatId, type, result, groupConfig);
          return;
        }

        return sendMessage(chatId, '❌ Tipe tidak valid.', {
          reply_markup: { inline_keyboard: getNavButtons() }
        });
      } catch (err) {
        logger.error(`Manual post failed [${type}]:`, err);
        await sendMessage(chatId, `❌ Gagal: ${err.message}`, {
          reply_markup: { inline_keyboard: getNavButtons() }
        });
      }
    });
  },

  '/preview': async (chatId, args) => {
    const type = args[0];
    if (!type || !['education', 'product', 'newsletter', 'tip', 'quick_tip', 'intro'].includes(type)) {
      return sendMessage(chatId, '❌ Gunakan: /preview [type]\nTipe: <code>education, product, newsletter, tip, quick_tip, intro</code>', {
        reply_markup: { inline_keyboard: getNavButtons() }
      });
    }

    await withGroupContext(chatId, `preview_${type}`, async (groupConfig) => {
      try {
        await sendMessage(chatId, `🔍 <b>Generating Quality Check Preview (${type})...</b>`);
        const result = await generatePreview(type, groupConfig);

        const groupLabel = getAllGroups().length > 1 ? ` — ${groupConfig.brand.name}` : '';
        const msg = `🧪 <b>QUALITY CHECK PREVIEW (${type.toUpperCase()})${groupLabel}</b>\n\n${result.content}\n\n<i>Catatan: Konten ini hanya untuk preview dan tidak disimpan/dikirim ke grup.</i>`;

        await sendMessage(chatId, msg, {
          reply_markup: { inline_keyboard: [[{ text: '❌ Tutup', callback_data: 'admin_close' }]] }
        });
      } catch (err) {
        logger.error(`Preview check failed [${type}]:`, err);
        await sendMessage(chatId, `❌ Gagal: ${err.message}`, {
          reply_markup: { inline_keyboard: getNavButtons() }
        });
      }
    });
  },

  'trigger_menu': async (chatId) => {
    const text = `⚡ <b>Manual Trigger Menu</b>\n\nPilih tipe konten:`;
    const keyboard = {
      inline_keyboard: [
        [
          { text: '📚 Edu', callback_data: 'admin_preview_edu' },
          { text: '🛍️ Prod', callback_data: 'admin_preview_prod' }
        ],
        [
          { text: '💡 Tip', callback_data: 'admin_preview_tip' },
          { text: '👋 Intro', callback_data: 'admin_preview_intro' }
        ],
        [
          { text: '📰 Newsletter', callback_data: 'admin_preview_news' },
          { text: '📊 Analisa Pasar', callback_data: 'admin_analysis_menu' }
        ],
        ...getNavButtons()
      ]
    };
    await sendMessage(chatId, text, { reply_markup: keyboard });
  },

  'analysis_menu': async (chatId) => {
    const symRows = ANALYSIS_SYMBOLS.map(sym => ([{
      text: `📊 ${sym}`,
      callback_data: `admin_analysis_sym_${sym}`
    }]));
    await sendMessage(chatId, `📊 <b>Analisa Pasar</b>\n\nPilih pair:`, {
      reply_markup: {
        inline_keyboard: [
          ...symRows,
          ...getNavButtons()
        ]
      }
    });
  },

  'download_logs': async (chatId, groupConfig = null) => {
    const gc = groupConfig || getSelectedGroup(chatId) || getAllGroups()[0];
    const logPath = getLogFilePath(gc ? gc.id : null);
    if (!fs.existsSync(logPath)) {
      return await sendMessage(chatId, '❌ File log tidak ditemukan.');
    }

    const groupLabel = gc ? ` (${gc.brand.name})` : '';
    await sendMessage(chatId, `📨 <b>Menyiapkan file log lengkap${groupLabel}...</b>`);
    await sendDocument(chatId, logPath, {
      caption: `📄 <b>Content Log${groupLabel}</b>\nGenerated: ${new Date().toLocaleString('id-ID')}`
    });
  },

  'news_menu': async (chatId) => {
    const text = `🗞️ <b>News Trading Admin</b>\n\nKelola jadwal kalender ekonomi High Impact hari ini.`;
    const keyboard = {
      inline_keyboard: [
        [{ text: '📅 Lihat Jadwal Hari Ini', callback_data: 'admin_news_schedule' }],
        [{ text: '🔄 Sinkronkan Ulang API', callback_data: 'admin_news_sync' }],
        [{ text: '🧪 Test Kirim News Sekarang', callback_data: 'admin_news_test' }],
        [{ text: '⏹️ Stop Semua Timer News', callback_data: 'admin_news_clear' }],
        ...getNavButtons()
      ]
    };
    await sendMessage(chatId, text, { reply_markup: keyboard });
  },

  'news_schedule': async (chatId) => {
    const news = newsService.getTodayNews();
    let msg = `📅 <b>Jadwal News Hari Ini</b>\n\n`;

    if (news.length === 0) {
      msg += `<i>Tidak ada news high-impact hari ini atau belum disinkronkan.</i>`;
    } else {
      news.forEach((item, i) => {
        const eventName = item.title || item.event || 'Unknown';
        const country = item.country ? `[${item.country}] ` : '';
        const time = new Date(item.date).toLocaleTimeString('id-ID', {
          hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta'
        });
        msg += `${i + 1}. <b>${time} WIB</b> - ${country}${eventName}\n`;
      });
    }

    await sendMessage(chatId, msg, { reply_markup: { inline_keyboard: [[{ text: '⬅️ Kembali', callback_data: 'admin_news_menu' }]] } });
  },

  'news_test': async (chatId) => {
    const news = newsService.getTodayNews();

    if (news.length === 0) {
      return await sendMessage(chatId, '❌ Tidak ada news hari ini. Coba Sinkronkan Ulang API dulu.', {
        reply_markup: { inline_keyboard: [[{ text: '⬅️ Kembali', callback_data: 'admin_news_menu' }]] }
      });
    }

    const testEvent = news[0];
    const eventName = testEvent.title || testEvent.event || 'Unknown';
    const country = testEvent.country ? `[${testEvent.country}]` : '';

    await sendMessage(chatId, `⏳ Menggenerasi preview news: <b>${country} ${eventName}</b>...`);

    const groupConfig = getSelectedGroup(chatId) || getAllGroups()[0];

    try {
      const { generateNewsTradingContent } = require('../content/generator');
      const normalized = {
        event: testEvent.title || testEvent.event || 'Unknown Event',
        country: testEvent.country || '',
        date: testEvent.date,
        impact: testEvent.impact,
        estimate: testEvent.forecast || testEvent.estimate,
        previous: testEvent.previous
      };

      const result = await generateNewsTradingContent(normalized, groupConfig);
      const groupLabel = getAllGroups().length > 1 ? ` → ${groupConfig.brand.name}` : '';
      const previewText = `🧪 <b>PREVIEW NEWS TRADING${groupLabel}</b>\n\n${result.content}\n\n⚠️ Ini hanya preview. Kirim ke grup?`;

      const keyboard = {
        inline_keyboard: [
          [
            { text: '✅ Kirim ke Grup', callback_data: 'admin_post_confirm' },
            { text: '❌ Batalkan', callback_data: 'admin_post_cancel' }
          ]
        ]
      };

      const message = await sendMessage(chatId, previewText, { reply_markup: keyboard });

      addPendingPost(chatId, 'news_trading', result, async () => {
        try {
          await bot.editMessageText('⏰ <b>Waktu Konfirmasi Habis</b>', {
            chat_id: chatId,
            message_id: message.message_id,
            parse_mode: 'HTML'
          });
        } catch (e) { /* ignore */ }
      }, groupConfig);
    } catch (err) {
      logger.error('News test failed:', err);
      await sendMessage(chatId, `❌ Gagal generate: ${err.message}`, {
        reply_markup: { inline_keyboard: [[{ text: '⬅️ Kembali', callback_data: 'admin_news_menu' }]] }
      });
    }
  },

  'group_picker': async (chatId) => {
    const groups = getAllGroups();
    if (groups.length <= 1) {
      return await adminHandlers['/admin'](chatId);
    }
    await sendMessage(chatId, `🏢 <b>Pilih Grup Aktif:</b>\n\nGrup yang dipilih akan digunakan untuk semua operasi admin berikutnya.`, {
      reply_markup: buildGroupPickerKeyboard('menu')
    });
  }
};

module.exports = { adminHandlers, sendPreview, getSelectedGroup, withGroupContext, adminSessions };
