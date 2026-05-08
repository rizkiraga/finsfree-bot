const logger = require('./logger');

/**
 * Sleep for a specified number of milliseconds.
 * @param {number} ms 
 * @returns {Promise<void>}
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Retry an async function with exponential backoff and jitter.
 * Handles specific rate limit cases for Telegram and OpenAI.
 * 
 * @param {Function} fn - The async function to retry
 * @param {number} maxRetries - Maximum number of retry attempts
 * @param {number} baseDelay - Initial delay in ms
 * @returns {Promise<any>}
 */
async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // If we've reached max retries, don't wait, just throw
      if (attempt === maxRetries) break;

      let delay = 0;
      // AggregateError (e.g. DNS/network multi-failure) — extract sub-error messages
      let errorMsg = error.message || '';
      if (error.errors && Array.isArray(error.errors) && errorMsg === '') {
        errorMsg = error.errors.map(e => e.message).filter(Boolean).join('; ') || 'AggregateError';
      }
      const response = error.response || {};
      const statusCode = error.code || response.statusCode || response.status;

      // 1. Handle Telegram 429 (Too Many Requests)
      if (statusCode === 429 && response.parameters && response.parameters.retry_after) {
        delay = (response.parameters.retry_after + 1) * 1000;
        logger.warn(`[RETRY] Telegram Rate Limit (429). Waiting ${delay}ms before retry ${attempt + 1}/${maxRetries}`);
      }
      // 2. Handle OpenAI Rate Limit
      else if (errorMsg.includes('Rate limit') || statusCode === 429) {
        delay = 60000; // Wait 60s for OpenAI rate limit as requested
        logger.warn(`[RETRY] OpenAI Rate Limit. Waiting 60s before retry ${attempt + 1}/${maxRetries}`);
      }
      // 3. Handle Network Errors or Generic Errors with Exponential Backoff + Jitter
      else {
        // Exponential backoff: baseDelay * 2^attempt
        const exponentialDelay = baseDelay * Math.pow(2, attempt);
        // Add random jitter (±20%)
        const jitter = exponentialDelay * 0.2 * Math.random();
        delay = exponentialDelay + jitter;
        
        logger.warn(`[RETRY] Attempt ${attempt + 1}/${maxRetries} failed: ${errorMsg}. Retrying in ${Math.round(delay)}ms...`);
      }

      await sleep(delay);
    }
  }

  logger.error(`[RETRY] All ${maxRetries} attempts failed.`);
  throw lastError;
}

module.exports = { retryWithBackoff };
