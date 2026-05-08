const cronLib = require('node-cron');
const { CronExpressionParser } = require('cron-parser');
const logger = require('./logger');
const config = require('./config');
const { sendMessage } = require('./bot');
const { generateContentWithRetry, generateWeeklyNewsletter } = require('./content/generator');
const { generateAnalysisWithRetry } = require('./content/analysisGenerator');
const fs = require('fs');
const path = require('path');

const { logContent, getTodayCount, getLastPostInfo, getWeeklyStats, getDailyStats, getMonthlyStats } = require('./utils/contentLog');
const { getTopicAvailability } = require('./content/topics');
const { getAllGroups } = require('./config/groupsLoader');
const newsService = require('./services/newsService');

/**
 * Per-group state map.
 * Key: group slug (e.g. 'finsfree')
 * Value: { scheduleConfig, pauseUntil, consecutiveFailures, jobs }
 */
const groupStates = new Map();

const monitor = require('./utils/monitor');
const { notifyAdmin } = require('./utils/notifier');

// ─── State Persistence ────────────────────────────────────────────────────────

function getStatePath(groupId) {
  return path.join(__dirname, `../data/scheduler-state-${groupId}.json`);
}

function loadGroupState(groupConfig) {
  const statePath = getStatePath(groupConfig.id);
  const state = groupStates.get(groupConfig.id);
  if (!state) return;

  try {
    if (fs.existsSync(statePath)) {
      const data = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      if (data.pauseUntil) {
        state.pauseUntil = data.pauseUntil;
        logger.info(`[${groupConfig.id}] State loaded: Paused until ${new Date(state.pauseUntil).toLocaleString()}`);
      }
    }
  } catch (err) {
    logger.error(`[${groupConfig.id}] Failed to load scheduler state:`, err);
  }
}

function saveGroupState(groupId) {
  const state = groupStates.get(groupId);
  if (!state) return;
  const statePath = getStatePath(groupId);
  try {
    fs.writeFileSync(statePath, JSON.stringify({
      pauseUntil: state.pauseUntil,
      updatedAt: new Date().toISOString()
    }, null, 2));
  } catch (err) {
    logger.error(`[${groupId}] Failed to save scheduler state:`, err);
  }
}

// ─── Pause Logic ──────────────────────────────────────────────────────────────

function isGroupPaused(groupId) {
  const state = groupStates.get(groupId);
  if (!state || !state.pauseUntil) return false;
  if (Date.now() > state.pauseUntil) {
    state.pauseUntil = null;
    saveGroupState(groupId);
    return false;
  }
  return true;
}

// ─── Report Helpers ───────────────────────────────────────────────────────────

const TOPIC_TYPE_LABELS = {
  education: 'Edukasi', product: 'Produk', newsletter: 'Newsletter',
  risk_management: 'Risk Mgmt', psychology: 'Psikologi', signal: 'Sinyal'
};

function buildCooldownSection(groupConfig) {
  const groupTopics = groupConfig.topics || {};
  const lines = [];
  for (const [type, topics] of Object.entries(groupTopics)) {
    const cooldown = type === 'signal' ? 1 : 14;
    const avail = getTopicAvailability(type, topics, groupConfig.id, cooldown);
    if (!avail) continue;
    const pct = Math.round((avail.available / avail.total) * 100);
    const icon = pct > 50 ? '✅' : pct > 20 ? '⚠️' : '🔴';
    const label = TOPIC_TYPE_LABELS[type] || type;
    lines.push(`${icon} ${label}: <code>${avail.available}/${avail.total}</code> topik tersedia`);
  }
  return lines;
}

// ─── Daily Report ─────────────────────────────────────────────────────────────

