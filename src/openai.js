const OpenAI = require('openai');
const config = require('./config');
const logger = require('./logger');

const openai = new OpenAI({
  apiKey: config.openaiKey,
});

/**
 * Helper function for sleep/delay
 * @param {number} ms 
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Generate content using OpenAI gpt-4o-mini model with retry logic
 * @param {string} prompt 
 * @param {string} systemPrompt 
 * @param {number} maxTokens 
 * @param {number} retries 
 */
async function generateContent(prompt, systemPrompt = 'You are a helpful financial assistant.', maxTokens = 1000, retries = 3) {
  let lastError;
  
  for (let i = 0; i < retries; i++) {
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        max_tokens: maxTokens,
      });

      return {
        content: response.choices[0].message.content,
        usage: response.usage
      };
    } catch (error) {
      lastError = error;
      
      // Handle Rate Limit (429) specifically
      if (error.status === 429) {
        const waitTime = Math.pow(2, i) * 1000; // Exponential backoff: 1s, 2s, 4s...
        logger.warn(`OpenAI Rate Limit reached. Retrying in ${waitTime}ms... (Attempt ${i + 1}/${retries})`);
        await sleep(waitTime);
        continue;
      }
      
      // For other errors, log and throw immediately
      logger.error('OpenAI API Error:', error);
      throw error;
    }
  }

  logger.error(`OpenAI failed after ${retries} retries.`, lastError);
  throw lastError;
}

async function testConnection() {
  try {
    logger.info('Verifying OpenAI connection...');
    const { content } = await generateContent('Tulis 1 kalimat singkat dalam Bahasa Indonesia', 'You are a helpful assistant.');
    logger.info('OpenAI connection verified successfully: ' + content);
    return true;
  } catch (error) {
    logger.error('OpenAI connection verification failed:', error);
    // Don't exit process, just log error as it might be temporary or non-critical for some features
    return false;
  }
}

module.exports = {
  openai,
  generateContent,
  testConnection
};
