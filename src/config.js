require('dotenv').config();
const fs = require('fs');
const path = require('path');

const GROUPS_PATH = path.join(__dirname, '../data/groups.json');

function validateConfig() {
  // TELEGRAM_GROUP_ID is only required in legacy single-group mode (no groups.json)
  const groupsFileExists = fs.existsSync(GROUPS_PATH);

  const required = ['TELEGRAM_BOT_TOKEN', 'OPENAI_API_KEY'];
  if (!process.env.TWELVE_DATA_API_KEY) {
    console.warn('[config] WARNING: TWELVE_DATA_API_KEY tidak diset. Fitur analisis teknikal tidak akan berfungsi.');
  }
  if (!groupsFileExists) {
    required.push('TELEGRAM_GROUP_ID');
  }

  const missingVars = required.filter((envVar) => !process.env[envVar]);

  if (missingVars.length > 0) {
    const errorMsg = `Configuration Error: The following environment variables are missing in your .env file:\n${missingVars.map(v => `- ${v}`).join('\n')}\n\nPlease check your .env file and try again.`;
    throw new Error(errorMsg);
  }
}

// Validate configuration immediately upon loading
validateConfig();

const config = {
  telegramToken: process.env.TELEGRAM_BOT_TOKEN,
  groupId: process.env.TELEGRAM_GROUP_ID || null,
  openaiKey: process.env.OPENAI_API_KEY,
  twelveDataKey: process.env.TWELVE_DATA_API_KEY,
  adminIds: process.env.ADMIN_USER_IDS ? process.env.ADMIN_USER_IDS.split(',').map(id => id.trim()) : [],
  nodeEnv: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info'
};

module.exports = config;