async function sendDailyReport() {
  logger.info('Generating daily report...');
  const groups = getAllGroups();
  const tz = groups[0] ? (groups[0].timezone || 'Asia/Jakarta') : 'Asia/Jakarta';

  const dateStr = new Date().toLocaleDateString('id-ID', {
    timeZone: tz, weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
  });

  let report = `📋 <b>RINGKASAN HARIAN BOT</b>\n`;
  report += `🗓 <i>${dateStr}</i>\n`;
  report += `─────────────────────────\n`;

  let hasAnyError = false;

  for (const groupConfig of groups) {
    const stats = getDailyStats(groupConfig.id);
    if (!stats) continue;

    report += `\n<b>── ${groupConfig.brand.name} ──</b>\n`;
    report += `✅ Sukses: <code>${stats.success}</code> post\n`;

    if (stats.failed > 0) {
      hasAnyError = true;
      report += `❌ Error: <code>${stats.failed}</code> kali\n`;
      stats.errors.slice(0, 3).forEach(e => {
        report += `  └ [${e.type}] <i>${e.msg.substring(0, 50)}</i>\n`;
      });
    } else {
      report += `❌ Error: 0\n`;
    }

    if (stats.skipped > 0) {
      report += `⏭ Di-skip: <code>${stats.skipped}</code> (daily limit)\n`;
    }

    if (Object.keys(stats.byType).length > 0) {
      const typeStr = Object.entries(stats.byType)
        .map(([t, n]) => `${TOPIC_TYPE_LABELS[t] || t} ×${n}`)
        .join(', ');
      report += `📌 <i>${typeStr}</i>\n`;
    }
  }

  // 3 jadwal berikutnya
  const next3 = getNext7Schedules().slice(0, 3);
  if (next3.length > 0) {
    report += `\n<b>⏰ 3 Jadwal Berikutnya:</b>\n`;
    next3.forEach((sched, i) => {
      const timeStr = sched.time.toLocaleString('id-ID', {
        timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit'
      });
      report += `${i + 1}. <code>${timeStr}</code> — ${sched.type}`;
      if (groups.length > 1) report += ` <i>(${sched.group})</i>`;
      report += '\n';
    });
  }

  report += `\n─────────────────────────\n`;
  report += hasAnyError
    ? `⚠️ <b>Ada error hari ini — perlu perhatian</b>\n`
    : `🟢 <b>Semua berjalan normal</b>\n`;
  report += `🤖 <i>Dikirim otomatis setiap hari 22:00 WIB</i>`;

  for (const adminId of config.adminIds) {
    try {
      await sendMessage(adminId.replace(/\D/g, ''), report);
    } catch (err) {
      logger.error(`Failed to send daily report to ${adminId}:`, err);
    }
  }
}

// ─── Monthly Report ───────────────────────────────────────────────────────────

async function sendMonthlyReport() {
  logger.info('Generating monthly report...');
  const groups = getAllGroups();
  const tz = groups[0] ? (groups[0].timezone || 'Asia/Jakarta') : 'Asia/Jakarta';

  const now = new Date();
  const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const periodStart = cutoff.toLocaleDateString('id-ID', { timeZone: tz, day: '2-digit', month: 'short', year: 'numeric' });
  const periodEnd = now.toLocaleDateString('id-ID', { timeZone: tz, day: '2-digit', month: 'short', year: 'numeric' });

  let report = `📊 <b>LAPORAN BULANAN BOT</b>\n`;
  report += `🗓 <i>${periodStart} – ${periodEnd}</i>\n`;
  report += `─────────────────────────\n`;

  let grandCostCurrent = 0;
  let grandCostPrevious = 0;

  for (const groupConfig of groups) {
    const stats = getMonthlyStats(groupConfig.id);
    if (!stats) continue;

    const { current, previous } = stats;
    grandCostCurrent += current.estimatedCost;
    grandCostPrevious += previous.estimatedCost;

    report += `\n<b>── ${groupConfig.brand.name} ──</b>\n`;

    // Posting volume + trend
    const postDiff = current.success - previous.success;
    const postTrend = postDiff >= 0 ? `+${postDiff}` : `${postDiff}`;
    report += `📬 Total posting: <code>${current.success}</code> post (<code>${postTrend}</code> vs bln lalu)\n`;

    // Reliability
    const reliIcon = parseFloat(current.reliability) >= 95 ? '🟢' : parseFloat(current.reliability) >= 80 ? '⚠️' : '🔴';
    report += `${reliIcon} Reliability: <code>${current.reliability}%</code>`;
    if (previous.success + previous.failed > 0) {
      report += ` (bln lalu: <code>${previous.reliability}%</code>)`;
    }
    report += '\n';

    // Skipped
    if (current.skipped > 0) {
      report += `⏭ Di-skip (daily limit): <code>${current.skipped}</code> sesi\n`;
    }

    // Cost
    const costDiff = current.estimatedCost - previous.estimatedCost;
    const costTrend = costDiff >= 0 ? `+$${costDiff.toFixed(5)}` : `-$${Math.abs(costDiff).toFixed(5)}`;
    report += `💰 Biaya token: <code>$${current.estimatedCost.toFixed(4)}</code> (${costTrend} vs bln lalu)\n`;

    // Top errors
    const topErrEntries = Object.entries(current.topErrors).sort((a, b) => b[1] - a[1]).slice(0, 3);
    if (topErrEntries.length > 0) {
      report += `❌ Top error (${current.failed}x total):\n`;
      topErrEntries.forEach(([key, count]) => {
        report += `  └ <code>${count}x</code> <i>${key.substring(0, 55)}</i>\n`;
      });
    } else {
      report += `✅ Tidak ada error bulan ini\n`;
    }

    // Cooldown / content gap
    const cooldownLines = buildCooldownSection(groupConfig);
    if (cooldownLines.length > 0) {
      report += `📚 Stok topik:\n`;
      cooldownLines.forEach(l => { report += `  ${l}\n`; });
    }
  }

  // Grand total cost
  report += `\n─────────────────────────\n`;
  report += `💰 <b>TOTAL BIAYA SEMUA GRUP</b>\n`;
  const grandDiff = grandCostCurrent - grandCostPrevious;
  const grandTrend = grandDiff >= 0 ? `+$${grandDiff.toFixed(5)}` : `-$${Math.abs(grandDiff).toFixed(5)}`;
  report += `• Bulan ini: <code>$${grandCostCurrent.toFixed(4)}</code>\n`;
  report += `• Bulan lalu: <code>$${grandCostPrevious.toFixed(4)}</code> (${grandTrend})\n`;
  report += `• <i>Rate: $0.30/1M token — GPT-4o-mini</i>\n`;

  report += `\n─────────────────────────\n`;
  report += `🤖 <i>Dikirim otomatis setiap tgl 1, jam 08:00 WIB</i>`;

  const keyboard = {
    inline_keyboard: [
      [{ text: '📂 Download Log Lengkap', callback_data: 'admin_download_logs_all' }],
      [{ text: '❌ Tutup', callback_data: 'admin_close' }]
    ]
  };

  for (const adminId of config.adminIds) {
    try {
      await sendMessage(adminId.replace(/\D/g, ''), report, { reply_markup: keyboard });
    } catch (err) {
      logger.error(`Failed to send monthly report to ${adminId}:`, err);
    }
  }
}

