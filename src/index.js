const logger = require('./logger');
const { testConnection } = require('./openai');
const { startScheduler } = require('./scheduler');
const { initAdminCommands } = require('./admin');

// Verify OpenAI connection on startup
testConnection();

// Initialize the automated content scheduler
startScheduler();

// Initialize admin command handlers
initAdminCommands();

logger.info('Application started successfully.');
