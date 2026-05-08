const { bot, sendMessage } = require('./bot');
const logger = require('./logger');
const { triggerNow, pauseScheduler, resumeScheduler, generatePreview, finalizePost, generateAnalysisPreview } = require('./scheduler');
const { checkAdmin } = require('./admin/auth');
const { adminHandlers, sendPreview, adminSessions, getSelectedGroup } = require('./admin/commands');
const { getPendingPost, clearPendingPost } = require('./admin/preview');
const { getGroupById } = require('./config/groupsLoader');

/**
 * Initialize all administrative commands for the Telegram bot.
 */
function initAdminCommands() {
  // --- TEXT COMMANDS ---
  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    if (!msg.text) return;

    // Clean command (removes @botname suffix)
    const parts = msg.text.split(' ');
    const command = parts[0].split('@')[0];
    const args = parts.slice(1);

    const adminCommands = ['/admin', '/status', '/stats', '/health', '/pause', '/resume', '/trigger', '/post', '/schedule', '/settime', '/preview'];
    
    if (!adminCommands.includes(command)) return;

    await checkAdmin(bot, msg, async () => {
      try {
        if (adminHandlers[command]) {
          return await adminHandlers[command](chatId, args);
        }

        // Basic switch for remains
        switch (command) {
          case '/pause': {
            const hours = parseInt(args[0]) || 24;
            const groupConfig = getSelectedGroup(chatId);
            pauseScheduler(hours, groupConfig ? groupConfig.id : null);
            const label = groupConfig ? ` ${groupConfig.brand.name}` : ' semua grup';
            await sendMessage(chatId, `⏸ <b>Scheduler${label} di-pause selama ${hours} jam.</b>`);
            break;
          }
          case '/resume': {
            const groupConfig = getSelectedGroup(chatId);
            resumeScheduler(groupConfig ? groupConfig.id : null);
            const label = groupConfig ? ` ${groupConfig.brand.name}` : ' semua grup';
            await sendMessage(chatId, `▶️ <b>Scheduler${label} dilanjutkan kembali.</b>`);
            break;
          }
          case '/trigger':
            await adminHandlers['trigger_menu'](chatId);
            break;
        }
      } catch (err) {
        logger.error(`Admin command error [${command}]:`, err);
        await sendMessage(chatId, `❌ Gagal: ${err.message}`);
      }
    });
  });

  // --- CALLBACK QUERIES ---
  bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    if (!data.startsWith('admin_')) return;

    await checkAdmin(bot, query, async () => {
      try {
        const action = data.replace('admin_', '');

        // 1. Post Confirmation Handlers
        if (action === 'post_confirm') {
          const pending = getPendingPost(chatId);
          if (!pending) return await bot.answerCallbackQuery(query.id, { text: '❌ Preview kedaluwarsa atau tidak ditemukan.', show_alert: true });

          await bot.editMessageText('⏳ <b>Sedang mengirim ke grup...</b>', { chat_id: chatId, message_id: query.message.message_id, parse_mode: 'HTML' });
          await finalizePost(pending.type, pending.result, pending.groupConfig, true);
          clearPendingPost(chatId);

          return await bot.editMessageText(`✅ <b>Konten ${pending.type} berhasil dikirim ke grup!</b>`, { chat_id: chatId, message_id: query.message.message_id, parse_mode: 'HTML' });
        }

        if (action === 'post_cancel') {
          clearPendingPost(chatId);
          return await bot.editMessageText('❌ **Pengiriman dibatalkan.**', { chat_id: chatId, message_id: query.message.message_id });
        }

        // 2. Dynamic: Group Selector — admin_selectgroup_{groupId}_{action}
        if (action.startsWith('selectgroup_')) {
          const parts = action.replace('selectgroup_', '').split('_');
          const groupSlug = parts[0];
          const nextAction = parts.slice(1).join('_');
          const groupConfig = getGroupById(groupSlug);
          if (!groupConfig) {
            return await bot.answerCallbackQuery(query.id, { text: '❌ Grup tidak ditemukan.', show_alert: true });
          }
          adminSessions.set(chatId.toString(), { selectedGroupId: groupSlug });
          await bot.answerCallbackQuery(query.id, { text: `✅ Grup dipilih: ${groupConfig.brand.name}` });
          if (nextAction === 'menu') return await adminHandlers['/admin'](chatId);
          if (adminHandlers[`/${nextAction}`]) return await adminHandlers[`/${nextAction}`](chatId);
          if (adminHandlers[nextAction]) return await adminHandlers[nextAction](chatId);
          return await adminHandlers['/admin'](chatId);
        }

        // 3. Dynamic: Download logs with group ID — admin_download_logs_{groupId}
        if (action.startsWith('download_logs_')) {
          const groupSlug = action.replace('download_logs_', '');
          const groupConfig = getGroupById(groupSlug);
          return await adminHandlers['download_logs'](chatId, groupConfig);
        }

        // 4. Dynamic: Analysis Symbol Picker — admin_analysis_sym_{SYMBOL}
        if (action.startsWith('analysis_sym_')) {
          const symbol = action.replace('analysis_sym_', '');
          const { adminHandlers: ah } = require('./admin/commands');
          if (ah[`analysis_sym_${symbol}`]) return await ah[`analysis_sym_${symbol}`](chatId);
          // Fallback: call buildAnalysisTfMenu via analysis_menu handler pattern
          await bot.answerCallbackQuery(query.id, { text: `📊 ${symbol}` });
          const { getAllGroups: ag } = require('./config/groupsLoader');
          const TIMEFRAMES = ['M15', 'H1', 'H4', 'D1'];
          const tfRows = TIMEFRAMES.map(tf => ([{ text: `⏱ ${tf}`, callback_data: `admin_analysis_run_${symbol}_${tf}` }]));
          await sendMessage(chatId, `📊 <b>${symbol}</b>\n\nPilih timeframe analisis:`, {
            reply_markup: { inline_keyboard: [...tfRows, [{ text: '⬅️ Kembali', callback_data: 'admin_analysis_menu' }], [{ text: '❌ Tutup', callback_data: 'admin_close' }]] }
          });
          return;
        }

        // 5. Dynamic: Analysis Run — admin_analysis_run_{SYMBOL}_{TF}
        if (action.startsWith('analysis_run_')) {
          const parts = action.replace('analysis_run_', '').split('_');
          const symbol = parts[0];
          const timeframe = parts[1];

          const VALID_SYMBOLS = ['XAUUSD', 'EURUSD', 'GBPUSD', 'BTCUSD'];
          const VALID_TFS = ['M15', 'H1', 'H4', 'D1'];
          if (!VALID_SYMBOLS.includes(symbol) || !VALID_TFS.includes(timeframe)) {
            return await bot.answerCallbackQuery(query.id, { text: '❌ Kombinasi pair/timeframe tidak valid.', show_alert: true });
          }

          await bot.answerCallbackQuery(query.id, { text: `⏳ Mengambil data ${symbol} ${timeframe}...` });
          const { getAllGroups: agr } = require('./config/groupsLoader');
          const groupConfig = getSelectedGroup(chatId) || agr()[0];

          try {
            const statusMsg = await sendMessage(chatId, `⏳ <b>Menganalisa ${symbol} (${timeframe})...</b>\nMengambil data OHLCV dan menjalankan AI...`);
            const result = await generateAnalysisPreview(symbol, timeframe, groupConfig);
            // Edit status message then show preview
            try {
              await bot.deleteMessage(chatId, statusMsg.message_id);
            } catch (e) { /* ignore */ }
            await sendPreview(chatId, 'analysis', result, groupConfig);
          } catch (err) {
            logger.error(`Analysis trigger failed [${symbol} ${timeframe}]:`, err);
            await sendMessage(chatId, `❌ <b>Gagal generate analisis ${symbol} ${timeframe}:</b>\n${err.message}`, {
              reply_markup: { inline_keyboard: [[{ text: '⬅️ Kembali', callback_data: 'admin_analysis_menu' }]] }
            });
          }
          return;
        }

        // 6. Navigation & Common Actions
        switch (action) {
          case 'menu':
            await adminHandlers['/admin'](chatId);
            break;
          case 'status':
            await adminHandlers['/status'](chatId);
            break;
          case 'stats':
            await adminHandlers['/stats'](chatId);
            break;
          case 'health':
            await adminHandlers['/health'](chatId);
            break;
          case 'schedule':
            await adminHandlers['/schedule'](chatId);
            break;
          case 'trigger_menu':
            await adminHandlers['trigger_menu'](chatId);
            break;
          case 'news_menu':
            await adminHandlers['news_menu'](chatId);
            break;
          case 'news_schedule':
            await adminHandlers['news_schedule'](chatId);
            break;
          case 'news_test':
            await adminHandlers['news_test'](chatId);
            break;
          case 'news_sync':
            await bot.answerCallbackQuery(query.id, { text: '⏳ Sinkronisasi data Twelve Data...' });
            const { syncDailyNews } = require('./services/newsService');
            await syncDailyNews();
            await adminHandlers['news_schedule'](chatId);
            break;
          case 'news_clear':
            const { clearActiveTimers } = require('./services/newsService');
            clearActiveTimers();
            await bot.answerCallbackQuery(query.id, { text: '⏹️ Semua timer news dihentikan.', show_alert: true });
            await adminHandlers['news_menu'](chatId);
            break;
          case 'download_logs':
            await adminHandlers['download_logs'](chatId);
            break;
          case 'pause_1': {
            const groupConfig = getSelectedGroup(chatId);
            pauseScheduler(1, groupConfig ? groupConfig.id : null);
            const pauseLabel = groupConfig ? ` ${groupConfig.brand.name}` : ' semua grup';
            await sendMessage(chatId, `⏸ <b>Scheduler${pauseLabel} di-pause selama 1 jam.</b>`, {
              reply_markup: { inline_keyboard: [[{ text: '⬅️ Kembali', callback_data: 'admin_menu' }]] }
            });
            break;
          }
          case 'resume': {
            const groupConfig = getSelectedGroup(chatId);
            resumeScheduler(groupConfig ? groupConfig.id : null);
            const resumeLabel = groupConfig ? ` ${groupConfig.brand.name}` : ' semua grup';
            await sendMessage(chatId, `▶️ <b>Scheduler${resumeLabel} dilanjutkan kembali.</b>`, {
              reply_markup: { inline_keyboard: [[{ text: '⬅️ Kembali', callback_data: 'admin_menu' }]] }
            });
            break;
          }
          
          // 5. Preview Actions (instead of immediate execution)
          case 'preview_edu':
          case 'preview_prod':
          case 'preview_tip':
          case 'preview_intro':
          case 'preview_news': {
            const typeMap = { preview_edu: 'education', preview_prod: 'product', preview_tip: 'tip', preview_intro: 'intro', preview_news: 'newsletter' };
            const type = typeMap[action];
            await bot.answerCallbackQuery(query.id, { text: `⏳ Menggenerasi preview ${type}...` });
            const { getAllGroups } = require('./config/groupsLoader');
            const groupConfig = getSelectedGroup(chatId) || getAllGroups()[0];
            const result = await generatePreview(type, groupConfig);
            await sendPreview(chatId, type, result, groupConfig);
            break;
          }

          case 'analysis_menu':
            await adminHandlers['analysis_menu'](chatId);
            break;

          case 'group_picker':
            await adminHandlers['group_picker'](chatId);
            break;

          case 'close':
            await bot.deleteMessage(chatId, query.message.message_id);
            break;
        }

        // Answer callback to remove loading state in Telegram
        await bot.answerCallbackQuery(query.id);
      } catch (err) {
        logger.error(`Admin callback error [${data}]:`, err);
        await bot.answerCallbackQuery(query.id, { text: `❌ Gagal: ${err.message}`, show_alert: true });
      }
    });
  });

  logger.info('Admin commands & callbacks initialized');
}

module.exports = { initAdminCommands };