// ─── Weekly Executive Report ──────────────────────────────────────────────────

async function sendWeeklyExecutiveReport() {
  logger.info('Generating weekly executive report...');
  const groups = getAllGroups();

  for (const groupConfig of groups) {
    const stats = getWeeklyStats(groupConfig.id);
    if (!stats) continue;

    const periodStart = new Date(stats.period.start).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
    const periodEnd = new Date(stats.period.end).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });

    let report = `📊 <b>LAPORAN MINGGUAN BOT</b>`;
    if (groups.length > 1) report += ` — ${groupConfig.brand.name}`;
    report += `\n🗓 <i>${periodStart} – ${periodEnd}</i>\n`;
    report += `─────────────────────────\n\n`;

    // 1. DISTRIBUSI KONTEN + SUCCESS RATE
    const totalPosts = Object.values(stats.byType).reduce((sum, n) => sum + n, 0);
    const totalFailed = stats.errors.length;
    const totalAttempts = totalPosts + totalFailed;
    const successRate = totalAttempts > 0
      ? ((totalPosts / totalAttempts) * 100).toFixed(1)
      : '100.0';
    const successIcon = parseFloat(successRate) >= 95 ? '🟢' : parseFloat(successRate) >= 80 ? '⚠️' : '🔴';

    report += `📬 <b>DISTRIBUSI KONTEN</b>\n`;
    if (Object.keys(stats.byType).length === 0) {
      report += `• <i>Belum ada konten terkirim minggu ini.</i>\n`;
    } else {
      const typeLabels = {
        education: 'Edukasi Trading', product: 'Produk / Tips',
        quick_tip: 'Quick Tips', intro: 'Intro', newsletter: 'Newsletter',
        analysis: 'Analisis Pasar', risk_management: 'Risk Mgmt',
        psychology: 'Psikologi', signal: 'Sinyal'
      };
      Object.entries(stats.byType)
        .sort((a, b) => b[1] - a[1])
        .forEach(([type, count]) => {
          const label = typeLabels[type] || type.replace(/_/g, ' ');
          report += `• ${label}: <code>${count}</code> post\n`;
        });
      report += `• <b>Total: <code>${totalPosts}</code> post</b>\n`;
    }
    report += `${successIcon} Success rate: <code>${successRate}%</code>`;
    if (totalFailed > 0) report += ` (${totalFailed} gagal)`;
    report += '\n';

    // 2. MISSED (DAILY LIMIT)
    if (stats.skipped && stats.skipped > 0) {
      report += `\n⏭ <b>DI-SKIP (DAILY LIMIT)</b>\n`;
      report += `• <code>${stats.skipped}</code> sesi dilewati minggu ini\n`;
      report += `• <i>Pertimbangkan naikkan postDailyLimit jika terlalu sering.</i>\n`;
    }

    // 3. COOLDOWN TOPIK
    const cooldownLines = buildCooldownSection(groupConfig);
    if (cooldownLines.length > 0) {
      report += `\n📚 <b>STOK TOPIK (COOLDOWN STATUS)</b>\n`;
      cooldownLines.forEach(l => { report += `• ${l}\n`; });
    }

    // 4. ESTIMASI BIAYA TOKEN GPT-4o-mini
    report += `\n💰 <b>ESTIMASI BIAYA TOKEN</b>\n`;
    if (stats.totalTokens === 0) {
      report += `• <i>Tidak ada penggunaan token tercatat.</i>\n`;
    } else {
      report += `• Token digunakan: <code>${stats.totalTokens.toLocaleString('id-ID')}</code>\n`;
      report += `• Estimasi biaya: <code>$${stats.estimatedCost.toFixed(5)}</code> USD\n`;
      report += `• <i>(Rate: $0.30/1M token — GPT-4o-mini)</i>\n`;
    }

    // 5. STATUS SISTEM + ERROR DETAIL
    report += `\n⚙️ <b>STATUS SISTEM</b>\n`;
    if (stats.errors.length === 0) {
      report += `• 🟢 <b>Optimal</b> — Tidak ada error terdeteksi.\n`;
    } else {
      report += `• 🔴 <b>Terdapat ${stats.errors.length} error</b> minggu ini\n`;
      report += `• Detail (maks 5 terakhir):\n`;
      stats.errors.slice(-5).forEach(err => {
        const errTime = new Date(err.time).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
        report += `  ├ [<code>${err.type}</code>] ${errTime}\n`;
        report += `  └ <i>${err.msg.substring(0, 50)}${err.msg.length > 50 ? '...' : ''}</i>\n`;
      });
    }

    report += `\n─────────────────────────\n`;
    report += `🤖 <i>Dikirim otomatis setiap Senin 07:00 WIB</i>`;

    const keyboard = {
      inline_keyboard: [
        [{ text: '📂 Download Log Lengkap', callback_data: `admin_download_logs_${groupConfig.id}` }],
        [{ text: '❌ Tutup', callback_data: 'admin_close' }]
      ]
    };

    for (const adminId of config.adminIds) {
      try {
        await sendMessage(adminId.replace(/\D/g, ''), report, { reply_markup: keyboard });
      } catch (err) {
        logger.error(`Failed to send weekly report to ${adminId}:`, err);
      }
    }
  }
}

// ─── Task Runner ──────────────────────────────────────────────────────────────

async function finalizePost(type, result, groupConfig, isManual = false) {
  const groupId = groupConfig ? groupConfig.id : null;
  const targetGroupId = groupConfig ? groupConfig.groupId : config.groupId;
  const state = groupStates.get(groupId);

  if (!targetGroupId) {
    throw new Error(`[${groupId || 'global'}] Cannot send post: groupId is not configured. Set groupId in groups.json or TELEGRAM_GROUP_ID in .env`);
  }

  try {
    await sendMessage(targetGroupId, result.content);
    logContent(groupId, type, result.topic || result.weekNumber || 'N/A', result.content, 'success', {
      usage: result.usage,
      generatedAt: result.generatedAt,
      isManual
    });
    if (state) state.consecutiveFailures = 0;
    logger.info(`[${groupId || 'global'}] ${type} content finalized and sent successfully`);
    return true;
  } catch (error) {
    logger.error(`[${groupId || 'global'}] Finalize failed [${type}] after all retries:`, error);
    if (state) state.consecutiveFailures++;
    logContent(groupId, type, 'N/A', '', 'failed', { error: error.message, isManual });
    await notifyAdminsError(type, error, groupId);
    throw error;
  }
}

async function notifyAdminsError(type, error, groupId) {
  const label = groupId ? `[${groupId}] ` : '';
  logger.error(`${label}Critical: consecutive failures detected. Escalating.`);
  await notifyAdmin(
    'SCHEDULER_CRITICAL',
    `${label}Bot gagal generate/finalize konten 3x berturut-turut (${type})`,
    `Error: ${error.message}. Mohon cek OpenAI API atau status server.`
  );
}

async function runScheduledTask(type, taskFn, groupConfig, isManual = false) {
  const groupId = groupConfig ? groupConfig.id : null;
  const state = groupId ? groupStates.get(groupId) : null;

  try {
    if (!isManual && isGroupPaused(groupId)) {
      logger.info(`[${groupId}] Scheduler is paused. Skipping scheduled task: ${type}`);
      return;
    }
    const todayCount = getTodayCount(groupId);
    const dailyLimit = groupConfig ? (groupConfig.postDailyLimit || 3) : 3;
    if (!isManual && todayCount >= dailyLimit) {
      logger.warn(`[${groupId}] Safeguard triggered: Already sent ${todayCount} posts today. Skipping ${type}.`);
      logContent(groupId, type, 'N/A', '', 'skipped', { reason: 'daily_limit' });
      return;
    }
    logger.info(`[${groupId}] ${isManual ? 'Manually triggering' : 'Running scheduled'} task: ${type}`);
    const result = await taskFn();
    await finalizePost(type, result, groupConfig, isManual);
    return result;
  } catch (error) {
    logger.error(`[${groupId}] Task failed [${type}]:`, error);
    if (state) {
      state.consecutiveFailures++;
      logContent(groupId, type, 'N/A', '', 'failed', { error: error.message, isManual });
      if (state.consecutiveFailures >= 3) notifyAdminsError(type, error, groupId);
    }
    throw error;
  }
}

// ─── Preview & Trigger ────────────────────────────────────────────────────────

async function generatePreview(type, groupConfig = null) {
  logger.info(`Generating preview for type: ${type}${groupConfig ? ` [${groupConfig.id}]` : ''}`);
  switch (type) {
    case 'education':
    case 'product':
    case 'tip':
    case 'quick_tip':
    case 'risk_management':
    case 'psychology':
      return await generateContentWithRetry(type, {}, groupConfig);
    case 'intro':
      return await generateContentWithRetry('intro', {}, groupConfig);
    case 'newsletter': {
      const highlightsPath = path.join(__dirname, '../data/weekly-highlights.json');
      if (!fs.existsSync(highlightsPath)) throw new Error('Highlights file not found');
      const data = JSON.parse(fs.readFileSync(highlightsPath, 'utf8'));
      return await generateWeeklyNewsletter(data.weekNumber, data.highlights, groupConfig);
    }
    case 'signal':
      return await generateContentWithRetry('signal', {}, groupConfig);
    default:
      throw new Error(`Invalid content type: ${type}`);
  }
}

async function triggerNow(type, groupConfig = null) {
  logger.info(`Manual trigger requested for type: ${type}${groupConfig ? ` [${groupConfig.id}]` : ''}`);
  const result = await generatePreview(type, groupConfig);
  return await finalizePost(type, result, groupConfig, true);
}

// ─── Trading Analysis ─────────────────────────────────────────────────────────

/**
 * Run analysis task for a specific pair+timeframe and send directly to group.
 * Bypasses daily content limit — analysis is a separate post type.
 * @param {string} symbol - e.g. 'XAUUSD'
 * @param {string} timeframe - 'M15' | 'H1' | 'H4' | 'D1'
 * @param {Object} groupConfig
 * @param {boolean} isManual
 */
async function runAnalysisTask(symbol, timeframe, groupConfig, isManual = false) {
  const groupId = groupConfig ? groupConfig.id : null;
  const targetGroupId = groupConfig ? groupConfig.groupId : null;

  if (!targetGroupId) {
    logger.warn(`[${groupId}] Cannot send analysis: groupId not configured.`);
    return;
  }

  try {
    logger.info(`[${groupId}] Running analysis: ${symbol} ${timeframe}${isManual ? ' (manual)' : ''}`);
    const result = await generateAnalysisWithRetry(symbol, timeframe, groupConfig);
    await sendMessage(targetGroupId, result.content);
    logContent(groupId, 'analysis', `${symbol}_${timeframe}`, result.content, 'success', {
      usage: result.usage,
      generatedAt: result.generatedAt,
      isManual,
      symbol,
      timeframe
    });
    logger.info(`[${groupId}] Analysis sent: ${symbol} ${timeframe}`);
    return result;
  } catch (error) {
    logger.error(`[${groupId}] Analysis failed [${symbol} ${timeframe}]:`, error);
    logContent(groupId, 'analysis', `${symbol}_${timeframe}`, '', 'failed', {
      error: error.message,
      isManual,
      symbol,
      timeframe
    });
    throw error;
  }
}

/**
 * Generate analysis preview (no send) — for admin manual trigger with confirm step.
 * @param {string} symbol
 * @param {string} timeframe
 * @param {Object|null} groupConfig
 * @returns {Promise<Object>}
 */
async function generateAnalysisPreview(symbol, timeframe, groupConfig = null) {
  logger.info(`Generating analysis preview: ${symbol} ${timeframe}${groupConfig ? ` [${groupConfig.id}]` : ''}`);
  return await generateAnalysisWithRetry(symbol, timeframe, groupConfig);
}

// ─── Schedule Info ────────────────────────────────────────────────────────────

function getNext7Schedules(groupId = null) {
  const allOccurrences = [];

  const groups = getAllGroups();
  const targetGroups = groupId ? groups.filter(g => g.id === groupId) : groups;

  for (const groupConfig of targetGroups) {
    const state = groupStates.get(groupConfig.id);
    const scheduleConfig = state ? state.scheduleConfig : groupConfig.schedule;
    const tz = groupConfig.timezone || 'Asia/Jakarta';
    const options = { tz };

    for (const [type, item] of Object.entries(scheduleConfig)) {
      try {
        const interval = CronExpressionParser.parse(item.cron, options);
        for (let i = 0; i < 7; i++) {
          allOccurrences.push({
            type,
            label: item.label,
            group: groupConfig.brand.name,
            groupId: groupConfig.id,
            time: interval.next().toDate()
          });
        }
      } catch (err) {
        logger.error(`Failed to parse cron for ${type}:`, err);
      }
    }
  }

  return allOccurrences.sort((a, b) => a.time - b.time).slice(0, 7);
}

async function getScheduleReport(groupId = null) {
  const groups = getAllGroups();
  const targetGroups = groupId ? groups.filter(g => g.id === groupId) : groups;
  const multiGroup = targetGroups.length > 1;

  let report = `📅 <b>Jadwal Posting</b>\n\n`;

  for (const groupConfig of targetGroups) {
    const state = groupStates.get(groupConfig.id);
    const paused = isGroupPaused(groupConfig.id);
    const lastPost = getLastPostInfo(groupConfig.id);
    const next7 = getNext7Schedules(groupConfig.id);
    const tz = groupConfig.timezone || 'Asia/Jakarta';

    if (multiGroup) {
      report += `<b>── ${groupConfig.brand.name} ──</b>\n`;
    }

    report += `• <b>Status:</b> ${paused ? '⏸ Paused' : '▶️ Active'}\n`;

    if (state && state.pauseUntil) {
      const pauseStr = new Date(state.pauseUntil).toLocaleString('id-ID', { timeZone: tz });
      report += `  - Until: <code>${pauseStr}</code>\n`;
    }

    if (lastPost) {
      const lastDate = new Date(lastPost.timestamp).toLocaleString('id-ID', { timeZone: tz });
      report += `• <b>Terakhir Posting:</b> <code>${lastDate}</code>\n`;
      report += `  - Tipe: ${lastPost.type}\n`;
    }

    report += `\n<b>7 Jadwal Berikutnya:</b>\n`;
    next7.forEach((sched, i) => {
      const timeStr = sched.time.toLocaleString('id-ID', {
        timeZone: tz,
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit'
      });
      report += `${i + 1}. <code>${timeStr}</code> - ${sched.type}\n`;
    });

    if (multiGroup) report += '\n';
  }

  return report;
}

// ─── Pause/Resume ─────────────────────────────────────────────────────────────

function pauseScheduler(hours, groupId = null) {
  const durationMs = hours * 60 * 60 * 1000;
  const groups = groupId ? [{ id: groupId }] : getAllGroups();
  for (const g of groups) {
    const state = groupStates.get(g.id);
    if (state) {
      state.pauseUntil = Date.now() + durationMs;
      saveGroupState(g.id);
      logger.info(`[${g.id}] Scheduler paused for ${hours} hours.`);
    }
  }
}

function resumeScheduler(groupId = null) {
  const groups = groupId ? [{ id: groupId }] : getAllGroups();
  for (const g of groups) {
    const state = groupStates.get(g.id);
    if (state) {
      state.pauseUntil = null;
      saveGroupState(g.id);
      logger.info(`[${g.id}] Scheduler resumed manually.`);
    }
  }
}

function getPauseStatus(groupId = null) {
  if (groupId) {
    const state = groupStates.get(groupId);
    const groupConfig = getAllGroups().find(g => g.id === groupId);
    const tz = groupConfig ? groupConfig.timezone : 'Asia/Jakarta';
    const paused = isGroupPaused(groupId);
    const pauseUntil = state ? state.pauseUntil : null;
    return {
      isPaused: paused,
      pauseUntil: pauseUntil ? new Date(pauseUntil).toLocaleString('id-ID', { timeZone: tz }) : null,
      remainingMs: pauseUntil ? Math.max(0, pauseUntil - Date.now()) : 0
    };
  }

  // Return combined status for all groups
  const groups = getAllGroups();
  return groups.map(g => ({
    groupId: g.id,
    groupName: g.brand.name,
    ...getPauseStatus(g.id)
  }));
}

// ─── Schedule Customization ───────────────────────────────────────────────────

function setScheduleTime(type, hour, minute, groupId = null) {
  const { saveGroupSchedule } = require('./config/groupsLoader');
  const groups = getAllGroups();
  const targetGroups = groupId ? groups.filter(g => g.id === groupId) : groups;

  for (const groupConfig of targetGroups) {
    const state = groupStates.get(groupConfig.id);
    if (!state || !state.scheduleConfig[type]) {
      throw new Error(`Tipe ${type} tidak ditemukan untuk grup ${groupConfig.id}.`);
    }

    const cronExpr = state.scheduleConfig[type].cron.split(' ');
    cronExpr[0] = minute.toString();
    cronExpr[1] = hour.toString();

    const newCron = cronExpr.join(' ');
    state.scheduleConfig[type].cron = newCron;
    state.scheduleConfig[type].label = `${type.charAt(0).toUpperCase() + type.slice(1)} (Jam ${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')})`;

    saveGroupSchedule(groupConfig.id, state.scheduleConfig);
  }

  // Reload all schedulers
  stopScheduler();
  startScheduler();

  const label = targetGroups.map(g => {
    const state = groupStates.get(g.id);
    return state ? state.scheduleConfig[type].label : '';
  })[0] || '';
  return label;
}

// ─── Group Scheduler Registration ────────────────────────────────────────────

function startGroupScheduler(groupConfig) {
  const gid = groupConfig.id;
  const tz = groupConfig.timezone || 'Asia/Jakarta';

  // Initialize state
  const state = {
    scheduleConfig: { ...groupConfig.schedule },
    pauseUntil: null,
    consecutiveFailures: 0,
    jobs: new Map()
  };
  groupStates.set(gid, state);
  loadGroupState(groupConfig);

  // Education (optional — not all groups use this)
  if (state.scheduleConfig.education) {
    const eduJob = cronLib.schedule(state.scheduleConfig.education.cron, () => {
      runScheduledTask('education', () => generateContentWithRetry('education', {}, groupConfig), groupConfig);
    }, { timezone: tz });
    state.jobs.set('education', eduJob);
  }

  // Product/Tip (optional)
  if (state.scheduleConfig.product) {
    const productTipJob = cronLib.schedule(state.scheduleConfig.product.cron, () => {
      const type = new Date().getDay() === 2 ? 'product' : 'tip';
      runScheduledTask(type, () => generateContentWithRetry(type, {}, groupConfig), groupConfig);
    }, { timezone: tz });
    state.jobs.set('product', productTipJob);
  }

  // Newsletter (optional)
  if (state.scheduleConfig.newsletter) {
    const newsletterJob = cronLib.schedule(state.scheduleConfig.newsletter.cron, () => {
      runScheduledTask('newsletter', async () => {
        const highlightsPath = path.join(__dirname, '../data/weekly-highlights.json');
        if (!fs.existsSync(highlightsPath)) throw new Error('Highlights file not found');
        const data = JSON.parse(fs.readFileSync(highlightsPath, 'utf8'));
        return await generateWeeklyNewsletter(data.weekNumber, data.highlights, groupConfig);
      }, groupConfig);
    }, { timezone: tz });
    state.jobs.set('newsletter', newsletterJob);
  }

  // Quick Tip (optional)
  if (state.scheduleConfig.quick_tip) {
    const quickTipJob = cronLib.schedule(state.scheduleConfig.quick_tip.cron, () => {
      runScheduledTask('quick_tip', () => generateContentWithRetry('quick_tip', {}, groupConfig), groupConfig);
    }, { timezone: tz });
    state.jobs.set('quick_tip', quickTipJob);
  }

  // Intro (optional)
  if (state.scheduleConfig.intro) {
    const introJob = cronLib.schedule(state.scheduleConfig.intro.cron, () => {
      runScheduledTask('intro', () => generateContentWithRetry('intro', {}, groupConfig), groupConfig);
    }, { timezone: tz });
    state.jobs.set('intro', introJob);
  }

  // Intro Afternoon (optional)
  if (state.scheduleConfig.intro_afternoon) {
    const introAfternoonJob = cronLib.schedule(state.scheduleConfig.intro_afternoon.cron, () => {
      runScheduledTask('intro', () => generateContentWithRetry('intro', {}, groupConfig), groupConfig);
    }, { timezone: tz });
    state.jobs.set('intro_afternoon', introAfternoonJob);
  }

  // Intro Evening (optional)
  if (state.scheduleConfig.intro_evening) {
    const introEveningJob = cronLib.schedule(state.scheduleConfig.intro_evening.cron, () => {
      runScheduledTask('intro', () => generateContentWithRetry('intro', {}, groupConfig), groupConfig);
    }, { timezone: tz });
    state.jobs.set('intro_evening', introEveningJob);
  }

  // Risk Management Morning (optional)
  if (state.scheduleConfig.risk_management) {
    const rmJob = cronLib.schedule(state.scheduleConfig.risk_management.cron, () => {
      runScheduledTask('risk_management', () => generateContentWithRetry('risk_management', {}, groupConfig), groupConfig);
    }, { timezone: tz });
    state.jobs.set('risk_management', rmJob);
  }

  // Risk Management Evening (optional)
  if (state.scheduleConfig.risk_management_evening) {
    const rmEveningJob = cronLib.schedule(state.scheduleConfig.risk_management_evening.cron, () => {
      runScheduledTask('risk_management', () => generateContentWithRetry('risk_management', {}, groupConfig), groupConfig);
    }, { timezone: tz });
    state.jobs.set('risk_management_evening', rmEveningJob);
  }

  // Psychology Morning (optional)
  if (state.scheduleConfig.psychology) {
    const psychJob = cronLib.schedule(state.scheduleConfig.psychology.cron, () => {
      runScheduledTask('psychology', () => generateContentWithRetry('psychology', {}, groupConfig), groupConfig);
    }, { timezone: tz });
    state.jobs.set('psychology', psychJob);
  }

  // Psychology Evening (optional)
  if (state.scheduleConfig.psychology_evening) {
    const psychEveningJob = cronLib.schedule(state.scheduleConfig.psychology_evening.cron, () => {
      runScheduledTask('psychology', () => generateContentWithRetry('psychology', {}, groupConfig), groupConfig);
    }, { timezone: tz });
    state.jobs.set('psychology_evening', psychEveningJob);
  }

  // Signal Jobs — any schedule key starting with 'signal'
  for (const [key, item] of Object.entries(state.scheduleConfig)) {
    if (key.startsWith('signal')) {
      const signalJob = cronLib.schedule(item.cron, () => {
        runScheduledTask('signal', () => generateContentWithRetry('signal', {}, groupConfig), groupConfig);
      }, { timezone: tz });
      state.jobs.set(key, signalJob);
      logger.info(`[${gid}] Registered signal job: ${key} — ${item.label || item.cron}`);
    }
  }

  // Analysis Jobs (per pair+timeframe, per schedule entry)
  if (groupConfig.analysis && groupConfig.analysis.enabled) {
    const analysisSchedules = groupConfig.analysis.schedules || [];
    analysisSchedules.forEach((entry, idx) => {
      const { symbol, timeframe, cron: cronExpr } = entry;
      if (!symbol || !timeframe || !cronExpr) {
        logger.warn(`[${gid}] Skipping invalid analysis schedule entry at index ${idx}`);
        return;
      }
      const jobKey = `analysis_${symbol}_${timeframe}_${idx}`;
      const analysisJob = cronLib.schedule(cronExpr, () => {
        if (isGroupPaused(gid)) {
          logger.info(`[${gid}] Paused. Skipping analysis: ${symbol} ${timeframe}`);
          return;
        }
        runAnalysisTask(symbol, timeframe, groupConfig).catch(err => {
          logger.error(`[${gid}] Scheduled analysis failed [${symbol} ${timeframe}]:`, err);
        });
      }, { timezone: tz });
      state.jobs.set(jobKey, analysisJob);
      logger.info(`[${gid}] Registered analysis job: ${symbol} ${timeframe} — ${entry.label || cronExpr}`);
    });
  }

  logger.info(`[${gid}] Registered ${state.jobs.size} cron jobs (tz: ${tz})`);
}

// ─── Start / Stop ─────────────────────────────────────────────────────────────

function startScheduler() {
  const groups = getAllGroups();
  logger.info(`Starting scheduler for ${groups.length} group(s)...`);

  // Error Budget Safeguard (global)
  monitor.setCallback(async (count) => {
    logger.error(`Error budget exceeded (${count} errors). Pausing all schedulers automatically.`);
    pauseScheduler(24);
    await notifyAdmin(
      'BUDGET_EXCEEDED',
      'Bot mengalami banyak error, perlu perhatian segera',
      'Semua scheduler di-pause otomatis selama 24 jam. Mohon cek logs server.'
    );
  });

  // Register per-group schedulers
  for (const groupConfig of groups) {
    startGroupScheduler(groupConfig);
  }

  // Weekly Executive Report (Monday 07:00 — global)
  const tz = groups[0] ? groups[0].timezone : 'Asia/Jakarta';
  const reportJob = cronLib.schedule('0 7 * * 1', () => {
    sendWeeklyExecutiveReport().catch(err => logger.error('Weekly report job failed:', err));
  }, { timezone: tz });

  // Store report job in first group's jobs (or a dedicated slot)
  const firstState = groupStates.get(groups[0] ? groups[0].id : null);
  if (firstState) firstState.jobs.set('weekly_report', reportJob);

  // Daily Report (Every day at 22:00 WIB)
  const dailyReportJob = cronLib.schedule('0 22 * * *', () => {
    sendDailyReport().catch(err => logger.error('Daily report job failed:', err));
  }, { timezone: tz });
  if (firstState) firstState.jobs.set('daily_report', dailyReportJob);

  // Monthly Report (1st of every month at 08:00 WIB)
  const monthlyReportJob = cronLib.schedule('0 8 1 * *', () => {
    sendMonthlyReport().catch(err => logger.error('Monthly report job failed:', err));
  }, { timezone: tz });
  if (firstState) firstState.jobs.set('monthly_report', monthlyReportJob);

  // High Impact News Sync (Daily at 00:05 — global, sends to all groups)
  const newsSyncJob = cronLib.schedule('5 0 * * *', () => {
    newsService.syncDailyNews().catch(err => logger.error('Daily news sync failed:', err));
  }, { timezone: tz });
  if (firstState) firstState.jobs.set('news_sync', newsSyncJob);

  // Initial news sync on startup
  newsService.initNewsService().catch(err => logger.error('Initial news sync failed:', err));

  const totalJobs = [...groupStates.values()].reduce((sum, s) => sum + s.jobs.size, 0);
  logger.info(`Scheduled ${totalJobs} automation tasks total`);
}

function stopScheduler() {
  logger.info('Stopping all scheduled tasks...');
  for (const [gid, state] of groupStates.entries()) {
    state.jobs.forEach(job => job.stop());
    state.jobs.clear();
    logger.info(`[${gid}] All jobs stopped.`);
  }
  groupStates.clear();
}

module.exports = {
  startScheduler,
  stopScheduler,
  triggerNow,
  generatePreview,
  finalizePost,
  pauseScheduler,
  resumeScheduler,
  getPauseStatus,
  getScheduleReport,
  setScheduleTime,
  getNext7Schedules,
  runAnalysisTask,
  generateAnalysisPreview,
  sendDailyReport,
  sendMonthlyReport,
  sendWeeklyExecutiveReport
};
